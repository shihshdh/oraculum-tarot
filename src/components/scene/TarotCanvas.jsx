import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Environment, Lightformer, PerformanceMonitor, Sparkles } from '@react-three/drei';
import { Bloom, ChromaticAberration, EffectComposer, Vignette } from '@react-three/postprocessing';
import { useTarotStore } from '../../store/useTarotStore';
import CardArray, { SLOT_SPACING, SLOT_Y } from './CardArray';
import { AstralSigil } from './Backdrop';
import { CARD_H, setMaxAnisotropy, sheenTime, warmCardTextures } from './cardKit';
import Room from './room/Room';
import Deck from './room/Deck';
import Gather from './room/Gather';
import { CAM0, cardRoot, lookLimits, viewFov } from './room/roomKit';
import { prefersReduced } from '../../lib/motion';
import { isTouchOnly } from '../../lib/device';
import { DESKTOP } from '../../lib/edition';

// 客户端版才有的效果：常量条件下的动态 import，网页版打包时整段会被剔除（光追库不进网页版）
const FlowLight = DESKTOP ? lazy(() => import('./desktop/FlowLight')) : null;
const RayTrace = DESKTOP ? lazy(() => import('./desktop/RayTrace')) : null;

// 显卡预算：
//   · 手机：分辨率最高 1.5 倍、不开 MSAA、不做桌面反射，用小图
//   · 客户端：至少 1.5 倍超采样（最高 2 倍）、8 倍 MSAA、更多光尘和泛光层级
// MSAA 和泛光层级在创建时定好、之后不变：改它们会重建整条后期管线，正是以前掉帧时"卡一下"的来源
const MOBILE = isTouchOnly();
const DPR = window.devicePixelRatio || 1;
const MAX_DPR = DESKTOP ? Math.min(Math.max(DPR, 1.5), 2) : Math.min(DPR, MOBILE ? 1.5 : 2);
const MSAA = MOBILE ? 0 : DESKTOP ? 8 : 4;
// ?norefl：关掉桌面反射（对比画面、排查性能用）
const NO_REFL = new URLSearchParams(window.location.search).has('norefl');

const probe = new THREE.Vector3();
const slotX = new Array(5).fill(-1);
let slotBottom = -1;
const SLOT_HALF_H = (CARD_H * 0.9) / 2;
const damp = (rate, dt) => 1 - Math.exp(-dt * rate);

/**
 * 镜头与牌阵的摆放。
 *
 * 镜头：站在照片的拍摄位置不动，只随指针/手势轻轻转头（左右最多约 6°、上下约 3.5°，再带一点点平移出视差），
 * 可转的范围按当前视角实时算出，永远不会转到照片以外；指针不动时有一口极慢的"呼吸"。
 * 光追累积时不转，端详时转得更少。
 *
 * 牌阵（cardRoot）：以前靠挪镜头做的事，现在都改成挪牌阵——
 *   · 竖屏：牌阵绕镜头等比缩小（和把镜头往后退看到的画面完全一样），五个卡位都能看全
 *   · 宽屏解读面板打开时往左让；手机底部抽屉打开时往上抬
 * 每帧把卡位投影到屏幕，写成 CSS 变量，DOM 上的牌名始终对准 3D 里的牌。
 */
function CameraRig({ reduced }) {
  const look = useRef({ yaw: 0, pitch: 0, x: 0, y: 0 });
  const fit = useRef({ s: 1, ox: 0, oy: 0 });
  useFrame(({ camera, size, clock }, dt) => {
    const st = useTarotStore.getState();
    const aspect = size.width / size.height;
    const fov = viewFov(aspect);
    if (Math.abs(camera.fov - fov) > 1e-3) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    const tanH = Math.tan((fov * Math.PI) / 360);

    // ---- 牌阵：等效于"镜头退到 targetZ、再平移 (ox, oy)" ----
    const targetZ = Math.max(7, Math.min(16, 3.5 / (tanH * aspect)));
    const viewH = 2 * targetZ * tanH;
    const docked = st.panelDocked;
    const ox = docked && size.width >= 1024 ? (230 / size.height) * viewH : 0;
    const oy = docked && size.width < 768 ? SLOT_Y - 0.27 * viewH - CAM0.y : 0;
    const f = fit.current;
    const k = damp(4, dt);
    f.s += (7 / targetZ - f.s) * damp(7, dt);
    f.ox += (ox - f.ox) * k;
    f.oy += (oy - f.oy) * k;
    const root = cardRoot.current;
    if (root) {
      // cardRoot 里的点 p 落在 CAM0 + s·(p − 旧镜头位置)，旧镜头位置 = (ox, CAM0.y + oy, targetZ)
      root.scale.setScalar(f.s);
      root.position.set(CAM0.x - f.s * f.ox, CAM0.y - f.s * (CAM0.y + f.oy), CAM0.z - f.s * targetZ);
      root.updateMatrixWorld();
    }

    // ---- 转头 ----
    const lim = lookLimits(fov, aspect);
    const still = reduced || st.rayTrace.status !== 'off';
    // 选牌、面板打开时转得少一些：牌阵要稳稳地待在留给它的那块画面里
    const amp = still ? 0 : st.inspectSlot !== null ? 0.3 : st.phase === 'selecting' || docked ? 0.4 : 1;
    // 竖屏左右几乎没有余量（五个卡位正好铺满宽度）：越窄转得越少
    const narrow = Math.pow(Math.min(1, aspect / 1.5), 1.5);
    const cx = st.cursor.visible ? st.cursor.x * 2 - 1 : 0;
    const cy = st.cursor.visible ? st.cursor.y * 2 - 1 : 0;
    const t = clock.elapsedTime;
    const breathe = still ? 0 : 1;
    const l = look.current;
    const kl = damp(2.4, dt); // 慢一点，像转头而不是甩镜头
    l.yaw += ((-cx * amp + Math.sin(t * 0.11) * 0.12 * breathe) * lim.yaw * narrow - l.yaw) * kl;
    l.pitch += (-cy * lim.pitch * amp + Math.sin(t * 0.17 + 1.3) * lim.pitch * 0.15 * breathe - l.pitch) * kl;
    l.x += (cx * 0.07 * amp * narrow - l.x) * kl;
    l.y += (-cy * 0.04 * amp - l.y) * kl;
    camera.position.set(CAM0.x + l.x, CAM0.y + l.y, CAM0.z);
    camera.rotation.set(l.pitch, l.yaw, 0, 'YXZ');
    camera.updateMatrixWorld();

    // 写在牌名层自己身上（写在 <html> 上会让整页每帧重算样式）
    const overlay = document.querySelector('[data-slot-overlay]');
    if (!overlay || !root) return;
    for (let i = 0; i < 5; i++) {
      probe.set((i - 2) * SLOT_SPACING, SLOT_Y, 0).applyMatrix4(root.matrixWorld).project(camera);
      const x = Math.round((probe.x * 0.5 + 0.5) * size.width);
      if (x !== slotX[i]) {
        slotX[i] = x;
        overlay.style.setProperty(`--slot-x-${i}`, `${x}px`);
      }
    }
    probe.set(0, SLOT_Y - SLOT_HALF_H, 0).applyMatrix4(root.matrixWorld).project(camera);
    const bottom = Math.round((0.5 - probe.y * 0.5) * size.height);
    if (bottom !== slotBottom) {
      slotBottom = bottom;
      overlay.style.setProperty('--slot-bottom', `${bottom}px`);
    }
  });
  return null;
}

/** 牌阵的根节点 */
function CardRoot({ children }) {
  const ref = useRef();
  useEffect(() => {
    cardRoot.current = ref.current;
    return () => { cardRoot.current = null; };
  }, []);
  return <group ref={ref}>{children}</group>;
}

/**
 * 烫金、描金边反射的环境：就用这间屋子。照片挂在前后两面（身后那面是暗一些的镜像，屋子另一头大致也是烛光与暗墙），
 * 再补几块发光板当作吊灯、桌上的蜡烛和窗外的月光。只渲染一次。
 */
function RoomEnvironment() {
  const tex = useLoader(THREE.TextureLoader, '/textures/room/room_sm.webp');
  tex.colorSpace = THREE.SRGBColorSpace;
  return (
    <Environment resolution={DESKTOP ? 1024 : 256} frames={1}>
      <color attach="background" args={['#07050a']} />
      <mesh position={[0, 0, -9]} scale={[27, 18, 1]}>
        <planeGeometry />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 9]} rotation={[0, Math.PI, 0]} scale={[27, 18, 1]}>
        <planeGeometry />
        <meshBasicMaterial map={tex} toneMapped={false} color="#9a8f9c" />
      </mesh>
      <Lightformer form="circle" intensity={4} color="#ffd9a0" position={[0, 7, -3]} scale={3} target={[0, 0, 0]} />
      <Lightformer form="circle" intensity={2.4} color="#ffc27a" position={[-3.5, 0.5, -5]} scale={0.8} target={[0, 0, 0]} />
      <Lightformer form="circle" intensity={2} color="#ffc27a" position={[4, 1, -5]} scale={0.6} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={0.9} color="#8ea2d8" position={[-8, 2, -2]} scale={[2, 5, 1]} target={[0, 0, 0]} />
    </Environment>
  );
}

function RendererSetup() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    setMaxAnisotropy(gl.capabilities.getMaxAnisotropy());
    if (DESKTOP) {
      const ctx = gl.getContext();
      const info = ctx.getExtension('WEBGL_debug_renderer_info');
      console.info('[ORACULUM] 显卡：', ctx.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : ctx.RENDERER));
    }
    warmCardTextures();
  }, [gl]);
  return null;
}

/** 牌背流光的时钟 */
function SheenClock() {
  useFrame(({ clock }) => { sheenTime.value = clock.elapsedTime; });
  return null;
}

export default function TarotCanvas() {
  const [contextLost, setContextLost] = useState(false);
  const [dpr, setDpr] = useState(MAX_DPR);
  // high | low：掉帧时自动降级。降级只关桌面反射、减光尘，不碰后期管线
  const [quality, setQuality] = useState(MOBILE ? 'low' : 'high');
  const reduced = prefersReduced();

  const handleCreated = ({ gl }) => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
    const canvas = gl.domElement;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault(); // 阻止默认行为，浏览器才会尝试恢复上下文
      console.warn('[TarotCanvas] WebGL 上下文丢失，等待恢复…');
      setContextLost(true);
    });
    canvas.addEventListener('webglcontextrestored', () => setContextLost(false));
  };

  return (
    <>
      <Canvas
        camera={{ position: CAM0.toArray(), fov: 50, near: 0.1, far: 200 }}
        dpr={dpr}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false }}
        onCreated={handleCreated}
      >
        {/* 帧率跟不上：先关反射、减光尘，再降分辨率；帧率恢复再加回来 */}
        <PerformanceMonitor
          // 客户端：光追着色器编译时会卡十几秒，不能因此把实时画面降到 1 倍；最低保留 1.25 倍超采样
          onDecline={() => {
            if (quality === 'high' && !DESKTOP) setQuality('low');
            else setDpr((d) => Math.max(DESKTOP ? 1.25 : 1, d - 0.25));
          }}
          onIncline={() => { setDpr((d) => Math.min(MAX_DPR, d + 0.25)); if (!MOBILE) setQuality('high'); }}
          flipflops={3}
          onFallback={() => { setDpr(DESKTOP ? 1.25 : 1); setQuality('low'); }}
        />
        <RendererSetup />
        <CameraRig reduced={reduced} />
        {DESKTOP && <SheenClock />}

        <Suspense fallback={null}>
          <Room mobile={MOBILE} reflect={quality === 'high' && !NO_REFL} />
          <RoomEnvironment />
          <Deck />
          <Gather />
        </Suspense>

        {/* 烛光里的浮尘 */}
        <Sparkles count={DESKTOP ? 260 : quality === 'high' ? 120 : 50} scale={[14, 7, 6]} position={[0, 0.3, 0]} size={1.8} speed={reduced ? 0 : 0.18} opacity={0.4} color="#f3d49a" noise={0.8} />

        {/* 牌的光：左上方烛台和吊灯的暖光为主，左边窗外一点冷月光勾边 */}
        <ambientLight intensity={0.28} color="#d8c8e8" />
        <directionalLight position={[-3, 5, 6]} intensity={1.5} color="#ffdcae" />
        <directionalLight position={[-7, 1, -1]} intensity={0.45} color="#9fb3ff" />
        <pointLight position={[2.5, -1.5, 3.5]} intensity={3} distance={12} color="#ffc98a" />

        <CardRoot>
          <AstralSigil />
          <Suspense fallback={null}>
            <CardArray />
          </Suspense>
          {DESKTOP && (
            <Suspense fallback={null}>
              <FlowLight />
            </Suspense>
          )}
        </CardRoot>
        {DESKTOP && (
          <Suspense fallback={null}>
            <RayTrace />
          </Suspense>
        )}

        <EffectComposer multisampling={MSAA} disableNormalPass>
          <Bloom intensity={DESKTOP ? 1.0 : 0.85} luminanceThreshold={0.72} luminanceSmoothing={0.22} mipmapBlur levels={MOBILE ? 6 : DESKTOP ? 9 : 8} radius={DESKTOP ? 0.8 : 0.72} />
          {DESKTOP ? <ChromaticAberration offset={[0.0005, 0.0003]} radialModulation modulationOffset={0.4} /> : <></>}
          <Vignette offset={0.3} darkness={0.55} />
        </EffectComposer>
      </Canvas>

      {contextLost && (
        <div className="fixed inset-0 z-[120] flex flex-col items-center justify-center text-center pointer-events-auto" style={{ background: 'rgba(5,4,12,0.8)', backdropFilter: 'blur(6px)' }} data-no-card-click>
          <p role="alert" style={{ color: 'var(--ink2)', fontSize: 14, letterSpacing: '0.08em', marginBottom: 16 }}>画面渲染中断了（显卡上下文丢失）</p>
          <button onClick={() => window.location.reload()} className="glass-btn is-primary is-lg">恢复画面</button>
        </div>
      )}
    </>
  );
}

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, lazy, useEffect, useState } from 'react';
import * as THREE from 'three';
import { Environment, Lightformer, PerformanceMonitor, Sparkles } from '@react-three/drei';
import { Bloom, ChromaticAberration, EffectComposer, Noise, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { useTarotStore } from '../../store/useTarotStore';
import CardArray, { SLOT_SPACING, SLOT_Y } from './CardArray';
import { AstralSigil, Nebula } from './Backdrop';
import { CARD_H, setMaxAnisotropy, sheenTime, warmCardTextures } from './cardKit';
import { prefersReduced } from '../../lib/motion';
import { isTouchOnly } from '../../lib/device';
import { DESKTOP } from '../../lib/edition';

// 客户端版才有的效果：常量条件下的动态 import，网页版打包时整段会被剔除（光追库不进网页版）
const FlowLight = DESKTOP ? lazy(() => import('./desktop/FlowLight')) : null;
const RayTrace = DESKTOP ? lazy(() => import('./desktop/RayTrace')) : null;
const Altar = DESKTOP ? lazy(() => import('./desktop/Altar')) : null;

// 显卡预算：
//   · 手机：分辨率最高 1.5 倍、从低画质起步（不开 MSAA），帧率够再往上加
//   · 客户端：至少 1.5 倍超采样（最高 2 倍）、8 倍 MSAA、更多粒子和泛光层级
const MOBILE = isTouchOnly();
const DPR = window.devicePixelRatio || 1;
const MAX_DPR = DESKTOP ? Math.min(Math.max(DPR, 1.5), 2) : Math.min(DPR, MOBILE ? 1.5 : 2);
const MSAA = DESKTOP ? 8 : 4;

const probe = new THREE.Vector3();
const slotX = new Array(5).fill(-1);
let slotBottom = -1;
const SLOT_HALF_H = (CARD_H * 0.9) / 2;

/**
 * 镜头：
 *   · 宽屏解读面板打开时往右挪，让牌阵落在面板左边的空间中央
 *   · 竖屏往后退，保证五个卡位都在画面里；底部抽屉打开时往下移，把牌阵抬到上半屏
 *   · 指针移动时镜头轻微跟随（视差），让场景有纵深
 *   · 每帧把卡位投影到屏幕，写成 CSS 变量，DOM 上的牌名始终对准 3D 里的牌
 */
function CameraRig({ reduced }) {
  useFrame(({ camera, size, pointer }, dt) => {
    const docked = useTarotStore.getState().panelDocked;
    const viewH = 2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360);
    const k = 1 - Math.exp(-dt * 4);

    const aspect = size.width / size.height;
    const targetZ = Math.max(7, Math.min(16, 3.5 / (Math.tan((camera.fov * Math.PI) / 360) * aspect)));
    camera.position.z += (targetZ - camera.position.z) * (1 - Math.exp(-dt * 7));

    // 光追累积时镜头不跟指针晃（一动就要从头累积）
    const parallax = reduced || useTarotStore.getState().rayTrace.status !== 'off' ? 0 : 0.18;
    const tx = (docked && size.width >= 1024 ? (230 / size.height) * viewH : 0) + pointer.x * parallax;
    const ty = (docked && size.width < 768 ? SLOT_Y - 0.27 * viewH : -0.2) + pointer.y * parallax * 0.6;
    camera.position.x += (tx - camera.position.x) * k;
    camera.position.y += (ty - camera.position.y) * k;
    camera.updateMatrixWorld();

    // 写在牌名层自己身上（写在 <html> 上会让整页每帧重算样式）
    const root = document.querySelector('[data-slot-overlay]');
    if (!root) return;
    for (let i = 0; i < 5; i++) {
      probe.set((i - 2) * SLOT_SPACING, SLOT_Y, 0).project(camera);
      const x = Math.round((probe.x * 0.5 + 0.5) * size.width);
      if (x !== slotX[i]) {
        slotX[i] = x;
        root.style.setProperty(`--slot-x-${i}`, `${x}px`);
      }
    }
    probe.set(0, SLOT_Y - SLOT_HALF_H, 0).project(camera);
    const bottom = Math.round((0.5 - probe.y * 0.5) * size.height);
    if (bottom !== slotBottom) {
      slotBottom = bottom;
      root.style.setProperty('--slot-bottom', `${bottom}px`);
    }
  });
  return null;
}

/** 牌背的烫金要有东西可以反射：用几块发光板搭一个"工作室"环境，不用联网下载 HDR。 */
function Studio() {
  return (
    <Environment resolution={DESKTOP ? 1024 : 256} frames={1}>
      <color attach="background" args={['#0d0a12']} />
      <Lightformer form="rect" intensity={3.2} color="#ffe2b0" position={[-4, 4, 3]} scale={[6, 3, 1]} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={1.3} color="#d9d0ee" position={[5, -1, 2]} scale={[3, 6, 1]} target={[0, 0, 0]} />
      <Lightformer form="ring" intensity={2.4} color="#fff3d6" position={[0, 2, 6]} scale={3} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={0.8} color="#5a4a33" position={[0, -5, -2]} scale={[10, 2, 1]} target={[0, 0, 0]} />
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
  const [quality, setQuality] = useState(MOBILE ? 'low' : 'high'); // high | low：掉帧时自动降级
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
        camera={{ position: [0, -0.2, 7], fov: 50, near: 0.1, far: 60 }}
        dpr={dpr}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false }}
        onCreated={handleCreated}
      >
        {/* 帧率跟不上就先降分辨率，再关掉最贵的效果；帧率恢复再加回来 */}
        <PerformanceMonitor
          // 客户端：光追着色器编译时会卡十几秒，不能因此把实时画面降到 1 倍；最低保留 1.25 倍超采样
          onDecline={() => { setDpr((d) => Math.max(DESKTOP ? 1.25 : 1, d - 0.5)); if (!DESKTOP) setQuality('low'); }}
          onIncline={() => { setDpr((d) => Math.min(MAX_DPR, d + 0.25)); if (!MOBILE) setQuality('high'); }}
          flipflops={3}
          onFallback={() => { setDpr(DESKTOP ? 1.25 : 1); setQuality('low'); }}
        />
        <RendererSetup />
        <CameraRig reduced={reduced} />
        {DESKTOP && <SheenClock />}

        <Nebula />
        <AstralSigil position={[0, SLOT_Y, -0.9]} />
        <Sparkles count={DESKTOP ? (quality === 'high' ? 520 : 220) : quality === 'high' ? 160 : 60} scale={[16, 9, 5]} position={[0, 0, -1.5]} size={2.2} speed={reduced ? 0 : 0.25} opacity={0.55} color="#f3d49a" noise={0.6} />
        {DESKTOP && (
          <>
            {/* 近处一层更大、更慢的冷色光尘，拉出纵深 */}
            <Sparkles count={quality === 'high' ? 90 : 40} scale={[14, 7, 3]} position={[0, -0.5, 1.2]} size={5} speed={reduced ? 0 : 0.12} opacity={0.35} color="#efe2c4" noise={1.2} />
            <Suspense fallback={null}>
              <FlowLight />
            </Suspense>
          </>
        )}

        <ambientLight intensity={0.35} />
        <directionalLight position={[-3, 4, 6]} intensity={1.6} color="#ffe9c7" />
        <pointLight position={[3, -2, 4]} intensity={4} distance={14} color="#d6ccef" />

        <Suspense fallback={null}>
          <Studio />
          <CardArray />
        </Suspense>
        {DESKTOP && (
          <Suspense fallback={null}>
            <Altar />
            <RayTrace />
          </Suspense>
        )}

        <EffectComposer multisampling={quality === 'high' ? MSAA : 0} disableNormalPass>
          <Bloom intensity={DESKTOP ? 1.05 : 0.8} luminanceThreshold={DESKTOP ? 0.62 : 0.7} luminanceSmoothing={0.2} mipmapBlur levels={quality === 'high' ? (DESKTOP ? 9 : 8) : 5} radius={DESKTOP ? 0.82 : 0.75} />
          {DESKTOP ? <ChromaticAberration offset={[0.0006, 0.0004]} radialModulation modulationOffset={0.35} /> : <></>}
          <Vignette offset={0.28} darkness={0.72} />
          <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.18} />
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

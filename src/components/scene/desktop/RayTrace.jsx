import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { WebGLPathTracer, PhysicalCamera } from 'three-gpu-pathtracer';
import { useTarotStore } from '../../../store/useTarotStore';
import { TAROT_DECK } from '../../../data/tarotDeck';
import { SLOT_SPACING, SLOT_Y } from '../CardArray';
import { cardRoot } from '../room/roomKit';
import { FACE_OFFSET, backTexture, cardBodyGeometry, cardFaceGeometry, faceTexture, foilTexture } from '../cardKit';

/**
 * 光追（客户端版）：五张牌翻开、动画结束后，用 GPU 路径追踪把牌阵重新渲染一遍。
 *
 *   · 另建一个只含"实体"的场景：同样的牌身、牌面贴图、描金边，与实时画面里的牌阵同一个根节点变换；
 *     两盏柔光面光源 + 一张程序生成的环境贴图（占卜室的暖色烛光 + 窗外冷色月光）
 *   · 桌面、倒影由实时画面的占卜室（照片重构 + 平面反射）提供，光追只负责牌本身
 *   · 每帧追一批光线、逐帧累积：反射、柔和阴影、金边的互相映照、镜面台上的倒影都是真的光线算出来的
 *   · 背景透明，星云、星盘、流光仍由实时渲染画在下面；光追结果从 0 渐变盖上去
 *   · 镜头一动（解读面板停靠、窗口改变大小）就重新累积；累积够了停下，不再占显卡
 */
const MAX_SAMPLES = 2000;
const START_DELAY = 3200; // 等最后一张牌翻完、粒子散去

/** 程序生成的等距柱状环境贴图：深紫夜色，左上一块暖色柔光箱，右侧一条冷紫轮廓光，下方很暗 */
function makeEnvironment() {
  const W = 512;
  const H = 256;
  const data = new Float32Array(W * H * 4);
  const box = (u, v, cu, cv, su, sv) => Math.exp(-(((u - cu) / su) ** 2 + ((v - cv) / sv) ** 2));
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1); // 0 = 下方，1 = 上方（DataTexture 从下往上）
    for (let x = 0; x < W; x++) {
      const u = x / (W - 1);
      const sky = 0.02 + 0.05 * v;
      // 热点宽而柔：太小太亮的光斑会在清漆反射里变成难收敛的"萤火虫"噪点
      const warm = box(u, v, 0.38, 0.78, 0.12, 0.12) * 3.2;
      const warm2 = box(u, v, 0.62, 0.7, 0.09, 0.08) * 1.6;
      const rim = box(u, v, 0.85, 0.55, 0.06, 0.25) * 1.6;
      const i = (y * W + x) * 4;
      data[i] = sky * 0.7 + warm * 1.0 + warm2 * 1.0 + rim * 0.62;
      data[i + 1] = sky * 0.62 + warm * 0.82 + warm2 * 0.9 + rim * 0.55;
      data[i + 2] = sky * 0.7 + warm * 0.55 + warm2 * 0.7 + rim * 1.0;
      data[i + 3] = 1;
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** 等纹理真正加载完（路径追踪要把贴图打包进图集，半截的贴图会变黑） */
function loaded(tex) {
  return new Promise((resolve) => {
    const img = tex.image;
    if (img && (img.complete === undefined || img.complete) && img.width) return resolve();
    const check = setInterval(() => {
      const im = tex.image;
      if (im && im.width && (im.complete === undefined || im.complete)) {
        clearInterval(check);
        resolve();
      }
    }, 50);
  });
}

/**
 * 路径追踪会把所有几何体合并成一个大网格：一个物体配多种材质（geometry.groups）时，
 * 这个版本的库会把材质编号对错，牌面贴图串到别的牌、镜面台上。
 * 所以把每个 group 拆成独立的非索引几何体，一个网格只用一种材质；属性也统一成 position/normal/uv。
 */
function splitGroups(geometry) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: flat.attributes.position.count, materialIndex: 0 }];
  // 非索引化之后 group 的 start/count 按顶点算，与原来按索引算的一致
  return groups.map((g) => {
    const part = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const attr = flat.attributes[name];
      const size = attr.itemSize;
      part.setAttribute(name, new THREE.BufferAttribute(attr.array.slice(g.start * size, (g.start + g.count) * size), size));
    }
    return { geometry: part, materialIndex: g.materialIndex };
  });
}

function solid(geometry) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const part = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) part.setAttribute(name, flat.attributes[name].clone());
  return part;
}

async function buildScene(cards) {
  const scene = new THREE.Scene();
  const back = backTexture();
  const foil = foilTexture();
  const faces = cards.map((c) => faceTexture(TAROT_DECK.find((t) => t.id === c.tarotId)));
  await Promise.all([back, foil, ...faces].map(loaded));

  const backMat = new THREE.MeshPhysicalMaterial({ map: back, metalnessMap: foil, metalness: 1, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.15 });
  const edgeMat = new THREE.MeshPhysicalMaterial({ color: '#d9b36a', metalness: 1, roughness: 0.22 });
  const bodyParts = splitGroups(cardBodyGeometry());
  const faceGeo = solid(cardFaceGeometry());
  // 与实时画面里的牌阵同一个变换（窄屏缩放、面板让位）
  const root = new THREE.Group();
  if (cardRoot.current) root.matrix.copy(cardRoot.current.matrixWorld);
  root.matrixAutoUpdate = false;
  scene.add(root);

  cards.forEach((card, i) => {
    const group = new THREE.Group();
    group.position.set((i - 2) * SLOT_SPACING, SLOT_Y, 0);
    group.scale.setScalar(0.9);
    group.rotation.set(0, Math.PI, card.reversed ? Math.PI : 0);
    for (const part of bodyParts) group.add(new THREE.Mesh(part.geometry, part.materialIndex === 0 ? backMat : edgeMat));
    const faceMat = new THREE.MeshPhysicalMaterial({ map: faces[i], roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.25 });
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.position.z = -FACE_OFFSET;
    face.rotation.y = Math.PI;
    group.add(face);
    root.add(group);
  });

  // 面光源：左上暖色主光、右下冷紫轮廓光
  const key = new THREE.RectAreaLight('#ffe2b0', 14, 3.2, 1.6);
  key.position.set(-3.5, SLOT_Y + 4, 4.5);
  key.lookAt(0, SLOT_Y, 0);
  root.add(key);
  const fill = new THREE.RectAreaLight('#d6ccef', 5, 1.2, 4);
  fill.position.set(5, SLOT_Y + 0.5, 2.5);
  fill.lookAt(0, SLOT_Y, 0);
  root.add(fill);

  scene.environment = makeEnvironment();
  scene.environmentIntensity = 0.9;
  scene.background = null;
  return scene;
}

/**
 * 把实时画面的镜头同步给光追镜头。不能用 PhysicalCamera.copy()：它会把光圈、焦距等景深参数
 * 从普通透视镜头上"复制"成 undefined，光线全部算成 NaN，结果一片空白。
 */
function syncCamera(dst, src) {
  dst.position.copy(src.position);
  dst.quaternion.copy(src.quaternion);
  dst.fov = src.fov;
  dst.aspect = src.aspect;
  dst.near = src.near;
  dst.far = src.far;
  dst.updateProjectionMatrix();
  dst.updateMatrixWorld(true);
}

/** 镜头的缓动是指数逼近、永远不会"完全停住"：小于万分之一的变化不算动，否则光追会一直从头累积 */
function moved(a, b) {
  for (let i = 0; i < 16; i++) if (Math.abs(a.elements[i] - b.elements[i]) > 1e-4) return true;
  return false;
}

export default function RayTrace() {
  const { camera, size } = useThree();
  const state = useRef(null); // { canvas, renderer, tracer, scene, cam, lastMatrix }
  const setRayTrace = useTarotStore((s) => s.setRayTrace);

  // 覆盖在实时画面上的第二块画布（透明背景）
  useEffect(() => {
    const host = document.querySelector('#app-root > div');
    if (!host) return;
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', opacity: '0', transition: 'opacity 900ms ease' });
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance', premultipliedAlpha: false });
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    state.current = { canvas, renderer, tracer: null, scene: null, cam: null, lastMatrix: new THREE.Matrix4(), token: 0 };
    return () => {
      const s = state.current;
      try { s.tracer?.dispose(); } catch {}
      renderer.dispose();
      canvas.remove();
      state.current = null;
      setRayTrace({ status: 'off', samples: 0 });
    };
  }, [setRayTrace]);

  // 画布尺寸跟随窗口
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    s.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    s.renderer.setSize(size.width, size.height, false);
    s.tracer?.reset();
  }, [size]);

  // 五张牌翻开后开始光追；回到别的阶段就撤下
  useEffect(() => {
    let timer = 0;
    const stop = () => {
      clearTimeout(timer);
      const s = state.current;
      if (!s) return;
      s.token++;
      s.canvas.style.opacity = '0';
      if (s.tracer) {
        const old = s.tracer;
        s.tracer = null;
        setTimeout(() => { try { old.dispose(); } catch {} }, 950);
      }
      setRayTrace({ status: 'off', samples: 0 });
    };
    const start = () => {
      stop();
      const s = state.current;
      if (!s) return;
      const token = s.token;
      timer = setTimeout(async () => {
        const st = useTarotStore.getState();
        if (st.phase !== 'done' || !st.cards.every((c) => c.flipped && c.tarotId)) return;
        setRayTrace({ status: 'building', samples: 0 });
        try {
          const scene = await buildScene(st.cards);
          if (!state.current || state.current.token !== token) return;
          const cam = new PhysicalCamera(camera.fov, size.width / size.height, camera.near, camera.far);
          syncCamera(cam, camera);
          const tracer = new WebGLPathTracer(s.renderer);
          tracer.bounces = 6;
          tracer.transmissiveBounces = 4;
          tracer.filterGlossyFactor = 1; // 压住光泽反射里的萤火虫噪点
          tracer.tiles.set(2, 2); // 分块渲染：每帧只追四分之一画面，界面保持流畅
          tracer.minSamples = 3;
          tracer.fadeDuration = 0; // 渐变交给画布的 CSS opacity
          tracer.rasterizeScene = false;
          tracer.renderDelay = 0;
          tracer.setScene(scene, cam); // 场景只有几千个三角形，同步建 BVH 只要几毫秒
          if (!state.current || state.current.token !== token) { tracer.dispose(); return; }
          s.scene = scene;
          s.cam = cam;
          s.tracer = tracer;
          s.lastMatrix.copy(camera.matrixWorld);
          setRayTrace({ status: 'tracing', samples: 0 });
        } catch (e) {
          console.warn('[RayTrace] 光追初始化失败，保持实时画面：', e);
          setRayTrace({ status: 'off', samples: 0 });
        }
      }, START_DELAY);
    };

    const check = (st) => st.phase === 'done' && st.cards.every((c) => c.flipped && c.tarotId);
    if (check(useTarotStore.getState())) start();
    const unsub = useTarotStore.subscribe(
      (st) => check(st),
      (ready) => (ready ? start() : stop())
    );
    return () => {
      unsub();
      stop();
    };
  }, [camera, setRayTrace]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastReport = useRef(0);
  useFrame(() => {
    const s = state.current;
    if (!s || !s.tracer) return;
    // 端详时牌离开了桌面，光追画面里它还在原位：先藏起来，放回后接着显示（场景没变，不用重新累积）
    if (useTarotStore.getState().inspectSlot !== null) {
      s.canvas.style.opacity = '0';
      return;
    }
    // 镜头动了（面板停靠、窗口改变）：同步镜头并重新累积
    // 牌阵根节点变了（面板停靠让位）：光追场景里的牌也要跟过去
    const rootNow = cardRoot.current?.matrixWorld;
    const rootGroup = s.scene?.children[0];
    if (rootNow && rootGroup && moved(rootGroup.matrix, rootNow)) {
      rootGroup.matrix.copy(rootNow);
      rootGroup.updateMatrixWorld(true);
      s.tracer.setScene(s.scene, s.cam);
      s.tracer.reset();
    }
    if (moved(s.lastMatrix, camera.matrixWorld) || s.cam.aspect !== camera.aspect) {
      syncCamera(s.cam, camera);
      s.lastMatrix.copy(camera.matrixWorld);
      s.tracer.setCamera(s.cam);
      s.tracer.reset();
    }
    const samples = s.tracer.samples;
    const status = useTarotStore.getState().rayTrace.status;
    if (samples >= MAX_SAMPLES) {
      s.canvas.style.opacity = '1';
      if (useTarotStore.getState().rayTrace.status !== 'done') setRayTrace({ status: 'done', samples: Math.floor(samples) });
      return;
    }
    s.tracer.renderSample();
    if (s.tracer.isCompiling) {
      // 路径追踪的着色器很大，第一次编译要十几秒（之后有缓存）
      if (status !== 'compiling') setRayTrace({ status: 'compiling', samples: 0 });
      return;
    }
    if (samples >= 3) s.canvas.style.opacity = '1';
    const now = performance.now();
    if (status !== 'tracing' || now - lastReport.current > 500) {
      lastReport.current = now;
      setRayTrace({ status: 'tracing', samples: Math.floor(samples) });
    }
  });

  return null;
}

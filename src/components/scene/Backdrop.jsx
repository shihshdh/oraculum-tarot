import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useTarotStore } from '../../store/useTarotStore';
import { prefersReduced } from '../../lib/motion';

/**
 * 场景背景，全部在 GPU 上画：
 *   · Nebula：分形噪声的星云（深靛 / 紫 / 一缕金），低分辨率画、隔帧更新；星星在全分辨率的第二遍里画
 *   · AstralSigil：牌阵下方的星盘法阵——同心圆、刻度、十二宫、旋转的六芒星，翻牌后亮起
 */

const nebulaVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const NOISE = /* glsl */ `
  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.03 + 0.17; a *= 0.5; }
    return v;
  }
`;

// 第一遍：星云本体。又软又慢，所以只在约 1/3 分辨率下画、隔帧更新——这是整个场景最贵的一块，
// 这样处理后像素工作量降到原来的约 1/18。alpha 里存星云密度，给第二遍调星星亮度用。
const nebulaFragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uAspect;
  uniform vec2 uPointer;
  uniform float uEnergy;
  ${NOISE}
  void main() {
    vec2 uv = (vUv - 0.5) * uAspect;
    float t = uTime * 0.018;
    vec2 p = uv * 1.15 + uPointer * 0.05;
    // 域扭曲让星云有丝缕感
    vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
    vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + t * 1.5), fbm(p + 3.0 * q + vec2(8.3, 2.8)));
    float n = fbm(p + 2.5 * r);
    vec3 deep = vec3(0.022, 0.016, 0.055);
    vec3 indigo = vec3(0.06, 0.045, 0.16);
    vec3 violet = vec3(0.19, 0.11, 0.30);
    vec3 gold = vec3(0.95, 0.72, 0.38);
    vec3 col = mix(deep, indigo, smoothstep(0.2, 0.75, n));
    col = mix(col, violet, smoothstep(0.6, 1.0, n) * 0.4 * length(q) * (0.5 + uEnergy * 0.5));
    // 一缕金色气流
    float wisp = smoothstep(0.62, 0.95, fbm(p * 1.4 + r * 1.8 - t * 2.0)) * smoothstep(0.9, 0.1, abs(uv.y + 0.15 + sin(uv.x * 1.3) * 0.18));
    col += gold * wisp * (0.10 + uEnergy * 0.12);
    gl_FragColor = vec4(col, n);
  }
`;

// 第二遍：全分辨率。取星云贴图，叠上清晰的星星和暗角（星星必须全分辨率，否则会糊）。
const skyFragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uNebula;
  uniform float uTime;
  uniform vec2 uAspect;
  uniform vec2 uPointer;
  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  // 一层星星：网格里每格一颗，随机亮度与闪烁
  float stars(vec2 p, float scale, float t) {
    vec2 g = p * scale;
    vec2 id = floor(g), f = fract(g) - 0.5;
    float h = hash(id);
    vec2 o = vec2(hash(id + 7.1), hash(id + 3.7)) - 0.5;
    float d = length(f - o * 0.7);
    float size = 0.015 + h * h * 0.04;
    float tw = 0.55 + 0.45 * sin(t * (0.6 + h * 2.5) + h * 40.0);
    return smoothstep(size, 0.0, d) * step(0.8, h) * tw;
  }
  void main() {
    vec4 neb = texture2D(uNebula, vUv);
    vec2 uv = (vUv - 0.5) * uAspect;
    vec2 sp = uv + uPointer * 0.01;
    float s = stars(sp, 38.0, uTime) * 0.55 + stars(sp + uPointer * 0.012 + 3.1, 22.0, uTime * 1.3) * 0.8 + stars(sp + uPointer * 0.025 + 7.7, 11.0, uTime * 0.8);
    vec3 col = neb.rgb + vec3(1.0, 0.95, 0.86) * s * (0.45 + neb.a * 0.6);
    float v = smoothstep(1.35, 0.25, length(uv * vec2(0.85, 1.1)));
    col *= mix(0.35, 1.0, v);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const fullscreenVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }
`;

export function Nebula() {
  const ref = useRef();
  const { viewport, camera, gl, size } = useThree();
  const reduced = useMemo(() => prefersReduced(), []);
  const shared = useMemo(() => ({
    uTime: { value: 0 }, uAspect: { value: new THREE.Vector2(1, 1) }, uPointer: { value: new THREE.Vector2() }, uEnergy: { value: 0 },
  }), []);
  // 低分辨率的星云画布 + 它自己的一个全屏三角形
  const offscreen = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false, stencilBuffer: false, type: THREE.HalfFloatType });
    const scene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ vertexShader: fullscreenVertex, fragmentShader: nebulaFragment, uniforms: shared, depthTest: false, depthWrite: false }));
    quad.frustumCulled = false;
    scene.add(quad);
    return { target, scene, camera: new THREE.Camera() };
  }, [shared]);
  const skyUniforms = useMemo(() => ({ ...shared, uNebula: { value: offscreen.target.texture } }), [shared, offscreen]);
  useEffect(() => () => offscreen.target.dispose(), [offscreen]);
  useEffect(() => {
    offscreen.target.setSize(Math.max(64, Math.round(size.width / 3)), Math.max(64, Math.round(size.height / 3)));
  }, [size.width, size.height, offscreen]);

  const frameNo = useRef(0);
  const Z = -14;
  useFrame(({ pointer, clock }, dt) => {
    const m = ref.current;
    if (!m) return;
    // 平面始终铺满镜头视野（镜头会前后移动）
    const dist = camera.position.z - Z;
    const h = 2 * dist * Math.tan((camera.fov * Math.PI) / 360) * 1.08;
    m.scale.set(h * viewport.aspect, h, 1);
    m.position.set(camera.position.x, camera.position.y, Z);
    shared.uAspect.value.set(viewport.aspect, 1);
    if (!reduced) shared.uTime.value = clock.elapsedTime;
    shared.uPointer.value.lerp(pointer, 1 - Math.exp(-dt * 2));
    const phase = useTarotStore.getState().phase;
    const energy = phase === 'done' ? 1 : phase === 'selecting' ? 0.5 : 0.2;
    shared.uEnergy.value += (energy - shared.uEnergy.value) * (1 - Math.exp(-dt));
    // 星云变化很慢：隔帧重画一次就够了
    if (frameNo.current++ % 2 === 0) {
      const prev = gl.getRenderTarget();
      gl.setRenderTarget(offscreen.target);
      gl.render(offscreen.scene, offscreen.camera);
      gl.setRenderTarget(prev);
    }
  });

  return (
    <mesh ref={ref} renderOrder={-10} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial vertexShader={nebulaVertex} fragmentShader={skyFragment} uniforms={skyUniforms} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

const sigilFragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uGlow;
  #define PI 3.14159265

  float ring(float r, float radius, float w) { return smoothstep(w, 0.0, abs(r - radius)); }
  float segment(vec2 p, vec2 a, vec2 b, float w) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return smoothstep(w, 0.0, length(pa - ba * h));
  }
  mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    float t = uTime;
    float px = fwidth(r) * 1.2;
    float v = 0.0;

    // 同心圆
    v += ring(r, 0.97, px) * 0.8 + ring(r, 0.935, px) * 0.45 + ring(r, 0.72, px) * 0.55 + ring(r, 0.44, px) * 0.45 + ring(r, 0.2, px) * 0.4;
    // 外圈刻度（缓慢逆时针）：按角度算线宽，保证每条刻度都是一像素左右的细线，不会糊成一条带子
    float aa = a + t * 0.02;
    float arcPx = px / max(r, 0.01);
    float tick72 = abs(fract(aa / (2.0 * PI) * 72.0 + 0.5) - 0.5) * (2.0 * PI / 72.0);
    float tick12 = abs(fract(aa / (2.0 * PI) * 12.0 + 0.5) - 0.5) * (2.0 * PI / 12.0);
    v += smoothstep(arcPx * 1.2, 0.0, tick72) * step(0.94, r) * step(r, 0.965) * 0.45;
    v += smoothstep(arcPx * 1.6, 0.0, tick12) * step(0.9, r) * step(r, 0.97) * 0.9;
    // 十二宫：小圆点落在 0.82 圈上
    float ab = a - t * 0.03;
    float cell = floor((ab / (2.0 * PI)) * 12.0 + 0.5);
    float ca = cell / 12.0 * 2.0 * PI;
    vec2 cp = vec2(cos(ca + t * 0.03), sin(ca + t * 0.03)) * 0.82;
    v += ring(length(p - cp), 0.045, px) * 0.9;
    // 旋转的六芒星（两个三角形）
    vec2 q = rot(t * 0.05) * p;
    for (int k = 0; k < 2; k++) {
      float off = float(k) * PI / 3.0;
      for (int i = 0; i < 3; i++) {
        float a0 = off + float(i) * 2.0 * PI / 3.0 + PI / 2.0;
        float a1 = off + float(i + 1) * 2.0 * PI / 3.0 + PI / 2.0;
        v += segment(q, vec2(cos(a0), sin(a0)) * 0.72, vec2(cos(a1), sin(a1)) * 0.72, px) * 0.55;
      }
    }
    // 中心放射线
    float rays = pow(abs(cos(a * 16.0 + t * 0.1)), 40.0) * smoothstep(0.44, 0.2, r) * step(0.2, r);
    v += rays * 0.35;

    float fade = smoothstep(1.0, 0.9, r);
    float pulse = 0.85 + 0.15 * sin(t * 1.3);
    vec3 gold = vec3(1.0, 0.8, 0.48);
    float alpha = v * fade * uGlow * 0.42 * pulse;
    // 中心一团柔光
    alpha += smoothstep(0.75, 0.0, r) * 0.04 * uGlow;
    gl_FragColor = vec4(gold * (0.9 + uGlow * 0.9), alpha);
  }
`;

export function AstralSigil({ position = [0, -1.5, -1.6], size = 7.4 }) {
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uGlow: { value: 0 } }), []);
  const reduced = useMemo(() => prefersReduced(), []);
  const ref = useRef();

  const TILT = 0.35;
  useFrame(({ clock, camera }, dt) => {
    if (!reduced) uniforms.uTime.value = clock.elapsedTime;
    const phase = useTarotStore.getState().phase;
    // 让整个法阵始终完整地落在画面里：算出它所在深度的可视范围，
    // 先把圆心往上挪（最多挪到画面中央），还放不下就缩小
    const m = ref.current;
    if (m) {
      const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
      const dist = camera.position.z - position[2];
      const halfH = dist * tanHalf;
      const halfW = halfH * camera.aspect;
      const margin = 0.86; // 法阵后倾，下半部离镜头更近、透视上更大：多留一点边
      const squash = Math.cos(TILT); // 法阵向后倾，竖直方向会被压扁一点
      const top = camera.position.y + halfH;
      // 手机上解读面板是底部抽屉（盖住下面约 55%）：法阵只放在它上方露出来的部分
      const sheet = useTarotStore.getState().panelDocked && camera.aspect < 0.9;
      const bottom = sheet ? top - halfH * 0.9 : camera.position.y - halfH;
      const mid = (top + bottom) / 2;
      let r = size / 2;
      r = Math.min(r, (halfW - Math.abs(position[0] - camera.position.x)) * margin);
      r = Math.min(r, ((top - bottom) / 2) * margin / squash);
      const cy = Math.min(Math.max(position[1], bottom + (r * squash) / margin), mid);
      const k = 1 - Math.exp(-dt * 6);
      m.scale.setScalar(m.scale.x + (r * 2 - m.scale.x) * k);
      m.position.y += (cy - m.position.y) * k;
    }
    const target = phase === 'done' ? 1 : phase === 'selecting' || phase === 'revealing' ? 0.45 : 0;
    uniforms.uGlow.value += (target - uniforms.uGlow.value) * (1 - Math.exp(-dt * 1.2));
    if (ref.current) ref.current.visible = uniforms.uGlow.value > 0.02 || phase !== 'splash';
  });

  return (
    <mesh ref={ref} position={position} scale={size} rotation={[-TILT, 0, 0]} renderOrder={-5}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        vertexShader={nebulaVertex}
        fragmentShader={sigilFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

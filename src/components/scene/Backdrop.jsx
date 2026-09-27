import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useTarotStore } from '../../store/useTarotStore';
import { prefersReduced } from '../../lib/motion';
import { sceneLights } from './room/roomKit';

/**
 * AstralSigil：悬在牌阵后方半空中的星盘法阵——同心圆、刻度、十二宫、旋转的六芒星，全部在 GPU 上画。
 * 牌组点开时被点燃，之后常亮，翻牌后更亮；它是真的光源：金光照亮桌面和墙面，也会倒映在桌上。
 */

const planeVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
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

const tmp = new THREE.Vector3();

export function AstralSigil({ position = [0, 0.1, -2.3], size = 6.6 }) {
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uGlow: { value: 0 } }), []);
  const reduced = useMemo(() => prefersReduced(), []);
  const ref = useRef();

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    if (!reduced) uniforms.uTime.value = t;
    const s = useTarotStore.getState();
    const open = s.deckOpen && (s.phase === 'selecting' || s.phase === 'revealing' || s.phase === 'done');
    // 点开牌组：约 0.4 秒后被点燃，冲到最亮再落回常亮
    const since = Date.now() - s.deckOpenedAt;
    const ignite = open && since < 2600 ? Math.exp(-Math.pow((since - 900) / 520, 2)) * 0.9 : 0;
    const target = !open ? 0 : (s.phase === 'done' ? 0.78 : 0.5) + ignite;
    uniforms.uGlow.value += (target - uniforms.uGlow.value) * (1 - Math.exp(-dt * (open ? 2.2 : 1.4)));
    const m = ref.current;
    if (!m) return;
    m.visible = uniforms.uGlow.value > 0.01;
    // 漂浮：上下轻轻起伏，盘面缓缓摆动（能看出它是悬在空中的一个圆盘，而不是贴在墙上）
    if (!reduced) {
      m.position.y = position[1] + Math.sin(t * 0.6) * 0.06;
      m.rotation.set(Math.sin(t * 0.31) * 0.09, Math.sin(t * 0.23 + 1) * 0.13, 0);
    }
    m.scale.setScalar(size * (0.92 + 0.08 * Math.min(1, uniforms.uGlow.value)));
    const l = sceneLights[0];
    m.getWorldPosition(tmp);
    l.pos.copy(tmp);
    l.strength = Math.max(l.strength, uniforms.uGlow.value * 1.5);
  });

  return (
    <mesh ref={ref} position={position} scale={size} renderOrder={-5}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        vertexShader={planeVertex}
        fragmentShader={sigilFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

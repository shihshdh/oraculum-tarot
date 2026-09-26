import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const COUNT = 900;
const LIFESPAN = 2.8;

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uPixel;
  attribute vec3 aVel;
  attribute float aSeed;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float t = uTime;
    float life = clamp(t / ${LIFESPAN.toFixed(1)}, 0.0, 1.0);
    // 指数阻尼：先冲出去再慢慢停下，同时往上飘
    float damp = (1.0 - exp(-2.3 * t)) / 2.3;
    vec3 p = aVel * damp;
    p.y += life * life * (0.4 + aSeed);
    p.x += sin(t * 6.0 + aSeed * 30.0) * 0.02;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float twinkle = 0.6 + 0.4 * sin(t * (8.0 + aSeed * 10.0) + aSeed * 50.0);
    gl_PointSize = uPixel * (0.05 + aSeed * 0.07) * (1.0 - life * 0.5) / -mv.z;
    vColor = aColor;
    vAlpha = min(life / 0.06, 1.0) * pow(1.0 - life, 1.5) * twinkle;
  }
`;
const fragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    // 柔和的圆形光点 + 细十字星芒
    float core = smoothstep(0.5, 0.0, r);
    float cross = max(smoothstep(0.06, 0.0, abs(d.x)), smoothstep(0.06, 0.0, abs(d.y))) * smoothstep(0.5, 0.1, r) * 0.6;
    float a = (core * core + cross) * vAlpha;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor * (1.2 + core), a);
  }
`;

/**
 * 翻牌时的金色星尘迸发。全部在 GPU 上计算（每颗粒子的轨迹由时间算出），CPU 每帧只更新一个 uniform。
 */
export default function ParticleBurst({ position = [0, 0, 0.1] }) {
  const matRef = useRef();
  const start = useRef(performance.now());

  const geometry = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    const vel = new Float32Array(COUNT * 3);
    const seed = new Float32Array(COUNT);
    const color = new Float32Array(COUNT * 3);
    const palette = [[1, 0.97, 0.88], [1, 0.84, 0.52], [0.98, 0.72, 0.5], [0.78, 0.68, 1]];
    for (let i = 0; i < COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 1 + Math.random() * 2.6;
      vel.set([Math.sin(phi) * Math.cos(theta) * speed, Math.sin(phi) * Math.sin(theta) * speed * 1.2, Math.cos(phi) * speed * 0.5], i * 3);
      seed[i] = Math.random();
      const c = palette[Math.min(3, Math.floor(((speed - 1) / 2.6) * 4))];
      color.set(c, i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uPixel: { value: 600 } }), []);

  useFrame(({ size, gl }) => {
    uniforms.uTime.value = (performance.now() - start.current) / 1000;
    uniforms.uPixel.value = size.height * gl.getPixelRatio() * 0.9;
  });

  return (
    <points position={position} geometry={geometry} frustumCulled={false}>
      <shaderMaterial ref={matRef} vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

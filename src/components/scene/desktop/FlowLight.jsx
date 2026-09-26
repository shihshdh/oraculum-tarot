import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SLOT_Y } from '../CardArray';
import { useTarotStore } from '../../../store/useTarotStore';

/**
 * 流光（客户端版）：绕着牌阵和星盘的几条倾斜椭圆轨道，每条轨道上有几段带拖尾的光在流动。
 * 细管几何 + 叠加混合 + 超过 1 的亮度，交给泛光去晕开。翻牌后光带变亮、流得更快。
 */
const RIBBONS = [
  { rx: 4.6, ry: 1.35, tilt: 0.22, roll: 0.05, z: -0.4, speed: 0.07, heads: 3, color: '#ffd89a', width: 0.011 },
  { rx: 5.3, ry: 1.9, tilt: -0.35, roll: -0.08, z: -0.9, speed: -0.05, heads: 2, color: '#b9a6ff', width: 0.009 },
  { rx: 3.9, ry: 0.9, tilt: 0.55, roll: 0.12, z: -0.2, speed: 0.1, heads: 2, color: '#fff1d0', width: 0.007 },
  { rx: 6.2, ry: 2.6, tilt: 0.1, roll: -0.2, z: -1.4, speed: 0.035, heads: 4, color: '#8fd6ff', width: 0.008 },
];

const vert = /* glsl */ `
  varying float vT;
  void main() {
    vT = uv.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const frag = /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uHeads;
  uniform float uBoost;
  uniform vec3 uColor;
  varying float vT;
  void main() {
    // 沿轨道的相位：每个"光头"后面拖一条指数衰减的尾巴
    float p = fract(vT * uHeads - uTime * uSpeed * uHeads);
    float tail = pow(p, 7.0);
    float head = smoothstep(0.985, 1.0, p);
    float glow = tail * 1.6 + head * 5.0;
    float base = 0.05; // 整条轨道若有若无
    vec3 col = uColor * (glow + base) * uBoost;
    gl_FragColor = vec4(col, 1.0);
  }
`;

function Ribbon({ cfg }) {
  const geometry = useMemo(() => {
    const curve = new THREE.EllipseCurve(0, 0, cfg.rx, cfg.ry, 0, Math.PI * 2, false, 0);
    const pts = curve.getPoints(360).map((p) => new THREE.Vector3(p.x, p.y, 0));
    const path = new THREE.CatmullRomCurve3(pts, true);
    return new THREE.TubeGeometry(path, 720, cfg.width, 6, true);
  }, [cfg]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        uniforms: {
          uTime: { value: 0 },
          uSpeed: { value: cfg.speed },
          uHeads: { value: cfg.heads },
          uBoost: { value: 1 },
          uColor: { value: new THREE.Color(cfg.color) },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [cfg]
  );

  useFrame((_, dt) => {
    const done = useTarotStore.getState().phase === 'done';
    const u = material.uniforms;
    // 翻牌后更亮、流得更快（平滑过渡）
    u.uBoost.value += ((done ? 1.8 : 1) - u.uBoost.value) * (1 - Math.exp(-dt * 2));
    u.uTime.value += dt * (0.6 + u.uBoost.value * 0.4);
  });

  return (
    <mesh geometry={geometry} material={material} position={[0, SLOT_Y + 0.2, cfg.z]} rotation={[Math.PI / 2 - 1.2 + cfg.tilt, cfg.roll, 0]} />
  );
}

export default function FlowLight() {
  return (
    <group>
      {RIBBONS.map((cfg, i) => (
        <Ribbon key={i} cfg={cfg} />
      ))}
    </group>
  );
}

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { MeshReflectorMaterial } from '@react-three/drei';
import { useTarotStore } from '../../../store/useTarotStore';
import { ALTAR, drawAltarPattern } from './altarShape';

/**
 * 实时画面里的黑曜石镜面台（客户端版）：牌立在上面，台面实时映出牌、光带和光尘。
 * 选牌阶段就在；翻牌后路径追踪算出更精细的版本，渐变盖在它上面（同样的尺寸和位置）。
 */
export default function Altar() {
  const phase = useTarotStore((s) => s.phase);
  // 花纹：透明底的金线，叠在镜面上一点点，倒影从线条之间透出来
  const pattern = useMemo(() => {
    const tex = new THREE.CanvasTexture(drawAltarPattern(false));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 16;
    return tex;
  }, []);
  useEffect(() => () => pattern.dispose(), [pattern]);
  if (phase !== 'selecting' && phase !== 'revealing' && phase !== 'done') return null;
  return (
    <group position={[0, ALTAR.y, ALTAR.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[ALTAR.scaleX, ALTAR.scaleZ, 1]}>
        <circleGeometry args={[ALTAR.radius, 128]} />
        <MeshReflectorMaterial
          color="#15112a"
          metalness={0.5}
          roughness={0.2}
          mirror={1}
          mixStrength={6}
          mixBlur={0.25}
          mixContrast={1.1}
          blur={[60, 20]}
          resolution={1024}
          depthScale={0}
        />
      </mesh>
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[ALTAR.scaleX, ALTAR.scaleZ, 1]}>
        <circleGeometry args={[ALTAR.radius, 128]} />
        <meshBasicMaterial map={pattern} transparent opacity={0.75} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} scale={[ALTAR.scaleX, ALTAR.scaleZ, 1]}>
        <torusGeometry args={[ALTAR.rimRadius, ALTAR.rimTube, 12, 160]} />
        <meshStandardMaterial color="#e2bd72" metalness={1} roughness={0.2} envMapIntensity={1.4} />
      </mesh>
    </group>
  );
}

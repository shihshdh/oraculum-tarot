import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { cardBodyGeometry, edgeMaterial, riverBackMaterial } from './cardKit';

/**
 * 被拾起的牌：从牌河中央沿抛物线飞向卡位，途中翻转一圈半后背面落下。
 */
export default function FlyingCard({ startY, targetPos, startedAt, duration = 850 }) {
  const ref = useRef();
  const materials = useMemo(() => {
    const back = riverBackMaterial().clone();
    back.emissiveIntensity = 1.2;
    return [back, edgeMaterial()];
  }, []);

  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const t = Math.min((performance.now() - startedAt) / duration, 1);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const [tx, ty, tz] = targetPos;
    g.position.set(tx * e, startY + (ty - startY) * e, 0.85 + (tz - 0.85) * e + Math.sin(e * Math.PI) * 1.5);
    g.rotation.set(Math.sin(e * Math.PI) * 0.35, 0, (1 - e) * 0.5);
    g.scale.setScalar(1.18 - e * 0.28);
    materials[0].emissiveIntensity = 1.4 - e * 1.3;
  });

  return (
    <group ref={ref}>
      <mesh geometry={cardBodyGeometry()} material={materials} />
    </group>
  );
}

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useTarotStore } from '../../store/useTarotStore';
import { cardBodyGeometry, edgeMaterial, riverBackMaterial } from './cardKit';
import { SHUFFLE_MS } from './CardArray';

const VIEW_HALF = 9;
const FADE_MARGIN = 2;
// 命中盒比牌大：手势不必指得很准
const HIT_W = 1.45;
const HIT_H = 2.05;
const hitGeo = new THREE.PlaneGeometry(HIT_W, HIT_H);
const hitMat = new THREE.MeshBasicMaterial({ visible: false });

/**
 * 牌河里的一张牌。
 * 不订阅任何 store 状态：位置、悬停、发光全在 useFrame 里直接读写，
 * 光标每秒更新几十次也不会触发 78 张牌的 React 重渲染。
 * 悬停检测由 CardArray 统一做一次射线检测，这里只负责把命中盒登记上去。
 */
export default function FloatingCard({ tarot, baseIndex, totalCount, spacing, yPosition, offsetRef, register, cursorWorld }) {
  const groupRef = useRef();
  const hitRef = useRef();
  const lift = useRef(0);
  const glow = useRef(0.08);
  const pull = useRef(0); // 磁性：指针越近越大（0..1）

  // 每张牌一份材质克隆：透明度和发光各自变化；纹理仍然共享
  const materials = useMemo(() => {
    const back = riverBackMaterial().clone();
    back.transparent = true;
    return [back, edgeMaterial().clone()];
  }, []);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

  useEffect(() => {
    const hit = hitRef.current;
    hit.userData.tarotId = tarot.id;
    return register(hit);
  }, [register, tarot.id]);

  useFrame((_, dt) => {
    const g = groupRef.current;
    if (!g) return;
    const totalLen = totalCount * spacing;
    let x = (baseIndex * spacing - (offsetRef.current || 0)) % totalLen;
    if (x < 0) x += totalLen;
    x -= totalLen / 2;
    const halfView = VIEW_HALF + FADE_MARGIN;
    if (x > halfView && totalLen > halfView * 2) x -= totalLen;
    else if (x < -halfView && totalLen > halfView * 2) x += totalLen;

    // 浅 U 形牌河：中间的牌更高、正对观众
    const nx = Math.max(-1, Math.min(1, x / VIEW_HALF));
    const arc = -Math.cos((nx * Math.PI) / 2) * 0.35 + 0.35;
    const t = performance.now() / 1000;
    const bob = Math.sin(t * 1.2 + baseIndex * 0.5) * 0.06;

    const st = useTarotStore.getState();
    // 洗牌：旋转着淡出 → 半程换顺序 → 淡入（每张牌错开一点，像一阵风卷过去）
    const since = Date.now() - st.shuffledAt - (baseIndex % 9) * 18;
    const e = since >= 0 && since < SHUFFLE_MS ? 1 - Math.abs(since / SHUFFLE_MS - 0.5) * 2 : 0;

    const vis = (Math.abs(x) > VIEW_HALF ? Math.max(0, 1 - (Math.abs(x) - VIEW_HALF) / FADE_MARGIN) : 1) * (1 - 0.92 * e);
    hitRef.current.userData.visible = vis;
    materials[0].opacity = vis;
    materials[1].opacity = vis;
    materials[1].transparent = vis < 1;
    g.visible = vis > 0.02;

    // 磁性：指针在牌河附近时，离指针越近的牌抬得越高、越朝指针偏
    const cw = cursorWorld?.current;
    let target = 0;
    let dx = 0;
    if (cw && st.phase === 'selecting') {
      dx = cw.x - x;
      const dy = cw.y - (yPosition + arc);
      target = Math.exp(-(dx * dx) / 2.2) * Math.exp(-(dy * dy) / 3.5);
    }
    pull.current += (target - pull.current) * (1 - Math.exp(-dt * 8));
    const p = pull.current;

    const hovered = st.hoveredRiverId;
    const isHover = hovered === tarot.id;
    const k = 1 - Math.exp(-dt * 12);
    lift.current += ((isHover ? 1 : 0) - lift.current) * k;
    glow.current += ((isHover ? 1.05 : hovered ? 0.03 : 0.1) - glow.current) * k;
    materials[0].emissiveIntensity = glow.current;

    const free = 1 - lift.current;
    g.position.set(x, yPosition + bob + arc + lift.current * 0.2 + p * 0.14 * free, lift.current * 1.1 + p * 0.35 * free);
    g.rotation.set(
      -p * 0.12 * free,
      -nx * 0.16 * free + Math.max(-1, Math.min(1, dx)) * 0.28 * p * free + e * Math.PI,
      Math.sin(t * 0.5 + baseIndex) * 0.04 * free + nx * 0.08
    );
    g.scale.setScalar((1 + lift.current * 0.1 + p * 0.04 * free) * (1 - 0.2 * e));
    // 命中盒跟着牌走，但不跟着放大（否则悬停后命中范围会变得过大）
    hitRef.current.position.set(x, yPosition + bob + arc, 0);
  });

  return (
    <>
      <mesh ref={hitRef} geometry={hitGeo} material={hitMat} />
      <group ref={groupRef}>
        <mesh geometry={cardBodyGeometry()} material={materials} />
      </group>
    </>
  );
}

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useTarotStore } from '../../store/useTarotStore';
import { cardBodyGeometry, edgeMaterial, riverBackMaterial } from './cardKit';
import { SHUFFLE_MS } from './CardArray';
import { FLAT_EULER, liveCards, sceneLights } from './room/roomKit';

const VIEW_HALF = 9;
const FADE_MARGIN = 2;
// 命中盒比牌大：手势不必指得很准
const HIT_W = 1.45;
const HIT_H = 2.05;
const hitGeo = new THREE.PlaneGeometry(HIT_W, HIT_H);
const hitMat = new THREE.MeshBasicMaterial({ visible: false });
const tmp = new THREE.Vector3();

// 从桌上牌组飞进牌河：每张牌飞 1.25 秒；从正中间那张开始，向两边依次掀起（最外侧约晚 0.95 秒）
const EMERGE_MS = 1250;
const EMERGE_SPREAD = 950;
const smoother = (x) => x * x * x * (x * (x * 6 - 15) + 10);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const bez = (a, b, c, d, t) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; };

/**
 * 牌河里的一张牌。
 * 不订阅任何 store 状态：位置、悬停、发光全在 useFrame 里直接读写，
 * 光标每秒更新几十次也不会触发 78 张牌的 React 重渲染。
 * 悬停检测由 CardArray 统一做一次射线检测，这里只负责把命中盒登记上去。
 *
 * 展开：牌组被点开时，这张牌从牌堆顶平躺着被掀起——先打着旋直直升起，再向自己在牌河里的位置
 * 横扫过去，从靠近镜头的一侧落进牌河（三次贝塞尔曲线 + 五次平滑缓动，速度处处连续，没有顿挫）；
 * 途中烫金被点亮，落定时暗下来。
 */
export default function FloatingCard({ tarot, baseIndex, totalCount, spacing, yPosition, offsetRef, register, cursorWorld, deckLocal, rootScale }) {
  const groupRef = useRef();
  const hitRef = useRef();
  const lift = useRef(0);
  const glow = useRef(0.08);
  const pull = useRef(0); // 磁性：指针越近越大（0..1）
  const emerge = useRef({ at: 0, delay: -1 });

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
  // 登记给"收牌"：重新开始时从这里飞回牌堆
  useEffect(() => {
    const g = groupRef.current;
    liveCards.add(g);
    return () => liveCards.delete(g);
  }, []);

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
    const px = x;
    const py = yPosition + bob + arc + lift.current * 0.2 + p * 0.14 * free;
    const pz = lift.current * 1.1 + p * 0.35 * free;
    const rx = -p * 0.12 * free;
    const ry = -nx * 0.16 * free + Math.max(-1, Math.min(1, dx)) * 0.28 * p * free + e * Math.PI;
    const rz = Math.sin(t * 0.5 + baseIndex) * 0.04 * free + nx * 0.08;
    const sc = (1 + lift.current * 0.1 + p * 0.04 * free) * (1 - 0.2 * e);

    // 展开：点开那一刻按这张牌在牌河里的位置排好出发时间；看不见的牌（在画面外）不用飞
    const em = emerge.current;
    const opened = Date.now() - st.deckOpenedAt;
    if (em.at !== st.deckOpenedAt) {
      em.at = st.deckOpenedAt;
      const jitter = ((baseIndex * 7919) % 97) / 97;
      em.delay = opened < 400 && Math.abs(x) < VIEW_HALF ? 180 + (Math.abs(x) / VIEW_HALF) * EMERGE_SPREAD + jitter * 70 : -1;
    }
    const fly = em.delay >= 0 ? clamp01((opened - em.delay) / EMERGE_MS) : 1;
    if (fly < 1 && deckLocal) {
      const q = smoother(fly);
      const d0 = deckLocal.current;
      const side = x === 0 ? 1 : Math.sign(x);
      const inv = 1 / (rootScale?.current || 1);
      // 控制点：牌堆正上方 → 目标位置前上方
      g.position.set(
        bez(d0.x, d0.x, px + side * 0.25, px, q),
        bez(d0.y, d0.y + 2.6 * inv, py + 0.7, py, q),
        bez(d0.z, d0.z + 0.6 * inv, pz + 1.8, pz, q)
      );
      const r = smoother(clamp01((fly - 0.05) / 0.8));
      g.rotation.set(
        FLAT_EULER.x + (rx - FLAT_EULER.x) * r,
        ry * r + Math.sin(r * Math.PI) * 0.55 * side,
        rz * r + (1 - r) * side * Math.PI * 0.9 // 平躺着打旋，像被风卷起的一片叶子
      );
      g.scale.setScalar((inv + (sc - inv) * smoother(clamp01(fly / 0.7))) * (1 + Math.sin(fly * Math.PI) * 0.07));
      // 飞行途中烫金亮起来，照亮下方的桌面
      glow.current = Math.max(glow.current, 0.35 + Math.sin(fly * Math.PI) * 1.1);
      materials[0].emissiveIntensity = glow.current;
      if (fly > 0 && baseIndex % 3 === 0) {
        g.getWorldPosition(tmp);
        const l = sceneLights[2];
        if (l.strength < 0.9) { l.pos.copy(tmp); l.strength = Math.sin(fly * Math.PI) * 0.9; }
      }
    } else {
      g.position.set(px, py, pz);
      g.rotation.set(rx, ry, rz);
      g.scale.setScalar(sc);
    }
    if (isHover && lift.current > 0.05) {
      g.getWorldPosition(sceneLights[2].pos);
      sceneLights[2].strength = lift.current * 1.1;
    }
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

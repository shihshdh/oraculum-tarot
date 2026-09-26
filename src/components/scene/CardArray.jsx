import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useTarotStore } from '../../store/useTarotStore';
import { TAROT_DECK } from '../../data/tarotDeck';
import { emitCompanion } from '../../lib/companionBus';
import FloatingCard from './FloatingCard';
import SlotCard from './SlotCard';
import FlyingCard from './FlyingCard';

/**
 * 漂浮牌河 + 下方五个卡位
 *   1. 牌河循环漂浮；光标悬停的那张减速、抬起、烫金发光
 *   2. 捏合/点击 → 那张牌沿弧线飞进下一个空卡位（背面朝上）
 *   3. 五张到齐后依次翻开
 *
 * 性能：悬停检测每帧只做一次射线检测（对所有命中盒），只在悬停对象变化时写 store；
 * 捏合通过 store.subscribe 监听，不引起本组件重渲染。
 */

export const RIVER_Y = 1.3;
const RIVER_SPEED = 0.4;
const RIVER_SPACING = 1.2;
export const SLOT_Y = -1.5;
export const SLOT_SPACING = 1.3;
const FLY_DURATION = 850;
const STICKY_MS = 180;

export default function CardArray() {
  const cards = useTarotStore((s) => s.cards);
  const phase = useTarotStore((s) => s.phase);
  const pickedTarotIds = useTarotStore((s) => s.pickedTarotIds);
  const isMirror = useTarotStore((s) => s.isMirror);
  const { camera } = useThree();

  const offsetRef = useRef(0);
  const riverDeck = useMemo(() => TAROT_DECK.filter((t) => !pickedTarotIds.includes(t.id)), [pickedTarotIds]);
  const slotPositions = useMemo(() => cards.map((_, i) => [(i - 2) * SLOT_SPACING, SLOT_Y, 0]), [cards.length]);

  // 命中盒登记表
  const hits = useRef(new Set());
  const register = useCallback((mesh) => {
    hits.current.add(mesh);
    return () => hits.current.delete(mesh);
  }, []);

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const sticky = useRef({ id: null, at: 0 });
  const speed = useRef(RIVER_SPEED);

  useFrame((_, dt) => {
    const s = useTarotStore.getState();
    if (s.phase !== 'selecting' && s.phase !== 'revealing') return;

    // 牌河速度平滑过渡：悬停几乎停下，加速时 3.5 倍
    const target = s.hoveredRiverId && s.phase === 'selecting' ? RIVER_SPEED * 0.06 : s.riverAccelerate && s.phase === 'selecting' ? RIVER_SPEED * 3.5 : RIVER_SPEED;
    speed.current += (target - speed.current) * (1 - Math.exp(-dt * 8));
    offsetRef.current += speed.current * dt;
    const total = riverDeck.length * RIVER_SPACING;
    if (total > 0) offsetRef.current %= total;

    if (s.isMirror) return; // 副屏的悬停由主屏广播过来
    let id = null;
    if (s.phase === 'selecting' && s.cursor.visible) {
      ndc.set(s.cursor.x * 2 - 1, -(s.cursor.y * 2 - 1));
      raycaster.setFromCamera(ndc, camera);
      const list = [...hits.current];
      for (const hit of raycaster.intersectObjects(list, false)) {
        const hitId = hit.object.userData.tarotId;
        // 刚拿走的牌在下一次渲染前还留在命中表里，跳过它
        if ((hit.object.userData.visible ?? 1) > 0.5 && !s.pickedTarotIds.includes(hitId)) { id = hitId; break; }
      }
    }
    const now = performance.now();
    if (id) sticky.current = { id, at: now };
    else if (sticky.current.id && now - sticky.current.at < STICKY_MS) id = sticky.current.id;
    if (id !== s.hoveredRiverId) s.setHoveredRiverId(id);
  });

  // ---------- 捏合：把悬停的牌送进卡位 ----------
  const [flying, setFlying] = useState([]);
  const reserved = useRef(new Set());
  useEffect(() => {
    if (isMirror) return;
    return useTarotStore.subscribe(
      (s) => s.isPinching,
      (pinching) => {
        if (!pinching) return;
        const s = useTarotStore.getState();
        if (s.phase !== 'selecting' || !s.hoveredRiverId) return;
        const slot = s.cards.find((c) => !c.tarotId && !reserved.current.has(c.slotId));
        const tarot = TAROT_DECK.find((t) => t.id === s.hoveredRiverId);
        // 同一张牌只能拿一次（后端也只接受 5 张互不相同的牌）
        if (!slot || !tarot || s.pickedTarotIds.includes(tarot.id)) return;
        const reversed = Math.random() < 0.5;

        s.addPickedTarot(tarot.id);
        emitCompanion({ type: 'moment', kind: 'picked', count: useTarotStore.getState().pickedTarotIds.length });
        reserved.current.add(slot.slotId);
        sticky.current = { id: null, at: 0 };
        s.setHoveredRiverId(null);

        const flyId = `fly-${tarot.id}-${Date.now()}`;
        setFlying((list) => [...list, { id: flyId, target: [(slot.slotId - 2) * SLOT_SPACING, SLOT_Y, 0], startedAt: performance.now() }]);

        setTimeout(() => {
          setFlying((list) => list.filter((f) => f.id !== flyId));
          const now = useTarotStore.getState();
          if (now.phase !== 'selecting') return; // 飞行途中被重置了
          const updated = now.cards.map((c) => (c.slotId === slot.slotId ? { ...c, tarotId: tarot.id, reversed, flipped: false } : c));
          useTarotStore.setState({ cards: updated });
          reserved.current.delete(slot.slotId);
          if (updated.every((c) => c.tarotId)) {
            // 五张到齐：波浪式依次翻开
            updated.forEach((c, i) => setTimeout(() => useTarotStore.getState().flipCard(c.slotId, c.tarotId, c.reversed), 350 + i * 280));
          }
        }, FLY_DURATION);
      }
    );
  }, [isMirror]);

  useEffect(() => {
    if (phase === 'splash') {
      setFlying([]);
      reserved.current.clear();
      offsetRef.current = 0;
    }
  }, [phase]);

  const showRiver = phase === 'selecting' || phase === 'revealing';
  return (
    <>
      {showRiver &&
        riverDeck.map((tarot, i) => (
          <FloatingCard key={tarot.id} tarot={tarot} baseIndex={i} totalCount={riverDeck.length} spacing={RIVER_SPACING} yPosition={RIVER_Y} offsetRef={offsetRef} register={register} />
        ))}
      {flying.map((f) => (
        <FlyingCard key={f.id} startY={RIVER_Y} targetPos={f.target} startedAt={f.startedAt} duration={FLY_DURATION} />
      ))}
      {cards.map((card, i) => (
        <SlotCard key={card.slotId} slotId={card.slotId} position={slotPositions[i]} flipped={card.flipped} reversed={card.reversed} tarotId={card.tarotId} />
      ))}
    </>
  );
}

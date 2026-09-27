import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useTarotStore } from '../../store/useTarotStore';
import { TAROT_DECK } from '../../data/tarotDeck';
import { emitCompanion } from '../../lib/companionBus';
import FloatingCard from './FloatingCard';
import SlotCard from './SlotCard';
import FlyingCard from './FlyingCard';
import ParticleBurst from './ParticleBurst';
import { DECK_OPEN_MS, DECK_TOP, cardRoot } from './room/roomKit';

/**
 * 漂浮牌河 + 下方五个卡位
 *   1. 牌河循环漂浮；光标悬停的那张减速、抬起、烫金发光
 *   2. 捏合/点击 → 那张牌沿弧线飞进下一个空卡位（背面朝上）
 *   3. 五张到齐后依次翻开
 *   4. 洗牌：选牌时快速左右晃动指针或手（1 秒内来回 4 次以上），牌河旋转着重新洗一遍
 *   5. 磁性：指针靠近时，附近的牌微微抬起、朝指针倾斜（指针在牌河平面上的位置写进 cursorWorld）
 *   6. 端详：翻牌后点一张牌，它浮到眼前；再点一下放回
 *   0. 进入选牌时牌还在桌上：点一下桌上的牌组（room/Deck），牌才一张张浮起、展开成牌河
 *
 * 坐标：这里的一切都在 cardRoot 的局部坐标里（窄屏、面板让位时由 CameraRig 移动/缩放 cardRoot，镜头不动）。
 *
 * 性能：悬停检测每帧只做一次射线检测（对所有命中盒），只在悬停对象变化时写 store；
 * 捏合通过 store.subscribe 监听，不引起本组件重渲染。
 */

export const RIVER_Y = 1.3;
const RIVER_SPEED = 0.4;
const RIVER_SPACING = 1.2;
export const SLOT_Y = -1.25; // 卡位悬在桌面上方一点（照片重构的桌面就在这一带）
export const SHUFFLE_MS = 700; // 洗牌动画时长：一半时牌几乎看不见，就在那一刻换顺序

function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
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
  const [order, setOrder] = useState(() => TAROT_DECK);
  const riverDeck = useMemo(() => order.filter((t) => !pickedTarotIds.includes(t.id)), [order, pickedTarotIds]);
  const cursorWorld = useRef(new THREE.Vector3(0, -99, 0)); // 指针在牌河平面 z = 0 上的位置（磁性用，局部坐标）
  // 桌上牌组顶面在局部坐标里的位置、cardRoot 的缩放：牌从牌组飞出来时用
  const deckLocal = useRef(new THREE.Vector3());
  const rootScale = useRef(1);
  const deckOpen = useTarotStore((s) => s.deckOpen);
  const [bursts, setBursts] = useState([]);
  const slotPositions = useMemo(() => cards.map((_, i) => [(i - 2) * SLOT_SPACING, SLOT_Y, 0]), [cards.length]);

  // 命中盒登记表
  const hits = useRef(new Set());
  const register = useCallback((mesh) => {
    hits.current.add(mesh);
    return () => hits.current.delete(mesh);
  }, []);
  // 卡位的命中盒（端详用）
  const slotHits = useRef(new Set());
  const registerSlot = useCallback((mesh) => {
    slotHits.current.add(mesh);
    return () => slotHits.current.delete(mesh);
  }, []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), []);

  // ---------- 洗牌 ----------
  const shake = useRef({ lastX: null, lastT: 0, dir: 0, flips: [], cooldown: 0 });
  const shuffle = useCallback(() => {
    const s = useTarotStore.getState();
    s.markShuffled(); // FloatingCard 据此做旋转淡出 → 淡入
    s.setHoveredRiverId(null);
    speed.current = RIVER_SPEED * 12; // 牌河猛地一转，再慢慢停下来
    const id = Date.now();
    setBursts((b) => [...b, id]);
    setTimeout(() => setBursts((b) => b.filter((x) => x !== id)), 2800);
    setTimeout(() => setOrder((o) => shuffled(o)), SHUFFLE_MS / 2);
    emitCompanion({ type: 'moment', kind: 'shuffled' });
  }, []);

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const localRay = useMemo(() => new THREE.Ray(), []);
  const inverse = useMemo(() => new THREE.Matrix4(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const sticky = useRef({ id: null, at: 0 });
  const speed = useRef(RIVER_SPEED);

  useFrame((_, dt) => {
    const s = useTarotStore.getState();
    const root = cardRoot.current;
    if (root) {
      rootScale.current = root.scale.x;
      root.worldToLocal(deckLocal.current.copy(DECK_TOP));
    }
    // 端详：翻牌后，指针下是哪张牌（牌河此时已经收起，下面的逻辑都不用跑）
    if (s.phase === 'done' && !s.isMirror) {
      let slot = null;
      if (s.cursor.visible && s.inspectSlot === null) {
        ndc.set(s.cursor.x * 2 - 1, -(s.cursor.y * 2 - 1));
        raycaster.setFromCamera(ndc, camera);
        for (const hit of raycaster.intersectObjects([...slotHits.current], false)) { slot = hit.object.userData.slotId; break; }
      }
      if (slot !== s.hoveredSlot) s.setHoveredSlot(slot);
      if (s.hoveredRiverId) s.setHoveredRiverId(null);
      return;
    }
    if ((s.phase !== 'selecting' && s.phase !== 'revealing') || !s.deckOpen) return;

    // 牌河速度平滑过渡：悬停几乎停下，加速时 3.5 倍；刚展开时从静止慢慢流动起来（牌还在往里飞）
    const opening = Date.now() - s.deckOpenedAt;
    const ramp = Math.min(1, Math.max(0, (opening - 900) / 1400));
    const target = (s.hoveredRiverId && s.phase === 'selecting' ? RIVER_SPEED * 0.06 : s.riverAccelerate && s.phase === 'selecting' ? RIVER_SPEED * 3.5 : RIVER_SPEED) * ramp * ramp;
    speed.current += (target - speed.current) * (1 - Math.exp(-dt * 8));
    offsetRef.current += speed.current * dt;
    const total = riverDeck.length * RIVER_SPACING;
    if (total > 0) offsetRef.current %= total;

    if (s.isMirror) return; // 副屏的悬停由主屏广播过来
    const now0 = performance.now();

    // 洗牌检测：指针横向速度超过每秒 1.6 个屏宽、方向来回翻转，0.9 秒内 4 次
    const sh = shake.current;
    if (s.phase === 'selecting' && s.cursor.visible && opening > DECK_OPEN_MS) {
      if (sh.lastX !== null) {
        const dtm = (now0 - sh.lastT) / 1000;
        const v = dtm > 0 ? (s.cursor.x - sh.lastX) / dtm : 0;
        if (Math.abs(v) > 1.6) {
          const d = Math.sign(v);
          if (sh.dir && d !== sh.dir) sh.flips.push(now0);
          sh.dir = d;
        }
      }
      sh.lastX = s.cursor.x;
      sh.lastT = now0;
      sh.flips = sh.flips.filter((t) => now0 - t < 900);
      if (sh.flips.length >= 4 && now0 > sh.cooldown) {
        sh.flips = [];
        sh.dir = 0;
        sh.cooldown = now0 + 2500;
        shuffle();
      }
    } else {
      sh.lastX = null;
    }

    if (s.cursor.visible) {
      ndc.set(s.cursor.x * 2 - 1, -(s.cursor.y * 2 - 1));
      raycaster.setFromCamera(ndc, camera);
      localRay.copy(raycaster.ray);
      if (root) localRay.applyMatrix4(inverse.copy(root.matrixWorld).invert());
      if (!localRay.intersectPlane(plane, cursorWorld.current)) cursorWorld.current.set(0, -99, 0);
    } else {
      cursorWorld.current.set(0, -99, 0);
    }

    let id = null;
    if (s.phase === 'selecting' && s.cursor.visible && Date.now() - s.shuffledAt > SHUFFLE_MS && opening > DECK_OPEN_MS) {
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
        // 翻牌后：点牌 = 端详它；端详时再点一下（任何地方）= 放回去
        if (s.phase === 'done') {
          if (s.inspectSlot !== null) s.setInspectSlot(null);
          else if (s.hoveredSlot !== null) {
            s.setInspectSlot(s.hoveredSlot);
            emitCompanion({ type: 'moment', kind: 'inspect', slot: s.hoveredSlot });
          }
          return;
        }
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

  // Esc 放回正在端详的牌
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && useTarotStore.getState().inspectSlot !== null) useTarotStore.getState().setInspectSlot(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 牌组刚被点开：牌河从头、从静止开始
  useEffect(() => {
    if (!deckOpen) return;
    offsetRef.current = 0;
    speed.current = 0;
  }, [deckOpen]);

  useEffect(() => {
    if (phase === 'splash') {
      setFlying([]);
      reserved.current.clear();
      offsetRef.current = 0;
    }
  }, [phase]);

  const showRiver = (phase === 'selecting' || phase === 'revealing') && deckOpen;
  return (
    <>
      {showRiver &&
        riverDeck.map((tarot, i) => (
          <FloatingCard key={tarot.id} tarot={tarot} baseIndex={i} totalCount={riverDeck.length} spacing={RIVER_SPACING} yPosition={RIVER_Y} offsetRef={offsetRef} register={register} cursorWorld={cursorWorld} deckLocal={deckLocal} rootScale={rootScale} />
        ))}
      {flying.map((f) => (
        <FlyingCard key={f.id} startY={RIVER_Y} targetPos={f.target} startedAt={f.startedAt} duration={FLY_DURATION} />
      ))}
      {cards.map((card, i) => (
        <SlotCard key={card.slotId} slotId={card.slotId} position={slotPositions[i]} flipped={card.flipped} reversed={card.reversed} tarotId={card.tarotId} registerSlot={registerSlot} deckOpen={deckOpen} />
      ))}
      {bursts.map((id) => (
        <group key={id} position={[0, RIVER_Y, 0.6]} scale={[3.2, 1.2, 1]}>
          <ParticleBurst />
        </group>
      ))}
    </>
  );
}

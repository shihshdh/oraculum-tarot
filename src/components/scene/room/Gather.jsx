import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useTarotStore } from '../../../store/useTarotStore';
import { FACE_OFFSET, cardBodyGeometry, cardFaceGeometry, edgeMaterial, faceMaterial, riverBackMaterial } from '../cardKit';
import { DECK, DECK_TOP, FLAT_EULER, GATHER_FLY, GATHER_STAGGER, TABLE_NORMAL, gather, gatherLandAt, liveCards, sceneLights } from './roomKit';

const smoother = (x) => x * x * x * (x * (x * 6 - 15) + 10);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const bez = (a, b, c, d, t) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; };
const FLAT_Q = new THREE.Quaternion().setFromEuler(FLAT_EULER);
const qa = new THREE.Quaternion();
const qs = new THREE.Quaternion();

/**
 * 收牌：重新开始的那一刻，把空中每张看得见的牌（牌河里的、卡位上翻开的）的位置和朝向记下来，
 * 换成一份份替身，依次划一道弧线飞回桌上的牌组——先微微扬起，再从牌堆正上方打着旋落下，
 * 翻开的牌途中翻回背面；每落下一张，牌堆就厚一层（Deck 按同一条时间线长高）。
 *
 * 记录发生在 store 更新的同步回调里：这时 React 还没卸载那些牌，拿到的正是上一帧画面里的样子。
 */
export default function Gather() {
  const [flights, setFlights] = useState([]);

  useEffect(() => {
    let timer = 0;
    const unsub = useTarotStore.subscribe(
      (s) => s.deckOpen,
      (open, wasOpen) => {
        if (open || !wasOpen) return;
        const list = [];
        for (const g of liveCards) {
          if (!g.visible) continue;
          const mats = g.children[0]?.material;
          if (Array.isArray(mats) && mats[0].transparent && mats[0].opacity < 0.4) continue; // 牌河边缘正在淡出的
          g.updateWorldMatrix(true, false);
          const pos = new THREE.Vector3();
          const quat = new THREE.Quaternion();
          const scale = new THREE.Vector3();
          g.matrixWorld.decompose(pos, quat, scale);
          list.push({ pos, quat, scale: scale.x, tarot: g.userData.tarot || null, dist: pos.distanceTo(DECK_TOP) });
        }
        // 离牌堆近的先回去，牌堆一层层匀速长高；左右交替着落，像一只手在收拢
        list.sort((a, b) => a.dist - b.dist);
        const at = performance.now();
        gather.at = at;
        gather.count = list.length;
        setFlights(list.map((f, i) => ({ ...f, i, side: f.pos.x >= DECK_TOP.x ? 1 : -1, key: `${at}-${i}` })));
        clearTimeout(timer);
        timer = setTimeout(() => setFlights([]), gatherLandAt(list.length) + 400);
      }
    );
    return () => { unsub(); clearTimeout(timer); };
  }, []);

  return flights.map((f) => <GatherCard key={f.key} f={f} count={flights.length} />);
}

function GatherCard({ f, count }) {
  const ref = useRef();
  const materials = useMemo(() => [riverBackMaterial().clone(), edgeMaterial()], []);
  const faceMat = useMemo(() => (f.tarot ? faceMaterial(f.tarot) : null), [f.tarot]);
  useEffect(() => () => { materials[0].dispose(); faceMat?.dispose(); }, [materials, faceMat]);
  // 落点：牌堆长到这一张时的顶面
  const land = useMemo(() => DECK_TOP.clone().addScaledVector(TABLE_NORMAL, -DECK.thickness * (1 - (f.i + 1) / count)), [f.i, count]);

  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const k = clamp01((performance.now() - gather.at - f.i * GATHER_STAGGER) / GATHER_FLY);
    g.visible = k < 1;
    if (!g.visible) return;
    const q = smoother(k);
    const n = TABLE_NORMAL;
    // 控制点：原地微微扬起、朝镜头一点 → 牌堆正上方 → 落点
    g.position.set(
      bez(f.pos.x, f.pos.x + f.side * 0.15, land.x + n.x * 2.4, land.x, q),
      bez(f.pos.y, f.pos.y + 0.9, land.y + n.y * 2.4, land.y, q),
      bez(f.pos.z, f.pos.z + 0.5, land.z + n.z * 2.4, land.z, q)
    );
    const r = smoother(clamp01((k - 0.08) / 0.82));
    qa.copy(f.quat).slerp(FLAT_Q, r);
    qs.setFromAxisAngle(n, (1 - r) * f.side * Math.PI * 0.8 * r * 2); // 落下前打半个旋
    g.quaternion.copy(qs).multiply(qa);
    g.scale.setScalar(f.scale + (1 - f.scale) * q);
    materials[0].emissiveIntensity = 0.12 + Math.sin(k * Math.PI) * 0.9;
    if (f.i % 3 === 0) {
      const l = sceneLights[2];
      l.pos.copy(g.position);
      l.strength = Math.max(l.strength, Math.sin(k * Math.PI) * 0.8);
    }
  });

  return (
    <group ref={ref} position={f.pos} quaternion={f.quat} scale={f.scale}>
      <mesh geometry={cardBodyGeometry()} material={materials} />
      {faceMat && <mesh geometry={cardFaceGeometry()} material={faceMat} position={[0, 0, -FACE_OFFSET]} rotation={[0, Math.PI, 0]} />}
    </group>
  );
}

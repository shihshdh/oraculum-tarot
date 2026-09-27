import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useTarotStore } from '../../../store/useTarotStore';
import { emitCompanion } from '../../../lib/companionBus';
import { backMaterial, deckEdgeTexture, deckGeometry } from '../cardKit';
import { CAM0, DECK, DECK_TOP, GATHER_FLY, GATHER_STAGGER, PITCH, gather, gatherLandAt, sceneLights } from './roomKit';
import ParticleBurst from '../ParticleBurst';

const ndc = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * 桌上的那副牌，与照片里的牌组严丝合缝地重叠（照片里原来的牌组已经抹掉，由它顶替）。
 *   · 等待点开时：烫金一呼一吸，指针/手指过来时牌堆微微浮起、泛出金光
 *   · 点开：整副牌先轻轻一震、浮起，顶上的牌一张张被掀起飞进空中（飞行由 FloatingCard 负责），
 *     牌堆随之变薄直到消失；桌面被牌组的金光照亮
 *   · 重新开始：空中的牌一张张飞回来叠上（room/Gather），牌堆随之一层层长高
 */
export default function Deck() {
  const camera = useThree((s) => s.camera);
  const phase = useTarotStore((s) => s.phase);
  const deckOpenedAt = useTarotStore((s) => s.deckOpenedAt);
  const stackRef = useRef();
  const hitRef = useRef();
  const hovered = useRef(false);
  const anim = useRef({ fill: 1, lift: 0, glow: 0, hover: 0 });
  const [burstKey, setBurstKey] = useState(0);

  const materials = useMemo(() => {
    const back = backMaterial().clone();
    back.color = new THREE.Color('#5f5a72'); // 压到照片里桌面那盏暗光的亮度
    back.envMapIntensity = 0.28; // 环境里的吊灯、蜡烛很亮，桌上的牌不能被它冲白
    back.emissiveIntensity = 0;
    const edge = new THREE.MeshStandardMaterial({
      map: deckEdgeTexture(), color: '#8a7658', metalness: 0.15, roughness: 0.6, envMapIntensity: 0.25,
      emissive: new THREE.Color('#f3d49a'), emissiveIntensity: 0,
    });
    return [back, edge];
  }, []);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  const geometry = useMemo(() => deckGeometry(DECK.thickness), []);

  // 点开：捏合/点击时当场做一次射线检测（不等下一帧的悬停结果，轻触时也准）
  useEffect(() => {
    return useTarotStore.subscribe(
      (s) => s.isPinching,
      (pinching) => {
        const s = useTarotStore.getState();
        if (!pinching || s.isMirror || s.phase !== 'selecting' || s.deckOpen || !s.cursor.visible) return;
        ndc.set(s.cursor.x * 2 - 1, -(s.cursor.y * 2 - 1));
        raycaster.setFromCamera(ndc, camera);
        if (!hitRef.current || !raycaster.intersectObject(hitRef.current, false).length) return;
        s.openDeck();
        emitCompanion({ type: 'moment', kind: 'deckOpened' });
      }
    );
  }, [camera]);

  // 点开时牌堆上方迸出一团金色星尘（播完就卸掉）
  useEffect(() => {
    if (!deckOpenedAt) return;
    setBurstKey(deckOpenedAt);
    const t = setTimeout(() => setBurstKey(0), 3000);
    return () => clearTimeout(t);
  }, [deckOpenedAt]);

  useFrame((_, dt) => {
    const g = stackRef.current;
    if (!g) return;
    const s = useTarotStore.getState();
    const a = anim.current;
    const t = performance.now() / 1000;

    // 悬停
    let hover = false;
    if (s.phase === 'selecting' && !s.deckOpen && s.cursor.visible && !s.isMirror && hitRef.current) {
      ndc.set(s.cursor.x * 2 - 1, -(s.cursor.y * 2 - 1));
      raycaster.setFromCamera(ndc, camera);
      hover = raycaster.intersectObject(hitRef.current, false).length > 0;
    }
    hovered.current = hover;
    a.hover += ((hover ? 1 : 0) - a.hover) * (1 - Math.exp(-dt * 10));

    let fill = 1;
    let lift = a.hover * 0.06;
    let glow = a.hover * 0.9;
    if (s.deckOpen) {
      // 点开后的时间线（毫秒）：0..250 浮起 → 180..1500 一张张被掀走 → 牌堆消失
      const e = Date.now() - s.deckOpenedAt;
      fill = 1 - smooth(180, 1500, e);
      lift = 0.14 * smooth(0, 260, e) * (1 - smooth(1100, 1600, e));
      glow = 1.8 * Math.exp(-Math.max(0, e - 120) / 700) * smooth(0, 120, e);
      // 刚被点中的一刹那轻轻一震
      if (e < 260) g.rotation.z = Math.sin(e * 0.09) * 0.012 * (1 - e / 260);
      else g.rotation.z = 0;
    } else if (s.phase === 'selecting') {
      glow += 0.1 + 0.09 * Math.sin(t * 2.4); // 等待被点开：烫金一呼一吸
    }
    // 重新开始：空中的牌一张张飞回来（Gather），每落下一张牌堆厚一层；最后一张落定时烫金一亮
    const since = performance.now() - gather.at;
    const gathering = !s.deckOpen && gather.count > 0 && since < gatherLandAt(gather.count) + 600;
    if (gathering) {
      fill = Math.min(1, Math.max(0.015, (since - GATHER_FLY + GATHER_STAGGER) / (GATHER_STAGGER * gather.count)));
      const settle = since - gatherLandAt(gather.count - 1);
      glow += 0.8 * Math.exp(-(settle * settle) / (2 * 180 * 180));
    }
    a.fill = s.deckOpen || gathering ? fill : a.fill + (fill - a.fill) * (1 - Math.exp(-dt * 2.5));
    a.lift += (lift - a.lift) * (1 - Math.exp(-dt * 12));
    a.glow += (glow - a.glow) * (1 - Math.exp(-dt * 8));

    g.visible = a.fill > 0.015;
    g.scale.set(1, 1, Math.max(0.015, a.fill));
    g.position.y = DECK.levelCenter.y + a.lift;
    materials[0].emissiveIntensity = a.glow * 0.9;
    materials[1].emissiveIntensity = a.glow * 0.35;

    const light = sceneLights[1];
    light.pos.copy(DECK_TOP).y += 0.35 + a.lift;
    light.strength = Math.max(light.strength, a.glow * 1.6 * (g.visible ? 1 : 0.4));
  });

  const showBurst = burstKey && phase === 'selecting';
  return (
    <group position={CAM0}>
      <group rotation={[PITCH, 0, 0]}>
        {/* 牌堆：躺平（厚度朝上），牌长朝里 */}
        <group ref={stackRef} position={DECK.levelCenter} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh geometry={geometry} material={materials} />
        </group>
        {/* 命中盒比牌堆大一圈，手势不用指得很准 */}
        <mesh ref={hitRef} position={[DECK.levelCenter.x, DECK.levelCenter.y + DECK.thickness / 2, DECK.levelCenter.z]}>
          <boxGeometry args={[DECK.width * 1.9, DECK.thickness * 4, DECK.length * 1.5]} />
          <meshBasicMaterial visible={false} />
        </mesh>
        {showBurst ? (
          <group key={burstKey} position={[0, DECK.levelCenter.y + DECK.thickness + 0.2, DECK.levelCenter.z]} scale={0.7}>
            <ParticleBurst position={[0, 0, 0]} />
          </group>
        ) : null}
      </group>
    </group>
  );
}

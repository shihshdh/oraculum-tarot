import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import { useTarotStore } from '../../store/useTarotStore';
import { TAROT_DECK } from '../../data/tarotDeck';
import { CARD_H, CARD_W, FACE_OFFSET, backMaterial, cardBodyGeometry, cardFaceGeometry, edgeMaterial, faceMaterial, slotFrameGeometry } from './cardKit';
import ParticleBurst from './ParticleBurst';

const SCALE = 0.9;
const INSPECT_SCALE = 1.2;
const hitGeo = new THREE.PlaneGeometry(CARD_W * SCALE, CARD_H * SCALE);
const hitMat = new THREE.MeshBasicMaterial({ visible: false });
const tmpPos = new THREE.Vector3();
const homeQ = new THREE.Quaternion();
const lookQ = new THREE.Quaternion();
const euler = new THREE.Euler();

/**
 * 下方五个卡位之一
 *   · 空位：一圈金色细框；下一张要落的位置在呼吸
 *   · 牌刚落位：背面朝上，从上方轻轻落下
 *   · 翻开：绕 Y 轴翻转（逆位再转 180°），金色粒子迸发，牌面短暂亮起
 */
export default function SlotCard({ slotId, position, flipped, reversed, tarotId, registerSlot }) {
  const groupRef = useRef();
  const frameMatRef = useRef();
  const [burst, setBurst] = useState(false);
  const prevFlipped = useRef(false);
  const prevTarot = useRef(null);
  const flash = useRef(0);
  const hitRef = useRef();
  const insp = useRef(0); // 端详的混合量：0 = 在桌上，1 = 浮在眼前
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    const hit = hitRef.current;
    if (!hit || !registerSlot) return;
    hit.userData.slotId = slotId;
    return registerSlot(hit);
  }, [registerSlot, slotId, tarotId, flipped]); // 命中盒在翻开后才挂载

  const phase = useTarotStore((s) => s.phase);
  const tarot = tarotId ? TAROT_DECK.find((t) => t.id === tarotId) : null;
  const faceMat = useMemo(() => (tarot ? faceMaterial(tarot) : null), [tarot]);
  useEffect(() => () => faceMat?.dispose(), [faceMat]);
  const bodyMats = useMemo(() => [backMaterial(), edgeMaterial()], []);

  // 落位
  useEffect(() => {
    const g = groupRef.current;
    if (g && tarotId && !prevTarot.current) {
      g.position.y = position[1] + 0.5;
      g.scale.setScalar(SCALE * 0.85);
      gsap.to(g.position, { y: position[1], duration: 0.45, ease: 'power3.out' });
      gsap.to(g.scale, { x: SCALE, y: SCALE, z: SCALE, duration: 0.45, ease: 'power3.out' });
    }
    prevTarot.current = tarotId;
  }, [tarotId, position]);

  // 翻牌
  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    if (flipped && !prevFlipped.current) {
      setBurst(true);
      gsap.to(g.rotation, { y: Math.PI, z: reversed ? Math.PI : 0, duration: 1.0, ease: 'power3.inOut' });
      gsap.to(g.position, { z: 0.6, duration: 0.5, yoyo: true, repeat: 1, ease: 'power2.inOut' });
      flash.current = 1.6;
      const t = setTimeout(() => setBurst(false), 2800);
      prevFlipped.current = flipped;
      return () => clearTimeout(t);
    }
    if (!flipped && prevFlipped.current) gsap.set(g.rotation, { y: 0, z: 0 });
    prevFlipped.current = flipped;
  }, [flipped, reversed]);

  useFrame((_, dt) => {
    const g = groupRef.current;
    const st = useTarotStore.getState();
    // 端详：牌从桌上浮起、飞到镜头前放大，轻轻摇晃并朝指针偏一点；放回时原路返回
    if (g && flipped && st.phase === 'done') {
      const target = st.inspectSlot === slotId ? 1 : 0;
      const before = insp.current;
      insp.current += (target - insp.current) * (1 - Math.exp(-dt * (target ? 5 : 7)));
      if (Math.abs(target - insp.current) < 0.001) insp.current = target;
      const k = insp.current;
      if (k > 0 || before > 0) {
        const t = performance.now() / 1000;
        const ease = k * k * (3 - 2 * k);
        // 眼前的位置：镜头正前方 3.8 个单位、略偏下
        tmpPos.set(camera.position.x, camera.position.y - 0.15, camera.position.z - 3.8);
        const arcLift = Math.sin(k * Math.PI) * 0.6; // 飞行时走一道弧线
        g.position.set(
          position[0] + (tmpPos.x - position[0]) * ease,
          position[1] + (tmpPos.y - position[1]) * ease + arcLift,
          position[2] + (tmpPos.z - position[2]) * ease
        );
        g.scale.setScalar(SCALE + (INSPECT_SCALE - SCALE) * ease);
        homeQ.setFromEuler(euler.set(0, Math.PI, reversed ? Math.PI : 0));
        const px = st.cursor.visible ? st.cursor.x * 2 - 1 : 0;
        const py = st.cursor.visible ? st.cursor.y * 2 - 1 : 0;
        lookQ.setFromEuler(euler.set(py * 0.18 + Math.sin(t * 0.9) * 0.03, Math.PI + px * 0.28 + Math.sin(t * 0.6) * 0.06, reversed ? Math.PI : 0));
        g.quaternion.copy(homeQ).slerp(lookQ, ease);
      }
    }
    if (faceMat) {
      flash.current = Math.max(0, flash.current - dt * 0.9);
      faceMat.emissiveIntensity = 0.1 + flash.current * 0.6;
    }
    if (frameMatRef.current) {
      const s = useTarotStore.getState();
      const next = s.cards.find((c) => !c.tarotId)?.slotId === slotId && s.phase === 'selecting';
      const t = performance.now() / 1000;
      frameMatRef.current.opacity = next ? 0.55 + Math.sin(t * 3) * 0.3 : 0.22;
    }
  });

  if (!tarotId) {
    if (phase !== 'selecting' && phase !== 'revealing' && phase !== 'done') return null;
    return (
      <group position={position} scale={SCALE}>
        <mesh geometry={slotFrameGeometry()}>
          <meshBasicMaterial ref={frameMatRef} color="#f0d59c" transparent opacity={0.25} toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
    );
  }

  return (
    <>
    {flipped && <mesh ref={hitRef} geometry={hitGeo} material={hitMat} position={position} />}
    <group ref={groupRef} position={position} scale={SCALE}>
      <mesh geometry={cardBodyGeometry()} material={bodyMats} />
      {faceMat && <mesh geometry={cardFaceGeometry()} material={faceMat} position={[0, 0, -FACE_OFFSET]} rotation={[0, Math.PI, 0]} />}
      {burst && <ParticleBurst />}
    </group>
    </>
  );
}

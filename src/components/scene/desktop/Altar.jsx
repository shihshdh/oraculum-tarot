import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { MeshReflectorMaterial } from '@react-three/drei';
import { useTarotStore } from '../../../store/useTarotStore';
import { ALTAR, TABLE_POSE, getTableCanvases, tableGeometry, tableTextures } from './altarShape';

/**
 * 占卜桌（客户端版）：漆面樱桃木的椭圆桌板，桌面镶黄铜花纹，边缘倒圆角。
 *   · 木纹、粗糙度、法线都是真实扫描的 PBR 贴图（Poly Haven · Lacquered Cherry Wood，CC0），按真实尺寸铺
 *   · 桌面用实时反射模拟钢琴漆：牌、光轨、光尘都会映在上面
 *   · 翻牌后路径追踪算出更精细的版本（清漆层、黄铜高光），渐变盖在它上面，几何与贴图完全一致
 */
export default function Altar() {
  const phase = useTarotStore((s) => s.phase);
  const [textures, setTextures] = useState(null);
  const geometry = useMemo(() => tableGeometry(), []);
  // 桌子正上方一盏暖色吊灯：照出木纹和漆面上的高光渐变（光追里是同位置的面光源）
  const lamp = useMemo(() => {
    const l = new THREE.SpotLight('#ffd9a8', 60, 22, 0.62, 0.9, 1.4);
    l.position.set(0, ALTAR.y + 7.5, ALTAR.z + 2.2);
    l.target.position.set(0, ALTAR.y, ALTAR.z);
    return l;
  }, []);

  useEffect(() => {
    let alive = true;
    getTableCanvases().then((c) => { if (alive) setTextures(tableTextures(c)); }).catch((e) => console.warn('[Altar] 桌面贴图加载失败', e));
    return () => { alive = false; };
  }, []);
  useEffect(() => () => {
    if (!textures) return;
    [...Object.values(textures.top), ...Object.values(textures.side)].forEach((t) => t.dispose());
  }, [textures]);

  if (!textures || (phase !== 'selecting' && phase !== 'revealing' && phase !== 'done')) return null;
  return (
    <group>
    <primitive object={lamp} />
    <primitive object={lamp.target} />
    <mesh geometry={geometry} position={TABLE_POSE.position} rotation={TABLE_POSE.rotation}>
      <MeshReflectorMaterial
        attach="material-0"
        {...textures.top}
        metalness={1}
        roughness={1}
        normalScale={[0.6, 0.6]}
        envMapIntensity={0.9}
        mirror={0.6}
        mixStrength={1.1}
        mixBlur={0.8}
        mixContrast={1.05}
        blur={[180, 60]}
        resolution={1024}
        depthScale={0}
      />
      <meshStandardMaterial attach="material-1" {...textures.side} color="#c4a8a4" roughness={0.9} metalness={0} envMapIntensity={0.8} />
    </mesh>
    </group>
  );
}

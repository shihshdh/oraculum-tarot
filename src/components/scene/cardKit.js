// 牌的"实体"：圆角、有厚度、描金边的卡片几何体，以及几种共享材质。
// 所有牌共用同一份几何体和纹理，只有需要单独变化（发光、透明度）的牌才克隆材质。
import * as THREE from 'three';
import { CARD_BACK_URL, getCardImageUrl } from '../../data/tarotDeck';
import { DESKTOP } from '../../lib/edition';

export const CARD_W = 1;
export const CARD_H = 1.732; // 与 1909 版扫描件同比例
const RADIUS = 0.07;
const DEPTH = 0.014;

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** 把平面坐标换成 0..1 的贴图坐标（ExtrudeGeometry 默认直接用世界坐标） */
function normalizeUV(geo, w, h, count) {
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  uv.needsUpdate = true;
}

let bodyGeo = null;
/** 牌身：group 0 = 正反两面，group 1 = 侧边（描金） */
export function cardBodyGeometry() {
  if (bodyGeo) return bodyGeo;
  const geo = new THREE.ExtrudeGeometry(roundedRect(CARD_W, CARD_H, RADIUS), { depth: DEPTH, bevelEnabled: false, curveSegments: 6 });
  geo.translate(0, 0, -DEPTH / 2);
  const caps = geo.groups.find((g) => g.materialIndex === 0);
  normalizeUV(geo, CARD_W, CARD_H, caps.start + caps.count);
  geo.computeVertexNormals();
  bodyGeo = geo;
  return geo;
}

let faceGeo = null;
/** 牌面贴片：贴在牌身背面，翻过来时朝向镜头 */
export function cardFaceGeometry() {
  if (faceGeo) return faceGeo;
  const geo = new THREE.ShapeGeometry(roundedRect(CARD_W, CARD_H, RADIUS), 6);
  normalizeUV(geo, CARD_W, CARD_H, geo.attributes.position.count);
  faceGeo = geo;
  return geo;
}
export const FACE_OFFSET = DEPTH / 2 + 0.0008;

let slotGeo = null;
/** 空卡位的金色细框 */
export function slotFrameGeometry() {
  if (slotGeo) return slotGeo;
  const outer = roundedRect(CARD_W * 0.92, CARD_H * 0.92, RADIUS);
  outer.holes.push(roundedRect(CARD_W * 0.92 - 0.025, CARD_H * 0.92 - 0.025, RADIUS * 0.8));
  slotGeo = new THREE.ShapeGeometry(outer, 8);
  return slotGeo;
}

// ---------- 纹理 ----------
const loader = new THREE.TextureLoader();
const cache = new Map();
let maxAniso = 8;
export const setMaxAnisotropy = (n) => { maxAniso = n; };

function texture(url, srgb = true) {
  if (cache.has(url)) return cache.get(url);
  const tex = loader.load(url, (t) => { t.anisotropy = maxAniso; t.needsUpdate = true; });
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = maxAniso;
  cache.set(url, tex);
  return tex;
}
export const backTexture = () => texture(CARD_BACK_URL);
export const foilTexture = () => texture('/textures/card-back-foil.png', false);
export const faceTexture = (tarot) => texture(getCardImageUrl(tarot));

// ---------- 流光（客户端版） ----------
// 一道斜向的光带扫过牌背：烫金部分亮得多、纸面只微微发亮。光带按屏幕位置错开，
// 牌河里的牌不是同时闪，而是像一道光从左到右流过去。
export const sheenTime = { value: 0 };
function withSheen(mat) {
  if (!DESKTOP) return mat;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSheenTime = sheenTime;
    shader.fragmentShader = 'uniform float uSheenTime;\n' + shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      {
        float sweep = vMapUv.x * 0.7 + vMapUv.y * 0.45 - vViewPosition.x * 0.09;
        float band = sweep - fract(uSheenTime * 0.16) * 4.2 + 1.6;
        float sheen = exp(-band * band * 70.0);
        float foil = texture2D(emissiveMap, vEmissiveMapUv).r;
        totalEmissiveRadiance += vec3(1.0, 0.84, 0.56) * sheen * (0.12 + foil * 1.9);
      }`
    );
  };
  mat.customProgramCacheKey = () => 'sheen';
  return mat;
}

// ---------- 材质 ----------
let backMat = null;
/** 牌背：夜蓝纸 + 烫金。金箔部分是金属，会反射环境光；悬停时金箔发光。 */
export function backMaterial() {
  if (!backMat) {
    backMat = withSheen(new THREE.MeshPhysicalMaterial({
      map: backTexture(),
      metalnessMap: foilTexture(),
      metalness: 1,
      roughness: 0.32,
      clearcoat: 0.6,
      clearcoatRoughness: 0.18,
      emissive: new THREE.Color('#f3d49a'),
      emissiveMap: foilTexture(),
      emissiveIntensity: 0.08,
      envMapIntensity: 1.2,
    }));
  }
  return backMat;
}

let riverMat = null;
/** 牌河里的 78 张牌：同样的烫金反光，但不要清漆层——同屏牌多，省下一半的像素计算 */
export function riverBackMaterial() {
  if (!riverMat) {
    riverMat = withSheen(new THREE.MeshStandardMaterial({
      map: backTexture(),
      metalnessMap: foilTexture(),
      metalness: 1,
      roughness: 0.32,
      emissive: new THREE.Color('#f3d49a'),
      emissiveMap: foilTexture(),
      emissiveIntensity: 0.08,
      envMapIntensity: 1.3,
    }));
  }
  return riverMat;
}

let edgeMat = null;
export function edgeMaterial() {
  if (!edgeMat) edgeMat = new THREE.MeshStandardMaterial({ color: '#d9b36a', metalness: 1, roughness: 0.28, envMapIntensity: 1.4 });
  return edgeMat;
}

/** 牌面：覆膜纸的质感，一层很薄的清漆高光 */
export function faceMaterial(tarot) {
  return new THREE.MeshPhysicalMaterial({
    map: faceTexture(tarot),
    roughness: 0.55,
    clearcoat: 0.35,
    clearcoatRoughness: 0.35,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: faceTexture(tarot),
    emissiveIntensity: 0.12,
    envMapIntensity: 0.8,
  });
}

/** 预热：进牌阵前把共享纹理先加载好，避免第一次出现时卡一下 */
export function warmCardTextures() {
  backTexture();
  foilTexture();
}

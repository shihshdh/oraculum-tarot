// 占卜桌：尺寸、几何体、贴图。实时画面（Altar.jsx）和光追场景（RayTrace.jsx）共用，光追渐变盖上来时严丝合缝
import * as THREE from 'three';
import { CARD_H } from '../cardKit';
import { SLOT_Y } from '../CardArray';

export const ALTAR = {
  y: SLOT_Y - (CARD_H * 0.9) / 2 - 0.02, // 台面高度：牌底边刚好立在上面
  z: 0.2,
  radius: 4.2,
  scaleX: 1.9, // 压扁成椭圆台面
  scaleZ: 0.55,
  thickness: 0.08,
  rimRadius: 4.25,
  rimTube: 0.018,
};

/**
 * 台面花纹（程序绘制，2048×2048）：
 *   外圈黄道十二分与刻度 → 一圈小圆（呼应背后的星盘） → 藤蔓卷纹花瓣 → 八芒星 → 正中四芒星（与标志同形）
 * withBase = false：透明底、只有金线（实时画面里叠在镜面上，不挡倒影）
 * withBase = true ：深色台面 + 金线（光追里直接当台面贴图）
 */
export function drawAltarPattern(withBase) {
  const S = 2048;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const C = S / 2;
  const R = S / 2;
  if (withBase) {
    const bg = g.createRadialGradient(C, C, 0, C, C, R);
    bg.addColorStop(0, '#1a1433');
    bg.addColorStop(1, '#0b0818');
    g.fillStyle = bg;
    g.fillRect(0, 0, S, S);
  }
  const gold = (a) => `rgba(240, 206, 140, ${a})`;
  const ring = (r, w, a) => { g.beginPath(); g.arc(C, C, r * R, 0, Math.PI * 2); g.lineWidth = w; g.strokeStyle = gold(a); g.stroke(); };
  const polar = (r, t) => [C + Math.cos(t) * r * R, C + Math.sin(t) * r * R];
  g.lineCap = 'round';

  // 外圈：双线环 + 黄道十二分 + 72 道刻度
  ring(0.975, 7, 0.9);
  ring(0.955, 3, 0.7);
  ring(0.8, 4, 0.8);
  ring(0.785, 2, 0.5);
  for (let i = 0; i < 72; i++) {
    const t = (i / 72) * Math.PI * 2;
    const long = i % 6 === 0;
    const [x1, y1] = polar(0.955, t);
    const [x2, y2] = polar(long ? 0.8 : 0.925, t);
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2);
    g.lineWidth = long ? 4 : 2; g.strokeStyle = gold(long ? 0.85 : 0.55); g.stroke();
  }
  // 每一格里一颗小菱形星
  for (let i = 0; i < 12; i++) {
    const t = ((i + 0.5) / 12) * Math.PI * 2;
    const [x, y] = polar(0.875, t);
    g.save(); g.translate(x, y); g.rotate(t);
    g.beginPath(); g.moveTo(0, -26); g.lineTo(9, 0); g.lineTo(0, 26); g.lineTo(-9, 0); g.closePath();
    g.fillStyle = gold(0.75); g.fill();
    g.restore();
  }
  // 一圈小圆
  ring(0.66, 3, 0.7);
  for (let i = 0; i < 12; i++) {
    const [x, y] = polar(0.725, (i / 12) * Math.PI * 2);
    g.beginPath(); g.arc(x, y, 0.035 * R, 0, Math.PI * 2); g.lineWidth = 3; g.strokeStyle = gold(0.75); g.stroke();
  }
  // 藤蔓卷纹：24 片花瓣，每片末端卷一个小涡
  for (let i = 0; i < 24; i++) {
    const t = (i / 24) * Math.PI * 2;
    const [ax, ay] = polar(0.36, t);
    const [bx, by] = polar(0.64, t + 0.13);
    const [cx1, cy1] = polar(0.52, t - 0.1);
    g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(cx1, cy1, bx, by);
    g.lineWidth = 3; g.strokeStyle = gold(0.6); g.stroke();
    const [ex, ey] = polar(0.6, t + 0.08);
    g.beginPath(); g.arc(ex, ey, 0.018 * R, t, t + Math.PI * 1.6); g.lineWidth = 2.5; g.stroke();
  }
  ring(0.36, 4, 0.8);
  ring(0.345, 2, 0.5);
  // 八芒星：两个错开 45° 的正方形
  for (const off of [0, Math.PI / 4]) {
    g.beginPath();
    for (let k = 0; k < 4; k++) { const [x, y] = polar(0.34, off + (k / 4) * Math.PI * 2); k ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath(); g.lineWidth = 3; g.strokeStyle = gold(0.65); g.stroke();
  }
  ring(0.2, 3, 0.7);
  // 正中四芒星（与标志同形）
  g.beginPath();
  for (let k = 0; k < 8; k++) {
    const r = k % 2 ? 0.045 : 0.17;
    const [x, y] = polar(r, (k / 8) * Math.PI * 2 - Math.PI / 2);
    k ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath(); g.fillStyle = gold(0.9); g.fill();
  return c;
}

/**
 * 黄铜镶嵌纹样（遮罩，白线透明底）：真实家具上常见的克制做法——
 * 桌沿内侧一道双线镶边 + 细刻度，十二颗小菱形星，中央一圈细线和一枚小四芒星。线宽按真实铜丝约 1.5–3 毫米。
 */
export function drawInlayPattern() {
  const S = 2048;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const C = S / 2;
  const R = S / 2;
  const white = '#fff';
  const ring = (r, w) => { g.beginPath(); g.arc(C, C, r * R, 0, Math.PI * 2); g.lineWidth = w; g.strokeStyle = white; g.stroke(); };
  const polar = (r, t) => [C + Math.cos(t) * r * R, C + Math.sin(t) * r * R];
  g.lineCap = 'round';
  ring(0.93, 7);
  ring(0.905, 3);
  for (let i = 0; i < 72; i++) {
    const t = (i / 72) * Math.PI * 2;
    const long = i % 6 === 0;
    const [x1, y1] = polar(0.905, t);
    const [x2, y2] = polar(long ? 0.862 : 0.884, t);
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineWidth = long ? 3.5 : 2; g.strokeStyle = white; g.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const t = ((i + 0.5) / 12) * Math.PI * 2;
    const [x, y] = polar(0.83, t);
    g.save(); g.translate(x, y); g.rotate(t);
    g.beginPath(); g.moveTo(0, -18); g.lineTo(6, 0); g.lineTo(0, 18); g.lineTo(-6, 0); g.closePath();
    g.fillStyle = white; g.fill();
    g.restore();
  }
  ring(0.22, 3);
  g.beginPath();
  for (let k = 0; k < 8; k++) {
    const r = k % 2 ? 0.025 : 0.1;
    const [x, y] = polar(r, (k / 8) * Math.PI * 2 - Math.PI / 2);
    k ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath(); g.fillStyle = white; g.fill();
  return c;
}

// ---------- 桌板 ----------
// 场景里一张牌宽 1 个单位 ≈ 7 厘米；木纹扫描贴图覆盖 1 米 × 1 米 ≈ 14 个单位
const WOOD_TILE = 14;
export const TABLE = {
  width: ALTAR.radius * ALTAR.scaleX * 2,
  depth: ALTAR.radius * ALTAR.scaleZ * 2,
  thickness: 0.14,
  bevel: 0.045,
};

/**
 * 椭圆桌板：有厚度、边缘倒圆角。group 0 = 桌面与底面，group 1 = 侧边与圆角。
 * 桌面的 UV 归一化到外接矩形 0..1（贴图按真实比例预先铺好），侧边 UV 用世界单位（贴图 repeat = 1/14）。
 * 几何体平放在本地 XY 平面、顶面在 z = 0，用 TABLE_POSE 摆到桌面位置。
 */
export function tableGeometry() {
  const { width: W, depth: D, thickness, bevel } = TABLE;
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, W / 2, D / 2, 0, Math.PI * 2, false, 0);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness, curveSegments: 160,
    bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 6,
  });
  const caps = geo.groups.find((g) => g.materialIndex === 0);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = caps.start; i < caps.start + caps.count; i++) {
    uv.setXY(i, pos.getX(i) / W + 0.5, pos.getY(i) / D + 0.5);
  }
  uv.needsUpdate = true;
  // 顶面放到本地 z = 0：drei 的镜面反射材质以物体本地 +Z 为反射面法线、以物体原点为反射面
  geo.translate(0, 0, -(thickness + bevel));
  geo.computeVertexNormals();
  return geo;
}

/** 桌板的摆放：本地 XY 平面转成世界 XZ 平面，顶面落在 ALTAR.y */
export const TABLE_POSE = { position: [0, ALTAR.y, ALTAR.z], rotation: [-Math.PI / 2, 0, 0] };

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * 桌面贴图（一次合成、两边共用）：漆面樱桃木的扫描贴图按真实尺寸铺满桌面，
 * 再把黄铜花纹"镶"进去——颜色换成黄铜、金属度 1、粗糙度略高、法线抹平（像嵌进木头里的铜丝）。
 * 返回四张画布：color / roughness / metalness / normal，UV 与 tableGeometry() 的桌面一致。
 */
let canvasesPromise = null;
export function getTableCanvases() {
  if (canvasesPromise) return canvasesPromise;
  canvasesPromise = (async () => {
    const [diff, rough, nor] = await Promise.all(['diff', 'rough', 'nor_gl'].map((m) => loadImage(`/textures/table/wood_${m}.jpg`)));
    const CW = 4096;
    const CH = Math.round((CW * TABLE.depth) / TABLE.width);
    const make = () => { const c = document.createElement('canvas'); c.width = CW; c.height = CH; return c; };
    const tile = (img) => {
      const c = make();
      const g = c.getContext('2d');
      const s = (CW * WOOD_TILE) / TABLE.width / img.width; // 一张贴图 = 14 个单位
      g.setTransform(s, 0, 0, s, 0, 0);
      g.fillStyle = g.createPattern(img, 'repeat');
      g.fillRect(0, 0, CW / s, CH / s);
      g.setTransform(1, 0, 0, 1, 0, 0);
      return c;
    };

    // 花纹遮罩：方形花纹拉伸到桌面的外接矩形 → 贴合椭圆桌面
    const mask = make();
    mask.getContext('2d').drawImage(drawInlayPattern(), 0, 0, CW, CH);
    const layer = (fill) => {
      const c = make();
      const g = c.getContext('2d');
      g.fillStyle = fill;
      g.fillRect(0, 0, CW, CH);
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(mask, 0, 0);
      return c;
    };

    const color = tile(diff);
    {
      const g = color.getContext('2d');
      // 保留樱桃木本色，只把桌沿轻轻压暗（老家具常年摩挲的包浆感）
      g.globalCompositeOperation = 'multiply';
      const shade = g.createRadialGradient(CW / 2, CH / 2, CW * 0.2, CW / 2, CH / 2, CW / 2);
      shade.addColorStop(0, 'rgb(255,250,245)');
      shade.addColorStop(1, 'rgb(175,160,155)');
      g.fillStyle = shade;
      g.fillRect(0, 0, CW, CH);
      g.globalCompositeOperation = 'source-over';
      const brass = g.createLinearGradient(0, 0, CW, CH);
      // 做旧黄铜
      brass.addColorStop(0, '#a8844a');
      brass.addColorStop(0.5, '#c29d5c');
      brass.addColorStop(1, '#9c7840');
      g.drawImage(layer(brass), 0, 0);
    }
    const roughness = tile(rough);
    roughness.getContext('2d').drawImage(layer('rgb(95,95,95)'), 0, 0); // 做旧黄铜：粗糙度约 0.37
    const metalness = make();
    {
      const g = metalness.getContext('2d');
      g.fillStyle = '#000';
      g.fillRect(0, 0, CW, CH);
      g.drawImage(layer('#fff'), 0, 0);
    }
    const normal = tile(nor);
    normal.getContext('2d').drawImage(layer('rgb(128,128,255)'), 0, 0); // 铜丝是平的
    return { color, roughness, metalness, normal, woodDiff: diff, woodRough: rough, woodNormal: nor };
  })();
  return canvasesPromise;
}

/** 由合成好的画布建桌面贴图（每个渲染器各建一份） */
export function tableTextures(canvases) {
  const t = (c, srgb) => {
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = 16;
    return tex;
  };
  const side = (img, srgb) => {
    const tex = new THREE.Texture(img);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1 / WOOD_TILE, 1 / WOOD_TILE);
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.needsUpdate = true;
    return tex;
  };
  return {
    top: { map: t(canvases.color, true), roughnessMap: t(canvases.roughness), metalnessMap: t(canvases.metalness), normalMap: t(canvases.normal) },
    side: { map: side(canvases.woodDiff, true), roughnessMap: side(canvases.woodRough), normalMap: side(canvases.woodNormal) },
  };
}

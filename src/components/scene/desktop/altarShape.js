// 黑曜石镜面台的尺寸：实时画面（Altar.jsx）和光追场景（RayTrace.jsx）共用，光追渐变盖上来时严丝合缝
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

/**
 * ORACULUM 标志（64 单位网格）：拱顶的牌框里，四片菱形碎片拼成一颗四芒星，底下一条牌名栏。
 * 四片碎片对应 Pixel Reconstruction 标志里的四颗像素——开场时它们是四块液态玻璃，从屏幕四角飞来拼合。
 * data-part 供开场动画单独驱动各部分，不改变图形本身。
 */
export const SHARDS = [
  // cx, cy：菱形中心；w, h：半宽、半长；r：旋转（度）；o：不透明度
  { cx: 32, cy: 29, w: 3.3, h: 7.5, r: 0, o: 1 },
  { cx: 38, cy: 36.5, w: 3, h: 6, r: 90, o: 0.64 },
  { cx: 32, cy: 44, w: 3.3, h: 7.5, r: 0, o: 0.36 },
  { cx: 26, cy: 36.5, w: 3, h: 6, r: 90, o: 0.64 },
];
export const ARCH = 'M18 58V24a14 14 0 0 1 28 0v34Z';
export const BAR = 'M25 54.5h14';

const shardPath = ({ cx, cy, w, h, r }) => {
  const rad = (r * Math.PI) / 180;
  const pts = [[0, -h], [w, 0], [0, h], [-w, 0]].map(([x, y]) => [cx + x * Math.cos(rad) - y * Math.sin(rad), cy + x * Math.sin(rad) + y * Math.cos(rad)]);
  return `M${pts.map((p) => p.map((v) => +v.toFixed(2)).join(' ')).join('L')}Z`;
};
export const SHARD_PATHS = SHARDS.map(shardPath);

export default function BrandMark({ size = 32, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} style={style} aria-hidden="true" data-mark="">
      <path data-part="shell" d={ARCH} fill="currentColor" fillOpacity=".07" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
      <path data-part="bar" d={BAR} stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" opacity=".7" />
      {SHARD_PATHS.map((d, i) => (
        <path key={i} data-part="shard" d={d} fill="currentColor" opacity={SHARDS[i].o} style={{ '--i': i }} />
      ))}
    </svg>
  );
}

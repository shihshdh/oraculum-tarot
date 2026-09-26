/** 等待状态：四颗星顺时针交换位置，最亮的那颗领头。只是装饰，除非给了 label。 */
export default function StarLoader({ size = 14, label, className = '', style }) {
  return (
    <span
      className={`star-loader ${className}`}
      style={{ '--sl': `${size}px`, ...style }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <i /><i /><i /><i />
    </span>
  );
}

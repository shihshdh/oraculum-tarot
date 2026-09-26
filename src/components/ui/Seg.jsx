import { useLayoutEffect, useRef, useState } from 'react';

/**
 * 液态分段选择：选中项下面有一滴玻璃，切换时滑过去。
 * items: [{ value, label, title? }]；readOnly 时只做指示（例如阶段进度）。
 */
export default function Seg({ items, value, onChange, readOnly = false, ariaLabel, className = '', size = 'md' }) {
  const rootRef = useRef(null);
  const [thumb, setThumb] = useState(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const el = root.querySelector('[data-seg-active]');
      if (!el) return setThumb(null);
      setThumb({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [value, items.length]);

  return (
    <div ref={rootRef} className={`seg ${className}`} role={readOnly ? 'list' : 'group'} aria-label={ariaLabel}>
      {thumb && <span className="seg-thumb" aria-hidden="true" style={{ transform: `translate3d(${thumb.x}px,0,0)`, width: thumb.w }} />}
      {items.map((item) => {
        const active = item.value === value;
        const common = {
          className: 'seg-btn',
          'data-seg-active': active ? '' : undefined,
          title: item.title,
          style: size === 'sm' ? { height: 26, padding: '0 11px', fontSize: 11.5 } : undefined,
        };
        return readOnly ? (
          <span key={item.value} {...common} role="listitem" aria-current={active ? 'step' : undefined} style={{ ...common.style, display: 'inline-flex', alignItems: 'center', cursor: 'default' }}>
            {item.label}
          </span>
        ) : (
          <button key={item.value} {...common} type="button" aria-pressed={active} onClick={() => onChange?.(item.value)}>
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

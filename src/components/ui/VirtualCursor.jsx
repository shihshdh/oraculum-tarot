import { useEffect, useRef } from 'react';
import { useTarotStore } from '../../store/useTarotStore';

/**
 * 手势光标：一枚小玻璃透镜。直接写 DOM（绕开 React 渲染，60fps）。
 * 捏合时收紧并亮起；悬停在牌上时外圈变金。鼠标/触屏时隐藏（系统指针就够了）。
 */
export default function VirtualCursor() {
  const ref = useRef(null);

  useEffect(() => {
    const apply = (s) => {
      const el = ref.current;
      if (!el) return;
      const x = s.cursor.x * window.innerWidth;
      const y = s.cursor.y * window.innerHeight;
      // 两指靠近时圆环逐渐收紧、变金；捏上时收到最小
      const amount = s.isPinching ? 1 : s.pinchAmount || 0;
      el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${1 - amount * 0.42})`;
      el.style.setProperty('--pinch', amount.toFixed(2));
      el.style.opacity = s.cursor.visible && s.cursorSource === 'gesture' ? '1' : '0';
      el.dataset.pinch = s.isPinching ? '1' : '';
      el.dataset.hover = s.hoveredRiverId ? '1' : '';
    };
    apply(useTarotStore.getState());
    return useTarotStore.subscribe(apply);
  }, []);

  return (
    <div ref={ref} className="gesture-cursor pointer-events-none fixed left-0 top-0 z-[980]" aria-hidden="true">
      <span />
      <style>{`
        .gesture-cursor { width: 52px; height: 52px; border-radius: 50%; opacity: 0; will-change: transform, opacity;
          transition: transform 40ms linear, opacity 300ms ease;
          background: radial-gradient(circle at 32% 26%, rgba(255,252,240,.55), rgba(255,255,255,.08) 42%, rgba(185,166,255,.12) 75%, rgba(255,246,225,.25));
          border: 1px solid rgba(255,249,232,.55);
          box-shadow: inset 1px 1px 2px rgba(255,255,255,.7), inset -1px -2px 4px rgba(80,60,150,.35), 0 6px 20px rgba(0,0,0,.4);
          -webkit-backdrop-filter: blur(2px) saturate(170%); backdrop-filter: blur(2px) saturate(170%); }
        .gesture-cursor > span { position: absolute; left: 50%; top: 50%; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%; background: var(--gold); box-shadow: 0 0 10px var(--gold); }
        .gesture-cursor[data-hover="1"] { border-color: var(--gold); box-shadow: inset 1px 1px 2px rgba(255,255,255,.7), 0 0 26px rgba(233,203,139,.55); }
        .gesture-cursor { border-color: color-mix(in srgb, var(--gold) calc(var(--pinch, 0) * 100%), rgba(255,249,232,.55)); }
        .gesture-cursor[data-pinch="1"] { background: radial-gradient(circle, rgba(233,203,139,.55), rgba(233,203,139,.1) 70%); }
      `}</style>
    </div>
  );
}

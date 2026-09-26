// 液态玻璃的交互层：
//   1. 指针高光：光标/手指/手势光标下的玻璃元素写入 --pointer-x/--pointer-y，高光跟着走
//   2. 手势点击：手势捏合的上升沿 = 点击光标下的按钮（任何 DOM 按钮都能隔空按）
//   3. 手势悬停：手势光标下的按钮打上 data-gesture-hover，得到和鼠标 hover 一样的反馈

import { useEffect } from 'react';
import { useTarotStore } from '../store/useTarotStore';

const SURFACES = '.glass, .glass-btn, .seg';
const CLICKABLE = 'button, a[href], [role="button"], summary, label[for]';

function light(target, x, y) {
  const el = target?.closest?.(SURFACES);
  if (!el) return;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  el.style.setProperty('--pointer-x', `${Math.round(((x - r.left) / r.width) * 100)}%`);
  el.style.setProperty('--pointer-y', `${Math.round(((y - r.top) / r.height) * 100)}%`);
}

function underCursor(cursor) {
  const x = cursor.x * window.innerWidth;
  const y = cursor.y * window.innerHeight;
  // 手势光标本身 pointer-events:none，不会挡住
  return { el: document.elementFromPoint(x, y), x, y };
}

export function useLiquidInteractions() {
  // 鼠标 / 触摸
  useEffect(() => {
    let frame = 0;
    let last = null;
    const move = (event) => {
      last = event;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (last) light(last.target, last.clientX, last.clientY);
      });
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', move, { passive: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', move);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // 手势：悬停反馈 + 捏合点击
  useEffect(() => {
    let hovered = null;
    let wasPinching = false;
    const clear = () => {
      hovered?.removeAttribute('data-gesture-hover');
      hovered = null;
    };
    const unsubscribe = useTarotStore.subscribe(
      (s) => [s.cursor, s.cursorSource, s.isPinching, s.isMirror],
      ([cursor, source, pinching, mirror]) => {
        if (mirror || source !== 'gesture' || !cursor.visible) {
          clear();
          wasPinching = pinching;
          return;
        }
        const { el, x, y } = underCursor(cursor);
        light(el, x, y);
        const target = el?.closest?.(CLICKABLE) || null;
        if (target !== hovered) {
          clear();
          if (target) {
            hovered = target;
            target.setAttribute('data-gesture-hover', '');
          }
        }
        // 捏合上升沿：按下光标下的按钮。输入框聚焦，方便接着用键盘。
        if (pinching && !wasPinching && el) {
          const field = el.closest('input, textarea');
          if (field) field.focus();
          else if (target && !target.disabled && target.getAttribute('aria-disabled') !== 'true') target.click();
        }
        wasPinching = pinching;
      },
      { equalityFn: (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3] }
    );
    return () => {
      unsubscribe();
      clear();
    };
  }, []);
}

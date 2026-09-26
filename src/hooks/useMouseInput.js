import { useEffect, useRef } from 'react';
import { useTarotStore } from '../store/useTarotStore';

/**
 * 鼠标/触摸输入 Hook
 *
 * - 鼠标/触摸移动 → 若手势近 600ms 内未更新，则接管光标位置
 * - 鼠标/触摸短按 → 触发一次 pinch（捏合）选牌
 * - 长按 ≥ 400ms → 牌河加速滚动（松手即停）
 *
 * 悬停在按钮 / input / textarea / a / [data-no-card-click] 上的按下
 * 不会触发 pinch，也不会启动长按加速。
 */
const LONG_PRESS_MS = 400;
// 手机上轻点一次，浏览器会在 touchend 之后再补发一套模拟的 mousedown/mouseup。
// 触摸后这段时间内的鼠标事件一律忽略，否则一次轻点会选两张牌（同一张牌进两个卡位）。
const EMULATED_MOUSE_MS = 800;

export function useMouseInput() {
  const setCursor = useTarotStore((s) => s.setCursor);
  const triggerMouseClick = useTarotStore((s) => s.triggerMouseClick);
  const setRiverAccelerate = useTarotStore((s) => s.setRiverAccelerate);
  const isMirror = useTarotStore((s) => s.isMirror);

  const pressDownRef = useRef(null); // { x, y, timer, accelerateOn }
  const lastTouchRef = useRef(-Infinity);

  useEffect(() => {
    if (isMirror) return;

    const isInteractive = (target) =>
      target.closest?.('button') ||
      target.closest?.('input') ||
      target.closest?.('textarea') ||
      target.closest?.('a') ||
      target.closest?.('[data-no-card-click]');

    const setCursorFromPoint = (clientX, clientY, source = 'mouse') => {
      const x = clientX / window.innerWidth;
      const y = clientY / window.innerHeight;
      setCursor(x, y, true, source);
    };

    // ---------- MOUSE ----------
    const emulated = () => performance.now() - lastTouchRef.current < EMULATED_MOUSE_MS;

    const handleMouseMove = (e) => {
      if (emulated()) return;
      const state = useTarotStore.getState();
      const now = performance.now();
      if (
        state.cursor.visible &&
        state.cursorSource === 'gesture' &&
        now - state.lastGestureUpdate < 600
      ) {
        return;
      }
      setCursorFromPoint(e.clientX, e.clientY, 'mouse');
    };

    const startPress = (clientX, clientY, target, source) => {
      if (isInteractive(target)) return;
      setCursorFromPoint(clientX, clientY, source);
      // 启动长按计时器 - 触发后牌河加速
      const timer = setTimeout(() => {
        setRiverAccelerate(true);
        if (pressDownRef.current) pressDownRef.current.accelerateOn = true;
      }, LONG_PRESS_MS);
      pressDownRef.current = {
        x: clientX,
        y: clientY,
        timer,
        accelerateOn: false,
        source,
      };
    };

    const endPress = () => {
      const p = pressDownRef.current;
      if (!p) return;
      clearTimeout(p.timer);
      if (p.accelerateOn) {
        // 是长按 → 仅停止加速，不触发 pinch（避免松手同时也选牌）
        setRiverAccelerate(false);
      } else {
        // 短按 → 触发一次 pinch 选牌
        requestAnimationFrame(() => triggerMouseClick());
      }
      pressDownRef.current = null;
    };

    const cancelPress = () => {
      const p = pressDownRef.current;
      if (!p) return;
      clearTimeout(p.timer);
      if (p.accelerateOn) setRiverAccelerate(false);
      pressDownRef.current = null;
    };

    const handleMouseDown = (e) => {
      if (emulated()) return;
      startPress(e.clientX, e.clientY, e.target, 'mouse');
    };
    const handleMouseUp = () => {
      if (!emulated()) endPress();
    };

    // ---------- TOUCH ----------
    const handleTouchStart = (e) => {
      lastTouchRef.current = performance.now();
      if (e.touches.length !== 1) {
        cancelPress();
        return;
      }
      const t = e.touches[0];
      startPress(t.clientX, t.clientY, e.target, 'mouse');
    };
    const handleTouchMove = (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const p = pressDownRef.current;
      // 移动超过 30px 取消长按（避免误触）
      if (p && !p.accelerateOn) {
        const moved = Math.hypot(t.clientX - p.x, t.clientY - p.y);
        if (moved > 30) cancelPress();
      }
      const state = useTarotStore.getState();
      const now = performance.now();
      if (
        state.cursor.visible &&
        state.cursorSource === 'gesture' &&
        now - state.lastGestureUpdate < 600
      )
        return;
      setCursorFromPoint(t.clientX, t.clientY, 'mouse');
    };
    const handleTouchEnd = () => {
      lastTouchRef.current = performance.now();
      endPress();
    };
    const handleTouchCancel = () => {
      lastTouchRef.current = performance.now();
      cancelPress();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mouseleave', cancelPress);
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchCancel);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mouseleave', cancelPress);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchCancel);
      cancelPress();
    };
  }, [isMirror, setCursor, triggerMouseClick, setRiverAccelerate]);
}

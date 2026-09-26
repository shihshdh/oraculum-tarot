// Keeps swipes and wheel turns inside a floating panel from scrolling the page underneath.
// Inner areas that can still scroll in the gesture's direction scroll normally; everything else
// (their ends, headers, buttons, blank space) swallows the gesture instead of passing it to the page.

function scrollable(el) {
  const style = getComputedStyle(el);
  return /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1;
}

/** True when some element between target and container can scroll further by dy (dy > 0 = content moves up). */
function canScroll(target, container, dy) {
  for (let el = target instanceof HTMLElement ? target : null; el && el !== container.parentElement; el = el.parentElement) {
    if (!scrollable(el)) { if (el === container) break; continue; }
    if (dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
    if (dy < 0 && el.scrollTop > 0) return true;
    if (el === container) break;
  }
  return false;
}

export function trapScroll(container) {
  let lastY = 0;
  const start = (event) => { lastY = event.touches[0]?.clientY ?? 0; };
  const move = (event) => {
    if (event.touches.length !== 1) return;
    const y = event.touches[0].clientY;
    const dy = lastY - y; // finger moving up → content should move up (scroll down)
    lastY = y;
    if (dy !== 0 && !canScroll(event.target, container, dy) && event.cancelable) event.preventDefault();
  };
  const wheel = (event) => {
    if (event.ctrlKey) return; // pinch zoom
    if (!canScroll(event.target, container, event.deltaY) && event.cancelable) event.preventDefault();
  };
  container.addEventListener("touchstart", start, { passive: true });
  container.addEventListener("touchmove", move, { passive: false });
  container.addEventListener("wheel", wheel, { passive: false });
  return () => {
    container.removeEventListener("touchstart", start);
    container.removeEventListener("touchmove", move);
    container.removeEventListener("wheel", wheel);
  };
}

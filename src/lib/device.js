// 设备判断：只有触屏、没有鼠标（手机、平板）。
// 这类设备上隔空手势用不上（手要拿着手机），3D 也要按手机 GPU 的预算来画。
export function isTouchOnly() {
  try {
    return window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches;
  } catch {
    return false;
  }
}

/**
 * 手机上强制全屏：藏掉浏览器的地址栏和底栏，牌阵和按钮不被挡住。
 * 浏览器只允许在用户操作里进入全屏，所以挂在每次轻触上：不在全屏就请求一次（退出后下次轻触会再进）。
 * iPhone 上的浏览器不开放网页全屏，这里会静默跳过——那边靠页面自适应可见高度，或"添加到主屏幕"后全屏打开。
 */
export function installMobileFullscreen() {
  if (!isTouchOnly()) return;
  const root = document.documentElement;
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  if (!request) return;
  const current = () => document.fullscreenElement || document.webkitFullscreenElement;
  let failed = false;
  const enter = () => {
    if (failed || current()) return;
    try {
      const result = request.call(root, { navigationUI: 'hide' });
      // 浏览器明确拒绝（例如内嵌网页不允许全屏）就不再每次都试
      if (result && typeof result.catch === 'function') result.catch((e) => { if (e && e.name === 'TypeError') failed = true; });
    } catch {
      failed = true;
    }
  };
  window.addEventListener('touchend', enter, { capture: true, passive: true });
}

/**
 * 页面高度跟随浏览器真正可见的高度（--app-h）。
 * 有些手机浏览器（尤其是国产浏览器、内嵌网页）把 100svh 算错，底部会被工具栏挡住一截；
 * 进出全屏、地址栏收起展开时也要跟着变。用 innerHeight 而不是 visualViewport：弹出键盘时页面不该跟着缩。
 */
export function installViewportHeight() {
  const set = () => document.documentElement.style.setProperty('--app-h', `${window.innerHeight}px`);
  set();
  window.addEventListener('resize', set);
  window.addEventListener('orientationchange', () => setTimeout(set, 300));
  document.addEventListener('fullscreenchange', () => setTimeout(set, 100));
  document.addEventListener('webkitfullscreenchange', () => setTimeout(set, 100));
}

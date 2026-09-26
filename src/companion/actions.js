// 执行占星师提议的页面操作（服务端已校验过格式）。
// 她可以切换阶段、滚动、指出某个控件、按普通按钮。删除、重置、退出、导出、
// 离开本站之类只做准备，要用户在对话里确认后才执行。她不输入文字，也不碰自己的面板。

export const PAGE_NAMES = { home: '开场', question: '默问', history: '占卜史' };

const RISKY = /删|清空|移除|重置|重新占卜|退出|登出|导出|下载|保存|分享|复制|发送|提交|支付|购买|覆盖|替换|清除|关闭 AI|启用|配置/;

export function findRef(ref) {
  if (!/^[a-z]\d{1,4}$/.test(ref)) return null;
  const el = document.querySelector(`[data-assist-ref="${ref}"]`);
  // 她自己的面板和隐私区域即使编号过期指过去也碰不到
  return el && el.isConnected && !el.closest('[data-assist-private],input,textarea,select,[inert]') ? el : null;
}

export function labelOf(el) {
  return ((el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim()).slice(0, 30) || '这个按钮';
}

export const isDisabled = (el) => el.disabled || el.getAttribute('aria-disabled') === 'true';

/** 需要用户点头才执行 */
export function isRisky(el) {
  if (RISKY.test(labelOf(el))) return true;
  if (el.matches('button[type="submit"],input[type="submit"]') || (el.matches('button') && !el.getAttribute('type') && el.closest('form'))) return true;
  if (el.matches('a[href]')) {
    try {
      if (new URL(el.href, location.href).origin !== location.origin || el.target === '_blank' || el.hasAttribute('download')) return true;
    } catch {
      return true;
    }
  }
  return false;
}

let clearHighlight = null;
export function highlight(el, reduced) {
  clearHighlight?.();
  el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  el.setAttribute('data-assist-highlight', '');
  const timer = setTimeout(() => clearHighlight?.(), 2800);
  clearHighlight = () => {
    clearTimeout(timer);
    el.removeAttribute('data-assist-highlight');
    clearHighlight = null;
  };
}

/** 页面本身不滚动：滚的是当前最主要的可滚动区域（解读面板、历史列表…） */
function mainScroller() {
  const candidates = [...document.querySelectorAll('.scroll-soft')].filter(
    (el) => el.getClientRects().length && el.scrollHeight > el.clientHeight + 4 && !el.closest('[data-assist-private]')
  );
  return candidates.sort((a, b) => b.clientHeight - a.clientHeight)[0] || null;
}

export function scrollPage(direction, reduced) {
  const el = mainScroller();
  if (!el) return false;
  const behavior = reduced ? 'auto' : 'smooth';
  if (direction === 'top') el.scrollTo({ top: 0, behavior });
  else if (direction === 'bottom') el.scrollTo({ top: el.scrollHeight, behavior });
  else el.scrollBy({ top: (direction === 'down' ? 1 : -1) * Math.round(el.clientHeight * 0.7), behavior });
  return true;
}

export const SCROLL_WORDS = { up: '往上翻了一点', down: '往下翻了一点', top: '回到了顶部', bottom: '翻到了底部' };

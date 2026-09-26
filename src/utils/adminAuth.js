import { apiUrl } from './apiBase';
/**
 * 管理员模式（服务端校验版）
 * - 密码只存在于服务端（环境变量 ADMIN_PASSWORD，见 server/aiConfigPlugin.js）
 *   前端代码里不再出现任何密码，浏览器看不到。
 * - 登录：把用户输入的密码 POST 给 /api/_admin/login，服务端校验通过后返回一个
 *   随机会话 token，前端把 token 存 localStorage。后续配置写操作都带这个 token。
 * - localStorage（而非 sessionStorage）：避免每个新窗口都要重新登录。
 */

const ADMIN_KEY = 'tarot-admin-session';

export function getAdminToken() {
  return localStorage.getItem(ADMIN_KEY) || '';
}

export function isAdminLoggedIn() {
  return !!getAdminToken();
}

/**
 * 尝试登录（异步：需要请求服务端校验）
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function tryAdminLogin(password) {
  try {
    const res = await fetch(apiUrl('/api/_admin/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok && data.token) {
      localStorage.setItem(ADMIN_KEY, data.token);
      return { ok: true, message: '已进入管理员模式' };
    }
    return { ok: false, message: data.error || '密码错误' };
  } catch (e) {
    return { ok: false, message: '网络错误：' + e.message };
  }
}

export function adminLogout() {
  localStorage.removeItem(ADMIN_KEY);
}

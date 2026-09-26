// 后端地址。默认与页面同域（本地开发、或 Beam 同时托管前端时）。
// 前端单独部署（如 Netlify）时，构建前设置 VITE_API_BASE=https://oraculum-xxxx.app.beam.cloud
const BASE = String(import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '');
export const apiUrl = (path) => BASE + path;

// 版本开关：网页版 / 桌面客户端版（Electron）。
// 客户端用 `npm run build:desktop` 构建（读 .env.desktop），在本机显卡上跑更重的画面：
// 更高分辨率与抗锯齿、牌背流光、环绕牌阵的光带、更多粒子，以及翻牌后的 GPU 路径追踪。
export const DESKTOP = import.meta.env.VITE_EDITION === 'desktop';

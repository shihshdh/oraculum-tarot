// ORACULUM 桌面客户端（Electron 主进程）
//
//   · 页面：打包在程序里的高画质版（npm run build:desktop），经自定义协议 oraculum://app/ 提供，
//     和网页版一样按根路径（/textures/...、/mediapipe/...）取文件
//   · 接口：/api/* 由主进程转发到线上后端（走国内能访问的 Netlify 镜像），解读的流式输出原样透传
//   · 显卡：强制用独立显卡、忽略显卡黑名单、开 GPU 光栅化，3D 与光追都跑在本机 GPU 上
//   · 数据：历史记录、设置、缓存都存在 D:\ORACULUM\data（可用环境变量 ORACULUM_DATA 改）
const { app, BrowserWindow, Menu, net, protocol, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const API_ORIGIN = process.env.ORACULUM_API || 'https://oraculum-tarot.netlify.app';
const DATA_DIR = process.env.ORACULUM_DATA || 'D:\\ORACULUM\\data';
const APP_DIR = path.join(__dirname, 'app');
const ORIGIN = 'oraculum://app';

// ---------- 数据目录（必须在 ready 之前设置） ----------
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  app.setPath('userData', DATA_DIR);
  app.setPath('sessionData', DATA_DIR);
  app.setPath('crashDumps', path.join(DATA_DIR, 'crashes'));
  app.setAppLogsPath(path.join(DATA_DIR, 'logs'));
} catch (e) {
  console.error('数据目录不可用，改用默认位置：', e);
}

// ---------- 显卡 ----------
app.commandLine.appendSwitch('force_high_performance_gpu'); // 双显卡笔记本上用独显
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('disable-background-timer-throttling');
// Windows 会暂停被别的窗口挡住的窗口的渲染：关掉它，切走时光追也能接着累积
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

protocol.registerSchemesAsPrivileged([
  { scheme: 'oraculum', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } },
]);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.moc3': 'application/octet-stream',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
};

async function serveFile(pathname) {
  let rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  let file = path.normalize(path.join(APP_DIR, rel || 'index.html'));
  if (!file.startsWith(APP_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(APP_DIR, 'index.html'); // 单页应用：未知路径回首页
  }
  const res = await net.fetch(pathToFileURL(file).toString());
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  return new Response(res.body, { status: 200, headers: { 'Content-Type': type, 'Cache-Control': 'no-cache' } });
}

async function proxyApi(request, url) {
  const headers = new Headers(request.headers);
  ['host', 'origin', 'referer', 'content-length'].forEach((h) => headers.delete(h));
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  try {
    const upstream = await net.fetch(API_ORIGIN + url.pathname + url.search, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      bypassCustomProtocolHandlers: true,
    });
    const out = new Headers(upstream.headers);
    out.delete('content-encoding');
    out.delete('content-length');
    return new Response(upstream.body, { status: upstream.status, headers: out });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: '连不上占卜服务器，请检查网络后重试。' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}

function createWindow(url = ORIGIN + '/', opts = {}) {
  const win = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#080706', // 与页面同色：开场动画前不会闪白
    title: 'ORACULUM · 命运的抉择',
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false,
    },
    ...opts,
  });
  win.once('ready-to-show', () => {
    if (!opts.width) win.maximize();
    win.show();
  });
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); event.preventDefault(); }
    else if (input.key === 'Escape' && win.isFullScreen()) { win.setFullScreen(false); }
    else if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) { win.webContents.reload(); event.preventDefault(); }
    else if (input.key === 'F12') { win.webContents.toggleDevTools(); event.preventDefault(); }
  });
  // 副屏（?role=mirror）在客户端里开成新窗口；其他外链交给系统浏览器
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith(ORIGIN)) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 1280, height: 800, backgroundColor: '#080706', autoHideMenuBar: true, icon: path.join(__dirname, 'icon.ico') } };
    }
    if (/^https?:/i.test(target)) shell.openExternal(target);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, target) => {
    if (!target.startsWith(ORIGIN)) { event.preventDefault(); if (/^https?:/i.test(target)) shell.openExternal(target); }
  });
  win.loadURL(url);
  return win;
}

// 只开一个实例：再次双击图标时把已有窗口拉到前面
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    protocol.handle('oraculum', (request) => {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) return proxyApi(request, url);
      return serveFile(url.pathname);
    });
    // 摄像头（手势）与全屏：只给自己的页面
    const own = (wc) => wc && wc.getURL().startsWith(ORIGIN);
    session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(own(wc) && ['media', 'fullscreen', 'clipboard-sanitized-write'].includes(permission)));
    session.defaultSession.setPermissionCheckHandler((wc, permission) => own(wc) && ['media', 'fullscreen', 'clipboard-sanitized-write'].includes(permission));
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}

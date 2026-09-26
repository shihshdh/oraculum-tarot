// 打包并安装 ORACULUM 桌面客户端（先运行 npm run build:desktop 生成 desktop/stage/app）
//
//   node desktop/build.mjs              打包 → 安装到 D:\ORACULUM\app → 桌面快捷方式
//   node desktop/build.mjs --stage-only 只准备 desktop/stage（给 npm run desktop:dev 用）
//
// 目录：程序 D:\ORACULUM\app，数据 D:\ORACULUM\data（历史、设置、缓存；重装不会清掉）
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const STAGE = path.join(HERE, 'stage');
const INSTALL_ROOT = process.env.ORACULUM_HOME || 'D:\\ORACULUM';
const APP_DIR = path.join(INSTALL_ROOT, 'app');
const DATA_DIR = path.join(INSTALL_ROOT, 'data');
const NAME = 'ORACULUM';

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const electronVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'electron', 'package.json'), 'utf8')).version;

// ---------- 1. 准备 stage ----------
if (!fs.existsSync(path.join(STAGE, 'app', 'index.html'))) {
  console.error('desktop/stage/app 不存在：先运行 npm run build:desktop');
  process.exit(1);
}
fs.copyFileSync(path.join(HERE, 'main.cjs'), path.join(STAGE, 'main.cjs'));
fs.copyFileSync(path.join(HERE, 'icon.ico'), path.join(STAGE, 'icon.ico'));
fs.writeFileSync(path.join(STAGE, 'package.json'), JSON.stringify({
  name: 'oraculum',
  productName: NAME,
  version: pkg.version,
  description: 'ORACULUM · 命运的抉择（桌面客户端）',
  main: 'main.cjs',
  author: 'ORACULUM',
}, null, 2));
console.log('✓ stage 已准备');
if (process.argv.includes('--stage-only')) process.exit(0);

// ---------- 2. 打包 ----------
const { packager } = await import('@electron/packager');
process.env.ELECTRON_MIRROR ||= 'https://npmmirror.com/mirrors/electron/';
const OUT = path.join(ROOT, 'desktop', 'out');
fs.rmSync(OUT, { recursive: true, force: true });
const [built] = await packager({
  dir: STAGE,
  name: NAME,
  executableName: NAME,
  out: OUT,
  platform: 'win32',
  arch: 'x64',
  electronVersion,
  icon: path.join(HERE, 'icon.ico'),
  asar: true,
  overwrite: true,
  prune: false,
  appCopyright: 'ORACULUM',
  win32metadata: { CompanyName: 'ORACULUM', FileDescription: 'ORACULUM · 命运的抉择', ProductName: NAME, InternalName: NAME },
});
console.log('✓ 已打包：' + built);

// ---------- 3. 安装到 D 盘 ----------
fs.mkdirSync(DATA_DIR, { recursive: true });
try {
  execFileSync('taskkill', ['/F', '/IM', `${NAME}.exe`], { stdio: 'ignore' }); // 正在运行的旧版本先关掉
} catch {}
fs.rmSync(APP_DIR, { recursive: true, force: true });
// 用 robocopy 复制：Node 的 fs.cpSync 复制这批文件时会直接崩掉退出（无报错）。robocopy 退出码 < 8 都算成功
try {
  execFileSync('robocopy', [built, APP_DIR, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'], { stdio: 'ignore' });
} catch (e) {
  if (typeof e.status !== 'number' || e.status >= 8) throw e;
}
if (!fs.existsSync(path.join(APP_DIR, `${NAME}.exe`))) throw new Error('复制到 ' + APP_DIR + ' 失败');
fs.rmSync(OUT, { recursive: true, force: true });
console.log('✓ 已安装到 ' + APP_DIR + '（数据在 ' + DATA_DIR + '）');

// ---------- 4. 桌面快捷方式 ----------
const exe = path.join(APP_DIR, `${NAME}.exe`);
const ps = `
$desktop = [Environment]::GetFolderPath('Desktop')
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut((Join-Path $desktop 'ORACULUM 塔罗.lnk'))
$lnk.TargetPath = '${exe.replace(/'/g, "''")}'
$lnk.WorkingDirectory = '${APP_DIR.replace(/'/g, "''")}'
$lnk.IconLocation = '${exe.replace(/'/g, "''")},0'
$lnk.Description = 'ORACULUM · 命运的抉择'
$lnk.Save()
Write-Output (Join-Path $desktop 'ORACULUM 塔罗.lnk')
`;
const encoded = Buffer.from(ps, 'utf16le').toString('base64');
const lnk = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { encoding: 'utf8' }).trim();
console.log('✓ 桌面快捷方式：' + lnk);

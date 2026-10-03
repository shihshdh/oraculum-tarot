# 开发与部署笔记（ORACULUM）

隔空手势 + 3D 牌河 + 78 张完整塔罗 + 由看板娘「占星师」给出的 AI 解读。

## 公网部署（Beam）

- 线上地址：<https://oraculum-879d00e.app.beam.cloud>（固定地址，总是指向最新版本）
- 后端是 `backend/beam/` 里的 Python FastAPI（与本地 Node 后端接口、提示词完全一致，提示词由 `node scripts/export-shared.mjs` 导出成 `shared.json`）
- 一键部署：双击 `部署到Beam.bat`（构建前端 → 同步密钥 → 前端随部署包上传 → 健康检查）
- 成本配置：0.25 核 / 256MB，最少 0 个容器、最多 1 个，空闲 20 秒后缩到 0；每 IP 每小时解读 30 次、聊天 60 次，全站每天解读 300 次、聊天 1000 次
- 管理员密码：首次部署时随机生成，保存在 `.beam-tools/admin-password.txt`（不进 git）；模型 Key 在 Beam Secret `ORACULUM_AI_CONFIG`，网页管理员面板里改过后以持久卷 `oraculum-data` 上的配置为准
- 国内访问走 Netlify 镜像：<https://oraculum-tarot.netlify.app>。页面由 Netlify 发出，`/api/*` 按 `netlify.toml` 转发到 Beam，浏览器不直连 beam.cloud；更新双击 `部署到Netlify.bat`（后端改了还要跑 `部署到Beam.bat`）。Netlify 新账号默认开了"访客需登录"，新建站点后要关掉（站点设置 Visitor access，或 API 设 `sso_login: false`），否则访客看到 401
- 离线测试：`python -m unittest discover -s backend/beam -p "test_*.py"`

## 桌面客户端（高画质）

- 双击 `打包客户端.bat`（= `npm run desktop`）：构建客户端版 → Electron 打包 → 安装到 `D:\ORACULUM\app`，桌面生成「ORACULUM 塔罗」快捷方式；数据在 `D:\ORACULUM\data`
- 与网页版同一份代码，`VITE_EDITION=desktop`（`.env.desktop`）打开这些效果：至少 1.5 倍超采样 + 8 倍 MSAA、1024 环境反射、更强泛光、色散、两层光尘、牌背烫金流光（`cardKit.js` 的 `withSheen`）、环绕牌阵的流动光带（`scene/desktop/FlowLight.jsx`）
- 光追：五张牌翻开后，`scene/desktop/RayTrace.jsx` 用 three-gpu-pathtracer 在本机 GPU 上路径追踪牌阵（面光源 + 程序生成的烛光环境；牌阵跟随 cardRoot 的变换），累积 2000 次采样后停下；首次要编译约二三十秒着色器。桌面与倒影由实时的占卜室提供。注意这个版本的库：镜头不能用 `PhysicalCamera.copy()`（景深参数会变 NaN），多材质几何体要先按 group 拆开
- 主进程 `desktop/main.cjs`：`oraculum://app/` 提供页面，`/api/*` 转发到 Netlify 镜像；强制独显；F11 全屏、F5 刷新、F12 开发者工具
- 调试：`npm run desktop:dev`（不安装，直接用 Electron 跑）

## v4.5 · 上一次的牌

- 开场左下角的牌袋（`components/ui/LastReading.jsx`）：Pixel Reconstruction 首页「走过的地方」文件夹的同一套结构——外层 `.card` 是感应区、只随牌袋展开到扇形位置，里层 `.face` 才在悬停时抬起，鼠标停在牌上不会来回抖；开合由脚本判断，离开整个舞台 180ms 后才收起，展开后舞台整块接住指针。每张牌的展开位置只由序号 k（−2…2）算出、写进 CSS 变量
- 按占卜室的动效规矩改过：展开用自然减速 `--ease`、不回弹（Pixel 那只是回弹的），时长 `--d-hero`，按离中心的远近错开 60ms；手势光标悬停（`data-gesture-hover`）用 `:has()` 同样能展开，捏合即点击
- 背后的 memoria 用系统手写体（Segoe Script / Snell Roundhand），第一次出现时一道向右倾斜的柔边遮罩从左扫到右；减少动态效果时直接显示
- 点牌或牌袋 → `openHistoryAt(id)`，占卜史打开时选中那一次；左下角的摄像头提示在时牌袋先不出来（`cameraNoticeShown`）；手机、副屏、没有记录时不显示

## v4.4 · 占卜室

- **场景**：首页和整个占卜过程都在一间 3D 占卜室里。一张照片 → Depth Anything V2 Large 逐像素深度 → 按照片里牌组的透视（五个特征点，误差 < 1 像素）反解出镜头俯角 9.1°、离桌面高度，按桌面平面标定深度尺度（远处另接一段，后墙约 60 单位）。资源由 `scripts/build-room.py` 生成：`public/textures/room/`（照片大/小图、16 位反深度图）和 `src/data/room.json`（标定参数）。照片里原来的牌组已经抹掉（从旁边搬木纹、羽化融合），由 3D 牌组（`scene/room/Deck.jsx`）顶替在同一位置
- **渲染**（`scene/room/Room.jsx`）：一个深度像素一个顶点，顶点着色器用 `texelFetch` 解码深度并推到镜头射线上，相邻像素差分重建法线；烛火（亮而暖的像素）各自摇曳、亮度超过 1 交给泛光；星盘、牌组、悬停/翻开的牌是 4 个动态光源（`sceneLights`），按法线照亮房间；平面反射：沿桌面镜像镜头、斜裁剪面裁掉桌下，半分辨率渲染牌阵，桌面像素按菲涅尔叠加、沿木纹扰动、纵向拉丝模糊。房间不写深度、最先画，牌永远在它前面
- **镜头与牌阵**：镜头固定在照片拍摄位置，只随指针轻轻转头（左右 ≤ 6°、上下 ≤ 3.5°，范围由 `lookLimits` 按视角实时算出，竖屏再按宽高比缩小），超宽屏自动收窄视角保证有余量——所以永远不会露出照片边缘。以前靠挪镜头做的竖屏适配、面板让位，改成移动/缩放牌阵的根节点 `cardRoot`（绕镜头等比缩放，画面与退后镜头完全一致）；牌名投影、射线检测、端详、光追都按 cardRoot 换算
- **交互**：进入选牌后先点桌上的牌组——牌从牌堆顶依次掀起（从正中向两侧，贝塞尔弧线 + 五次平滑缓动），打着旋升起再扫进牌河，牌堆随之变薄；星盘法阵竖直悬浮在牌阵后方、缓缓摆动，此刻被点燃。重来时空中的牌飞回牌堆叠好（`scene/room/Gather.jsx`，牌堆按同一时间线长高）。之后的选牌逻辑不变
- **解读文字**：流式写出时每个新字从金色星光里亮起（只动 opacity / color / text-shadow），约每 17 个字迸一颗小星芒，光标是一颗闪烁的星；挂载前已有的字不重放，写完 1.6 秒后合并回普通文本
- **流畅度**：去掉星云（原来最贵的一块）和胶片颗粒（噪点）；MSAA、泛光层级创建后不再变化（以前掉帧降级时会重建整条后期管线，卡一下）；降级只关桌面反射；解读面板独立合成层 + `contain`，面板里的按钮不再做背景模糊。RTX 5070 Ti 实测全流程约 240 帧、没有超过 12.6ms 的帧
- `?norefl` 关掉桌面反射（对比、排查性能用）

## v4.1

- **流畅度**：手势识别挪到 Web Worker（摄像头 640×480、只在新帧时识别，拿不到 Worker 自动回主线程）；牌河 78 张牌不再随光标重渲染，悬停改成每帧一次射线检测；副屏同步只发变化的字段。Intel 核显实测选牌时约 57 帧、无长任务。
- **牌面与牌背**：换成 1909 年初版 Rider–Waite–Smith 扫描（Wikimedia Commons，公有领域，约 800×1386）；牌背用初版的「蔷薇与百合」花纹重新配色成夜蓝底烫金，3D 里烫金部分会反光。
- **标志与开场**：新标志（拱顶牌框 + 四片菱形拼成的四芒星）；开场四片液态玻璃从屏幕四角飞来拼合、牌框描出、字标浮现、标志飞进顶栏（WebGL 玻璃在 Worker 里画；地址加 `?nointro` 跳过，`?introdebug` 打印时间轴）。
- **场景**：圆角有厚度的描金卡片、烫金反射环境光、GPU 星云与星空、牌阵下方的星盘法阵（翻牌后亮起）、金色浮尘、900 颗 GPU 粒子、MSAA + 泛光 + 暗角 + 胶片颗粒；掉帧时自动降分辨率和特效。（v4.4 起星云、胶片颗粒换成了占卜室）

## v4 改了什么

- **视觉**：整站换成 Pixel Reconstruction 同一套液态玻璃语言——渐变着色的玻璃面板、描边光环、跟随指针移动的高光、会滑动的玻璃选中态（阶段进度、模型选择）、统一的自然减速动效，尊重"减少动态效果"。
- **占星师（看板娘）**：Live2D 小魔女，体验与 Pixel Reconstruction 的鲸鱼娘一致——
  - 解读由她来做：翻牌后托起水晶球凝视，解读流式写出时开口说话，说完按牌面气氛做表情和魔法（治愈爱心 / 失手冒烟 / 召唤兔子）
  - 可以聊天；每条消息带上页面文字和控件清单，能帮你打开面板、指出/点击按钮（重置、删除、导出等先问你）
  - 能看你附上的截图或"当前牌阵"图（需要能看图的模型）
  - 留意页面报错（摄像头没授权、解读失败…）并主动问要不要帮忙
  - 在屏幕底部散步、可拖动、可收起；手机默认收起成小胶囊，点开才加载形象
- **手势**：任何按钮都能隔空捏合点击（不再只有开场和默问两处）；修复了开着摄像头但手不在画面时鼠标光标闪烁的问题。
- **布局**：解读面板打开时 3D 牌阵自动让位；牌名始终对准 3D 牌；手机竖屏五个卡位都能看全。
- **后端**：提示词改为服务端拼装（`/api/reading`），旧的 `/api/ai/chat` 通用代理已移除，别人不能再拿本站 Key 当免费大模型用；新增看板娘接口 `/api/assist`；开发与生产共用一张路由表。
- 旧版源码备份在 `_backup_2026-09-25_gemini/`。

## 快速开始

```bash
npm install
npm run dev        # http://localhost:5173/?role=main
```

生产：`npm run prod`（构建 + `node server/index.js`，默认 3000 端口）。部署细节见 `DEPLOY.md`。

## 管理员

右上角锁形按钮，或访问 `?admin=1`。密码由服务端环境变量 `ADMIN_PASSWORD` 决定（未设置时每次启动随机生成，打印在服务端终端里）。
登录后右上角齿轮可以配置 DeepSeek / 豆包 / Gemini：

- 豆包接入点可以勾选「能看图」
- 可以指定「占星师聊天用的模型」（默认自动选快速模型；用户附图时自动换成能看图的模型）

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/_admin/login` | 管理员登录 → 会话 token |
| GET | `/api/_config` | 各 provider 是否已配置（不含 Key） |
| POST | `/api/_config` | 保存配置（需管理员） |
| GET | `/api/_models` | 可选模型，`assist` / `vision` 是否可用 |
| POST | `/api/reading` | 解读与追问（SSE 流）。只收 `{modelId, question, cards, reading?, messages?}` |
| POST | `/api/assist` | 占星师对话 → `{reply, mood, actions}` |

生产限流：`RATE_LIMIT`（解读，默认 30 次/时/IP）、`ASSIST_RATE_LIMIT`（占星师，默认 60 次/时/IP）、`GLOBAL_RATE_LIMIT`（全站每小时合计，0 = 关闭）。

## 代码速查

```
server/
├── aiService.js        配置、鉴权、各家模型调用、路由表
├── prompts.js          解读与占星师的提示词（服务端拼装）
├── assist.js           占星师：上下文清洗、心情/动作解析
├── aiConfigPlugin.js   Vite 开发服务器挂载
└── index.js            生产 Express + 限流
src/
├── index.css           设计系统：颜色变量、玻璃材质、按钮、液态分段、星轨加载
├── lib/liquid.js       指针高光 + 手势悬停/捏合点击（全站通用）
├── lib/motion.js       动效时长与缓动
├── lib/companionBus.js 页面 → 占星师的信号（解读进度、抽牌）
├── companion/          占星师：Astrologer（行为）、AstrologerStage（Live2D）、actions、vision
├── components/ui/      TopBar、Splash、Question、ReadingPanel、History、ShareSheet、AISettings…
├── components/scene/   3D 牌河、卡位、粒子、镜头
│   └── room/           占卜室：roomKit（标定与共享参数）、Room（重构 + 光照 + 反射）、Deck（桌上牌组）、Gather（收牌）
public/companion/       Live2D 模型 Mao 与 Cubism Core
```

## 第三方素材与许可

- 牌面与牌背：1909 年 Rider–Waite–Smith「Roses & Lilies」初版扫描，来自 [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Rider-Waite_tarot_deck_(Roses_%26_Lilies))，公有领域；牌背为在原图花纹上重新配色。

- 占卜室照片：作者提供的图片；深度由 [Depth Anything V2](https://github.com/DepthAnything/Depth-Anything-V2)（Large，CC-BY-NC-4.0，仅离线生成资源时使用，不随应用分发）估计。

- 占星师形象：Live2D 官方示例模型「Mao」（[CubismWebSamples](https://github.com/Live2D/CubismWebSamples)），按 [Live2D Free Material License](https://www.live2d.com/eula/live2d-free-material-license-agreement_cn.html) 原样使用；个人和年营收 1000 万日元以下的小规模组织可免费使用，详见 `public/companion/mao/LICENSE-Live2D.md`。
- Live2D Cubism Core（`public/companion/live2dcubismcore.min.js`）：Live2D Inc. 专有软件，按其再分发条款提供。
- 渲染：pixi.js 6 + pixi-live2d-display；手势：MediaPipe Hands；3D：three.js / R3F。

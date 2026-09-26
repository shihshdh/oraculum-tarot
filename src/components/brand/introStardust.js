// 开场字标的"流动星光"：字母浮现时，一颗颗小星沿着笔画的轮廓流动，偶尔有几颗脱离笔画向上飘散。
//
// 做法：
//   1. 主线程只做一次采样——把每个字母按页面上的同一字体画到小画布上，取出笔画轮廓上的点
//   2. 粒子在 Worker 里用 OffscreenCanvas 画（加色混合的柔光点 + 亮星十字芒），和玻璃碎片一样不占主线程
//   3. 每颗星从轮廓上的一个点出发，每次跳到附近、方向大致不变的另一个点，于是看起来是在"顺着笔画流"
//   4. 与字标滑动同一条时间轴；收尾时星光向外散开、淡出

/** 渲染器本体：Worker 由它的源码生成，必须自包含。 */
function stardust(post) {
  let ctx = null, canvas, raf = 0, start = 0, cssW = 1, cssH = 1, dpr = 1;
  let letters = [], slide = null, leaveAt = -1, lastT = 0;
  const parts = [];
  const g = globalThis;
  const tick = typeof g.requestAnimationFrame === 'function' ? (f) => g.requestAnimationFrame(f) : (f) => g.setTimeout(f, 16);
  const untick = (id) => (typeof g.cancelAnimationFrame === 'function' ? g.cancelAnimationFrame(id) : g.clearTimeout(id));
  const now = () => performance.timeOrigin + performance.now();
  const bezier = (x1, y1, x2, y2) => {
    const at = (a, b, u) => 3 * (1 - u) * (1 - u) * u * a + 3 * (1 - u) * u * u * b + u * u * u;
    return (t) => {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      let lo = 0, hi = 1, u = t;
      for (let i = 0; i < 22; i++) { u = (lo + hi) / 2; if (at(x1, x2, u) < t) lo = u; else hi = u; }
      return at(y1, y2, u);
    };
  };
  const easeSlide = bezier(0.65, 0, 0.2, 1);
  const rand = (a, b) => a + Math.random() * (b - a);

  // 柔光点贴图
  let sprite = null;
  const makeSprite = () => {
    const S = 64;
    const c = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(S, S) : Object.assign(document.createElement('canvas'), { width: S, height: S });
    const x = c.getContext('2d');
    const grd = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, 'rgba(255,252,238,1)');
    grd.addColorStop(0.18, 'rgba(255,232,180,0.85)');
    grd.addColorStop(0.45, 'rgba(233,190,110,0.25)');
    grd.addColorStop(1, 'rgba(233,190,110,0)');
    x.fillStyle = grd;
    x.fillRect(0, 0, S, S);
    sprite = c;
  };

  // 每个字母的轮廓点建一张网格，方便找"附近的下一个点"
  const CELL = 8;
  const prepare = (L) => {
    const grid = new Map();
    for (let i = 0; i < L.pts.length; i += 2) {
      const key = ((L.pts[i] / CELL) | 0) + ',' + ((L.pts[i + 1] / CELL) | 0);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(i);
    }
    L.grid = grid;
    L.count = L.pts.length / 2;
    L.spawned = 0;
    L.acc = 0;
  };
  const nextPoint = (L, p) => {
    const cx = (p.fx / CELL) | 0, cy = (p.fy / CELL) | 0;
    let best = -1, bestScore = -1e9;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const cell = L.grid.get(cx + dx + ',' + (cy + dy));
      if (!cell) continue;
      for (let k = 0; k < cell.length; k++) {
        const i = cell[k];
        const vx = L.pts[i] - p.fx, vy = L.pts[i + 1] - p.fy;
        const d = Math.hypot(vx, vy);
        if (d < 2.5 || d > 9) continue;
        // 顺着原来的方向走，带一点随机，免得所有星走同一条线
        const score = (vx * p.dx + vy * p.dy) / d + Math.random() * 0.6;
        if (score > bestScore) { bestScore = score; best = i; }
      }
    }
    return best;
  };

  const spawn = (li, burst) => {
    const L = letters[li];
    if (!L.count) return;
    const i = ((Math.random() * L.count) | 0) * 2;
    const ang = Math.random() * Math.PI * 2;
    const floater = Math.random() < 0.16;
    parts.push({
      li, fx: L.pts[i], fy: L.pts[i + 1], tx: L.pts[i], ty: L.pts[i + 1],
      dx: Math.cos(ang), dy: Math.sin(ang),
      speed: rand(28, 70) * (burst ? 1.6 : 1),
      age: 0, life: rand(0.7, 1.9) * (floater ? 1.5 : 1),
      size: Math.random() < 0.12 ? rand(9, 14) : rand(3.5, 7.5),
      twinkle: rand(6, 14), phase: Math.random() * 6.28,
      floater, vx: rand(-8, 8), vy: rand(-30, -12),
      ox: 0, oy: 0,
    });
  };

  const frame = () => {
    if (!ctx) return;
    raf = tick(frame);
    const tNow = now();
    const t = tNow - start;
    const dt = Math.min(0.05, lastT ? (tNow - lastT) / 1000 : 0.016);
    lastT = tNow;
    const off = slide ? slide.x * (1 - easeSlide((t - slide.delay) / slide.duration)) : 0;
    const leaving = leaveAt >= 0 ? (tNow - leaveAt) / 1000 : -1;

    // 生成：字母到场时一小簇，之后持续地、慢慢地冒
    if (leaving < 0) {
      letters.forEach((L, li) => {
        if (t < L.start) return;
        if (!L.burst) { L.burst = true; for (let k = 0; k < 22; k++) spawn(li, true); }
        const rate = t - L.start < 900 ? 34 : 12;
        L.acc += rate * dt;
        while (L.acc >= 1 && parts.length < 700) { L.acc -= 1; spawn(li, false); }
      });
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age > p.life) { parts.splice(i, 1); continue; }
      const L = letters[p.li];
      if (p.floater) {
        // 脱离笔画的星：带着一点旋涡向上飘
        p.vx += Math.sin(p.age * 3 + p.phase) * 18 * dt;
        p.ox += p.vx * dt;
        p.oy += p.vy * dt;
      } else {
        // 沿轮廓流动：朝目标点移动，到了就找下一个
        const vx = p.tx - p.fx, vy = p.ty - p.fy;
        const d = Math.hypot(vx, vy);
        const step = p.speed * dt;
        if (d <= step) {
          p.fx = p.tx; p.fy = p.ty;
          const n = nextPoint(L, p);
          if (n >= 0) {
            const nx = L.pts[n] - p.fx, ny = L.pts[n + 1] - p.fy, nd = Math.hypot(nx, ny) || 1;
            p.dx = nx / nd; p.dy = ny / nd;
            p.tx = L.pts[n]; p.ty = L.pts[n + 1];
          } else { p.floater = true; }
        } else {
          p.fx += (vx / d) * step; p.fy += (vy / d) * step;
        }
      }
      if (leaving >= 0) {
        // 收尾：向外散开
        p.ox += p.dx * 120 * dt + (Math.random() - 0.5) * 20 * dt;
        p.oy += p.dy * 120 * dt - 30 * dt;
      }
      const life = p.age / p.life;
      let a = Math.min(1, p.age / 0.18) * Math.pow(1 - life, 1.4) * (0.55 + 0.45 * Math.sin(p.age * p.twinkle + p.phase));
      if (leaving >= 0) a *= Math.max(0, 1 - leaving / 0.7);
      if (a <= 0.01) continue;
      const x = p.fx + p.ox + off, y = p.fy + p.oy;
      const s = p.size * (0.7 + 0.3 * a);
      ctx.globalAlpha = a;
      ctx.drawImage(sprite, x - s, y - s, s * 2, s * 2);
      if (p.size > 8.5) {
        // 亮星：细十字芒
        ctx.globalAlpha = a * 0.55;
        ctx.fillStyle = '#fff3d6';
        ctx.fillRect(x - s * 1.6, y - 0.5, s * 3.2, 1);
        ctx.fillRect(x - 0.5, y - s * 1.6, 1, s * 3.2);
      }
    }
    ctx.globalAlpha = 1;
    if (leaving > 1) untick(raf);
  };

  const init = (m) => {
    canvas = m.canvas; start = m.start; cssW = m.w; cssH = m.h; dpr = m.dpr; slide = m.slide;
    ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d');
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    makeSprite();
    raf = tick(frame);
  };
  return (m) => {
    try {
      if (m.init) init(m);
      else if (m.letters) { letters = m.letters; letters.forEach(prepare); }
      else if (m.resize) { cssW = m.w; cssH = m.h; canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr); }
      else if (m.leave) { if (leaveAt < 0) leaveAt = now(); }
      else if (m.stop) { untick(raf); ctx = null; }
    } catch (error) {
      untick(raf);
      ctx = null;
      post({ failed: String((error && error.message) || error) });
    }
  };
}

/**
 * 取每个字母笔画轮廓上的点（字标滑动结束后的最终位置，CSS 像素）。
 * slideOffset：字标此刻还带着的横向位移（要扣掉，得到滑动结束后的位置）；
 * lineTop：字母所在行的顶部（字母自己正在上浮，不能用它们的位置）。
 */
export function sampleLetters(spans, slideOffset, lineTop) {
  const out = [];
  const probe = document.createElement('canvas');
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  for (const span of spans) {
    const style = getComputedStyle(span);
    const size = parseFloat(style.fontSize);
    const left = span.getBoundingClientRect().left - slideOffset;
    const top = lineTop;
    const w = Math.ceil(span.offsetWidth) + 8;
    const h = Math.ceil(size * 1.4) + 8;
    probe.width = w;
    probe.height = h;
    ctx.font = `${style.fontWeight} ${size}px ${style.fontFamily}`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    const m = ctx.measureText(span.textContent);
    const asc = m.fontBoundingBoxAscent ?? size * 0.8;
    const desc = m.fontBoundingBoxDescent ?? size * 0.2;
    const lineH = parseFloat(style.lineHeight) || size;
    // 行内块的基线：内容区在行高里居中
    const baseline = (lineH - (asc + desc)) / 2 + asc;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.fillText(span.textContent, 4, 4 + baseline);
    const data = ctx.getImageData(0, 0, w, h).data;
    const A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : data[(y * w + x) * 4 + 3]);
    const pts = [];
    for (let y = 1; y < h - 1; y += 2) {
      for (let x = 1; x < w - 1; x += 2) {
        if (A(x, y) < 128) continue;
        if (A(x - 2, y) < 128 || A(x + 2, y) < 128 || A(x, y - 2) < 128 || A(x, y + 2) < 128) pts.push(left + x - 4, top + y - 4);
      }
    }
    out.push(new Float32Array(pts));
  }
  return out;
}

/** 启动星光层。letters 稍后用 feed() 送进来（要等字体排好版）。 */
export function startStardust(canvas, startedAt, slide, onFail) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const init = { init: true, start: performance.timeOrigin + startedAt, w: window.innerWidth, h: window.innerHeight, dpr, slide };
  let send, dispose, done = false;
  const fail = () => { if (done) return; done = true; dispose(); onFail?.(); };
  try {
    if (typeof Worker === 'function' && typeof canvas.transferControlToOffscreen === 'function' && typeof OffscreenCanvas === 'function') {
      const source = `var handle=(${stardust.toString()})(function(m){postMessage(m)});onmessage=function(e){handle(e.data)};`;
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      const worker = new Worker(url);
      URL.revokeObjectURL(url);
      worker.onmessage = (e) => { if (e.data?.failed) fail(); };
      worker.onerror = () => fail();
      const offscreen = canvas.transferControlToOffscreen();
      send = (m, transfer) => worker.postMessage(m, transfer || []);
      dispose = () => { try { worker.postMessage({ stop: true }); } catch {} setTimeout(() => worker.terminate(), 50); };
      send({ ...init, canvas: offscreen }, [offscreen]);
    } else {
      const handle = stardust((m) => { if (m.failed) fail(); });
      send = (m) => handle(m);
      dispose = () => handle({ stop: true });
      send({ ...init, canvas });
    }
  } catch {
    onFail?.();
    return null;
  }
  const resize = () => { if (!done) send({ resize: true, w: window.innerWidth, h: window.innerHeight }); };
  window.addEventListener('resize', resize);
  return {
    /** letters：[{ pts: Float32Array, start: ms }] */
    feed: (letters) => { if (!done) send({ letters }); },
    leave: () => { if (!done) send({ leave: true }); },
    stop: () => {
      window.removeEventListener('resize', resize);
      if (!done) { done = true; dispose(); }
    },
  };
}

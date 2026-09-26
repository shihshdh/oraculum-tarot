// 开场标志里的四片液态玻璃（移植自 Pixel Reconstruction 的 intro-glass）。
//
// 光学做法相同：凸型 squircle 倒角 y = ⁴√(1-(1-x)⁴)，按 Snell 定律 n≈1.5 折射、三个颜色通道
// 折射率略有不同（色散），边缘菲涅尔反射，边光强弱随边缘法线与光线夹角变化。
// 这里换成菱形碎片（四片拼成四芒星），染成金色，并改成暗背景下的"发光玻璃"：
// 薄处透、厚处金色更浓，边缘一圈亮线和随时间扫过的高光。
//
// 画布铺满屏幕、只画四片玻璃和它们的柔光。飞入、滑动的时间轴与 CSS 关键帧一致，
// 由同一个时钟算出。能用 OffscreenCanvas 就在 Worker 里画，主线程在加载 3D 场景时也不会卡住它。

const VERTEX = `
attribute vec2 a;
void main(){gl_Position=vec4(a,0.,1.);}
`;

const FRAGMENT = `
precision highp float;
uniform vec2 R;          // 画布尺寸（设备像素）
uniform float D;         // 每 CSS 像素的设备像素
uniform vec4 B[4];       // 每片：中心 x, y（CSS px，y 向下）、半宽（CSS px）、旋转（弧度）
uniform float L[4];      // 每片：半长（CSS px）
uniform float O[4];      // 每片：不透明度 × 可见度
uniform float T;         // 开场开始后的秒数
uniform vec2 P;          // 指针 -1..1

const vec3 GOLD=vec3(.93,.76,.45);

float ndot(vec2 a,vec2 b){return a.x*b.x-a.y*b.y;}
// 菱形有向距离（单位：CSS px）
float sdRh(vec2 p,vec2 b){
  p=abs(p);
  float h=clamp(ndot(b-2.*p,b)/dot(b,b),-1.,1.);
  float d=length(p-.5*b*vec2(1.-h,1.+h));
  return d*sign(p.x*b.y+p.y*b.x-b.x*b.y);
}
float sd(vec2 q,vec2 b,float r){return sdRh(q,b-r)-r;}
float profile(float x){x=clamp(x,0.,1.);return pow(1.-pow(1.-x,4.),.25);}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}

vec4 glass(vec2 q,vec2 b,float o,float ang){
  float r=min(b.x,b.y)*.28;
  float d=sd(q,b,r);
  float aa=1./D;
  float cover=smoothstep(aa,-aa,d);
  if(cover<=0.)return vec4(0);
  float bw=b.x*.62;
  float s=max(-d,0.);
  float x=s/bw;
  vec2 e=vec2(.35,0.);
  vec2 g=normalize(vec2(sd(q+e.xy,b,r)-sd(q-e.xy,b,r),sd(q+e.yx,b,r)-sd(q-e.yx,b,r))+1e-5);
  float dh=(profile(x+.02)-profile(x-.02))/.04*.55;
  vec3 n=normalize(vec3(g*dh,1.));
  // 按通道折射，落在不同厚度上：边缘一丝色散
  vec3 I=vec3(0,0,-1);
  float t0=profile(x);
  vec2 dr=refract(I,n,1./1.49).xy,dg=refract(I,n,1./1.51).xy,db=refract(I,n,1./1.54).xy;
  float k=bw*.6;
  vec3 path=vec3(profile(max(-sd(q+dr*k,b,r),0.)/bw),profile(max(-sd(q+dg*k,b,r),0.)/bw),profile(max(-sd(q+db*k,b,r),0.)/bw));
  path=mix(vec3(t0),path,.85);
  // 暗背景上的金色玻璃：越厚越浓
  vec3 body=GOLD*(.22+.78*path)*(.55+.45*o);
  float la=2.35+.35*sin(T*.6)+P.x*.4;
  vec2 Ld=vec2(cos(la),-sin(la));
  vec3 L3=normalize(vec3(Ld,.9-P.y*.2));
  float line=1.-smoothstep(.2,1.1,s);
  float band=1.-smoothstep(0.,bw*.45,s);
  float facing=max(dot(g,Ld),0.),counter=max(dot(g,-Ld),0.);
  float rim=line*(.35+pow(facing,1.2)*.75+pow(counter,2.)*.4)+band*(pow(facing,1.5)*.5+pow(counter,2.)*.2);
  float fres=pow(1.-n.z,2.5)*.8;
  float spec=pow(max(dot(reflect(-L3,n),vec3(0,0,1)),0.),48.);
  vec2 qr=rot(-ang)*q/max(b.y,1.);
  float sweep=exp(-pow((qr.x+qr.y)*1.2-(fract(T*.22)*6.-3.),2.)*6.)*.45*smoothstep(.25,.6,x);
  vec3 col=body+vec3(1.,.96,.88)*clamp(fres+rim+spec+sweep,0.,1.2);
  float alpha=cover*clamp(.5+.35*o+rim*.4+spec,0.,1.);
  return vec4(col*alpha,alpha);
}

vec4 halo(vec2 q,vec2 b,float o){
  float d=sd(q,b,min(b.x,b.y)*.28);
  // 光晕在裁剪范围内平滑降到 0，不留方形边
  float a=exp(-max(d,0.)/(b.x*1.6))*.22*o*smoothstep(-b.x,0.,d)*smoothstep(b.y*2.3,b.y*1.1,length(q));
  return vec4(GOLD*a,a*.6);
}

void main(){
  vec2 f=vec2(gl_FragCoord.x,R.y-gl_FragCoord.y)/D;
  vec4 acc=vec4(0);
  for(int i=0;i<4;i++){
    vec4 bb=B[i];
    if(O[i]<=0.||bb.z<=0.)continue;
    vec2 q=rot(-bb.w)*(f-bb.xy);
    if(abs(q.x)>L[i]*2.4||abs(q.y)>L[i]*2.4)continue;
    vec4 h=halo(q,vec2(bb.z,L[i]),O[i]);
    acc=h+acc*(1.-h.a);
  }
  for(int i=0;i<4;i++){
    vec4 bb=B[i];
    if(O[i]<=0.||bb.z<=0.)continue;
    vec2 q=rot(-bb.w)*(f-bb.xy);
    if(abs(q.x)>bb.z*1.2+2.||abs(q.y)>L[i]*1.2+2.)continue;
    vec4 g=glass(q,vec2(bb.z,L[i]),clamp(O[i],0.,1.),bb.w);
    acc=g+acc*(1.-g.a);
  }
  gl_FragColor=acc;
}
`;

/**
 * 渲染器本体。必须自包含（Worker 由它的源码生成），不能引用外部变量。
 */
function renderer(post) {
  let gl = null, canvas, raf = 0, start = 0, leaveAt = -1, px = 0, py = 0, cssW = 1, cssH = 1, dpr = 1, sent = false;
  let timeline = null, geo = null;
  const loc = {};
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
  const easeFly = bezier(0.22, 1, 0.36, 1), easeSlide = bezier(0.65, 0, 0.2, 1);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const size = () => {
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    gl && gl.viewport(0, 0, canvas.width, canvas.height);
  };
  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(String(gl.getShaderInfoLog(sh)));
    return sh;
  };
  const boxes = new Float32Array(16), lens = new Float32Array(4), tints = new Float32Array(4);
  const place = (t) => {
    tints.fill(0);
    if (!timeline || !geo) return;
    const slide = geo.slideX * easeSlide((t - timeline.slide.delay) / timeline.slide.duration);
    const unit = geo.box / 64;
    const leave = leaveAt < 0 ? 1 : 1 - clamp01((now() - leaveAt) / 260);
    timeline.shards.forEach((p, i) => {
      const rest = 1 - easeFly((t - p.delay) / p.duration);
      const fade = clamp01((t - p.delay) / p.fade);
      const sc = 1 + (p.scale - 1) * rest;
      const cx = geo.left + slide + p.cx * unit + p.tx * rest;
      const cy = geo.top + p.cy * unit + p.ty * rest;
      boxes.set([cx, cy, p.w * unit * sc, ((p.r + p.rot * rest) * Math.PI) / 180], i * 4);
      lens[i] = p.h * unit * sc;
      tints[i] = p.o * fade * leave;
    });
  };
  const frame = () => {
    if (!gl) return;
    raf = tick(frame);
    const t = now();
    place(t - start);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(loc.R, canvas.width, canvas.height);
    gl.uniform1f(loc.D, dpr);
    gl.uniform4fv(loc.B, boxes);
    gl.uniform1fv(loc.L, lens);
    gl.uniform1fv(loc.O, tints);
    gl.uniform1f(loc.T, (t - start) / 1000);
    gl.uniform2f(loc.P, px, py);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!sent) { sent = true; post({ ready: true }); }
    if (leaveAt >= 0 && t - leaveAt > 400) untick(raf);
  };
  const init = (m) => {
    canvas = m.canvas; start = m.start; cssW = m.w; cssH = m.h; dpr = m.dpr; timeline = m.timeline; geo = m.geo;
    gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('no webgl');
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, m.vs));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, m.fs));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(String(gl.getProgramInfoLog(program)));
    gl.useProgram(program);
    gl.clearColor(0, 0, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(program, 'a');
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    for (const k of ['R', 'D', 'B', 'L', 'O', 'T', 'P']) loc[k] = gl.getUniformLocation(program, k);
    size();
    raf = tick(frame);
  };
  return (m) => {
    try {
      if (m.init) init(m);
      else if (m.resize) { cssW = m.w; cssH = m.h; if (m.geo) geo = m.geo; size(); }
      else if (m.pointer) { px = m.x; py = m.y; }
      else if (m.leave) { if (leaveAt < 0) leaveAt = now(); }
      else if (m.stop) { untick(raf); gl && gl.getExtension('WEBGL_lose_context')?.loseContext(); gl = null; }
    } catch (error) {
      untick(raf);
      gl = null;
      post({ failed: String((error && error.message) || error) });
    }
  };
}

/**
 * 在 canvas 上启动玻璃碎片。startedAt：开场开始时刻（本页 performance 时钟）；
 * measure()：返回标志的当前几何（窗口变化时会再调用）。onReady 在第一帧画出后调用，
 * onFail 在没有 WebGL 或出错时调用（这时保留扁平的 SVG 碎片）。
 */
export function startGlass(canvas, startedAt, timeline, measure, onReady, onFail) {
  const geo = measure();
  if (!geo) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const init = { init: true, vs: VERTEX, fs: FRAGMENT, start: performance.timeOrigin + startedAt, w: window.innerWidth, h: window.innerHeight, dpr, timeline, geo };
  let send, dispose, done = false;
  const fail = () => { if (done) return; done = true; dispose(); onFail(); };
  const receive = (data) => {
    if (done) return;
    if (data.ready) onReady();
    if (data.failed) fail();
  };
  try {
    if (typeof Worker === 'function' && typeof canvas.transferControlToOffscreen === 'function' && typeof OffscreenCanvas === 'function') {
      const source = `var handle=(${renderer.toString()})(function(m){postMessage(m)});onmessage=function(e){handle(e.data)};`;
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      const worker = new Worker(url);
      URL.revokeObjectURL(url);
      worker.onmessage = (e) => receive(e.data);
      worker.onerror = () => fail();
      const offscreen = canvas.transferControlToOffscreen();
      send = (m, transfer) => worker.postMessage(m, transfer || []);
      dispose = () => { try { worker.postMessage({ stop: true }); } catch {} setTimeout(() => worker.terminate(), 50); };
      send({ ...init, canvas: offscreen }, [offscreen]);
    } else {
      const handle = renderer((m) => receive(m));
      send = (m) => handle(m);
      dispose = () => handle({ stop: true });
      send({ ...init, canvas });
    }
  } catch {
    onFail();
    return null;
  }
  let resizeFrame = 0;
  const resize = () => {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; if (!done) send({ resize: true, w: window.innerWidth, h: window.innerHeight, geo: measure() }); });
  };
  window.addEventListener('resize', resize);
  return {
    leave: () => { if (!done) send({ leave: true }); },
    pointer: (x, y) => { if (!done) send({ pointer: true, x, y }); },
    stop: () => {
      window.removeEventListener('resize', resize);
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      if (!done) { done = true; dispose(); }
    },
  };
}

// 手势识别 Worker：MediaPipe 在这里跑，主线程只负责 3D 渲染和界面，互不抢时间。
// 主线程每来一帧新画面就送一张 ImageBitmap 过来，这里识别完只回传 21 个关键点。
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

// tasks-vision 在 module worker 里加载 wasm 胶水代码时会走 self.import，并期望之后 self.ModuleFactory 已就位。
// 用 ES module 版胶水（forVisionTasks 第二个参数 true），取它的默认导出挂上去。
self.import = async (url) => {
  const mod = await import(/* @vite-ignore */ url);
  self.ModuleFactory = mod.default;
  return mod;
};

// ES module 是严格模式：胶水代码里 if 块中声明的 custom_dbg 出了块就不存在了，这里先给一个全局的
self.custom_dbg = (...args) => console.debug(...args);

let landmarker = null;

async function init(base) {
  const vision = await FilesetResolver.forVisionTasks(base + 'mediapipe/wasm', true);
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: base + 'mediapipe/hand_landmarker.task', delegate },
    runningMode: 'VIDEO',
    numHands: 1,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.6,
  });
  try {
    landmarker = await HandLandmarker.createFromOptions(vision, options('GPU'));
  } catch {
    landmarker = await HandLandmarker.createFromOptions(vision, options('CPU'));
  }
}

self.onmessage = async (event) => {
  const msg = event.data;
  if (msg.type === 'init') {
    try {
      await init(msg.base);
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err?.message || err) });
    }
    return;
  }
  if (msg.type === 'frame') {
    const { bitmap, t } = msg;
    let points = null;
    try {
      const result = landmarker?.detectForVideo(bitmap, t);
      const lm = result?.landmarks?.[0];
      if (lm) {
        points = new Float32Array(lm.length * 3);
        lm.forEach((p, i) => { points[i * 3] = p.x; points[i * 3 + 1] = p.y; points[i * 3 + 2] = p.z || 0; });
      }
    } catch {}
    bitmap.close();
    self.postMessage({ type: 'result', t, points }, points ? [points.buffer] : []);
  }
};

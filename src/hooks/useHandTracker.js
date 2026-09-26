import { useEffect } from 'react';
import { useTarotStore } from '../store/useTarotStore';
import { OneEuroFilter } from '../utils/oneEuroFilter';

/**
 * MediaPipe 手势识别
 *
 * 流畅度：
 *   · 识别跑在 Web Worker 里（hand.worker.js），3D 渲染再重也不会拖慢手势，反过来也一样
 *   · 摄像头取 1280×720：手部关键点是在裁出的手部区域上算的，像素越多定位越准、越不抖
 *   · 只在摄像头真的出新帧时识别（requestVideoFrameCallback），上一帧没识别完就跳过，永远处理最新画面
 *   · Worker 起不来（老浏览器）时自动退回主线程识别
 * 跟手：
 *   · 光标跟"食指根部与指尖的中点"，捏合时不会被指尖带偏
 *   · One-Euro 滤波 + 约 3px 死区：静止时不晃，快动时几乎不滞后；只在快速移动时做前瞻
 *   · 两指越靠近光标越"沉"，捏上的那一刻基本定住：选中的就是你指着的那张
 *   · 摄像头中央 70% 映射到整个屏幕，手不用伸到边缘
 *   · 捏合按手掌大小归一化（离摄像头远近都准）、只用平面距离（深度值噪声大），按下、松开都要两帧确认
 */

const MAP_MIN = 0.15;
const MAP_MAX = 0.85;
const remap = (v) => (Math.max(MAP_MIN, Math.min(MAP_MAX, v)) - MAP_MIN) / (MAP_MAX - MAP_MIN);
const LANDMARKER_OPTIONS = (base, delegate) => ({
  baseOptions: { modelAssetPath: base + 'mediapipe/hand_landmarker.task', delegate },
  runningMode: 'VIDEO',
  numHands: 1,
  minHandDetectionConfidence: 0.6,
  minHandPresenceConfidence: 0.6,
  minTrackingConfidence: 0.6,
});

export function useHandTracker(videoRef, enabled = true) {
  const setCursor = useTarotStore((s) => s.setCursor);
  const setPinching = useTarotStore((s) => s.setPinching);
  const setRiverAccelerate = useTarotStore((s) => s.setRiverAccelerate);
  const setCameraState = useTarotStore((s) => s.setCameraState);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let stream = null;
    let worker = null;
    let mainLandmarker = null;
    let frameHandle = 0;

    const s = {
      // 静止时强平滑（不晃），移动时放开（跟手）。单位：屏幕宽高的比例 / 秒
      xf: new OneEuroFilter({ minCutoff: 0.7, beta: 0.9, dCutoff: 1.2 }),
      yf: new OneEuroFilter({ minCutoff: 0.7, beta: 0.9, dCutoff: 1.2 }),
      out: { x: 0.5, y: 0.5 },
      last: { x: 0.5, y: 0.5, t: 0 },
      aspect: 16 / 9,
      handVisible: false,
      pinch: false,
      pinchEma: 1,
      closeCount: 0,
      releaseCount: 0,
      palm: false,
      palmCount: 0,
    };

    const PINCH_ENTER = 0.26; // 拇指尖–食指尖距离 / 手掌长度
    const PINCH_EXIT = 0.42;
    const APPROACH = 0.62; // 从这里开始光标逐渐"定住"

    /** 21 个关键点（x,y,z 交错）→ 光标 / 捏合 / 张掌 */
    const handle = (pts, now) => {
      if (!alive) return;
      if (!pts) {
        if (s.handVisible) {
          // 手刚离开画面：只通知一次，之后把光标让给鼠标/触摸
          s.handVisible = false;
          s.closeCount = 0;
          setCursor(s.out.x, s.out.y, false);
          if (s.pinch) { s.pinch = false; setPinching(false); }
          if (s.palm) { s.palm = false; setRiverAccelerate(false); }
        }
        return;
      }
      s.handVisible = true;
      const P = (i) => ({ x: pts[i * 3], y: pts[i * 3 + 1] });
      // 摄像头坐标是按宽、高分别归一化的：算距离前先把 x 拉回真实比例
      const dist2 = (a, b) => Math.hypot((a.x - b.x) * s.aspect, a.y - b.y);
      const index = P(8), thumb = P(4), wrist = P(0), knuckle = P(5);
      const palmSize = dist2(wrist, P(9)) || 0.1;

      // ---- 捏合：两帧确认按下，两帧确认松开 ----
      const pinchDist = dist2(index, thumb) / palmSize;
      s.pinchEma = s.pinchEma * 0.35 + pinchDist * 0.65;
      const approach = Math.max(0, Math.min(1, (APPROACH - s.pinchEma) / (APPROACH - PINCH_ENTER)));

      // ---- 光标：跟"食指根部与指尖的中点"。捏合时指尖会往拇指靠，根部几乎不动，中点就稳得多 ----
      const ax = (index.x + knuckle.x) / 2;
      const ay = (index.y + knuckle.y) / 2;
      const fx = remap(s.xf.filter(1 - ax, now));
      const fy = remap(s.yf.filter(ay, now));
      const dt = Math.max(1, now - s.last.t);
      const vx = (fx - s.last.x) / dt, vy = (fy - s.last.y) / dt;
      s.last = { x: fx, y: fy, t: now };
      let tx = fx, ty = fy;
      // 快速移动时才做一点前瞻（补偿识别延迟）；慢动和静止时不做，避免放大抖动
      const speed = Math.hypot(vx, vy) * 1000; // 屏幕 / 秒
      if (speed > 0.6) {
        const ahead = Math.min(20, dt) * Math.min(1, (speed - 0.6) / 1.2);
        tx += vx * ahead;
        ty += vy * ahead;
      }
      // 死区：小于约 3px 的变化视为手在自然抖动，光标不动
      if (Math.hypot(tx - s.out.x, (ty - s.out.y) * 0.6) < 0.0022 && !s.pinch) { tx = s.out.x; ty = s.out.y; }
      // 两指越靠近，光标越"沉"：捏合前的一瞬间基本定住，选中的就是你指着的那张
      const hold = s.pinch ? 0.92 : approach * 0.85;
      s.out = {
        x: Math.max(0, Math.min(1, s.out.x + (tx - s.out.x) * (1 - hold))),
        y: Math.max(0, Math.min(1, s.out.y + (ty - s.out.y) * (1 - hold))),
      };
      setCursor(s.out.x, s.out.y, true, 'gesture', s.pinch ? 1 : approach);

      if (!s.pinch) {
        s.closeCount = s.pinchEma < PINCH_ENTER ? s.closeCount + 1 : 0;
        if (s.closeCount >= 2) { s.pinch = true; s.releaseCount = 0; setPinching(true); }
      } else {
        s.releaseCount = s.pinchEma > PINCH_EXIT ? s.releaseCount + 1 : 0;
        if (s.releaseCount >= 2) { s.pinch = false; s.closeCount = 0; setPinching(false); }
      }

      // ---- 张开手掌 → 牌河加速 ----
      const toWrist = (p) => dist2(p, wrist);
      let extended = 0;
      for (const [tip, pip] of [[8, 6], [12, 10], [16, 14], [20, 18]]) if (toWrist(P(tip)) > toWrist(P(pip)) * 1.1) extended++;
      const thumbOut = toWrist(P(4)) > toWrist(P(3)) * 1.05;
      const spread = dist2(P(8), P(20)) / palmSize;
      const open = !s.pinch && approach === 0 && extended === 4 && thumbOut && spread > 1.1;
      if (open !== s.palm) {
        if (++s.palmCount >= 3) { s.palm = open; s.palmCount = 0; setRiverAccelerate(open); }
      } else s.palmCount = 0;
    };

    const base = new URL(import.meta.env.BASE_URL || '/', location.href).href;

    const startWorker = () =>
      new Promise((resolve, reject) => {
        try {
          worker = new Worker(new URL('./hand.worker.js', import.meta.url), { type: 'module' });
        } catch (e) {
          reject(e);
          return;
        }
        const timer = setTimeout(() => reject(new Error('Worker 初始化超时')), 25000);
        worker.onmessage = (e) => {
          if (e.data.type === 'ready') { clearTimeout(timer); resolve(); }
          else if (e.data.type === 'error') { clearTimeout(timer); reject(new Error(e.data.message)); }
        };
        worker.onerror = (e) => { clearTimeout(timer); reject(new Error(e.message || 'worker error')); };
        worker.postMessage({ type: 'init', base });
      });

    const startMainThread = async () => {
      const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks(base + 'mediapipe/wasm');
      mainLandmarker = await HandLandmarker.createFromOptions(vision, LANDMARKER_OPTIONS(base, 'GPU'));
    };

    const init = async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setCameraState('error'); return; }
      setCameraState('starting');
      try {
        // 摄像头授权和模型加载同时进行
        const camera = navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60, max: 60 }, facingMode: 'user' },
          audio: false,
        });
        const model = camera.then(() => startWorker()).catch(async (err) => {
          if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError' || err?.name === 'NotFoundError') throw err;
          console.warn('[HandTracker] Worker 不可用，改在主线程识别：', err?.message || err);
          worker?.terminate();
          worker = null;
          await startMainThread();
        });
        model.catch(() => {}); // 摄像头被拒时由下面的 await camera 报告，这里别再抛未处理的 rejection
        stream = await camera;
        await model;
        const video = videoRef.current;
        if (!alive || !video) return;
        video.srcObject = stream;
        await video.play();
        s.aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
        setCameraState('on');
        console.info(`[HandTracker] 手势识别已开启（${worker ? 'Worker 线程' : '主线程'}）`);

        let busy = false;
        if (worker) {
          worker.onmessage = (e) => {
            if (e.data.type !== 'result') return;
            busy = false;
            handle(e.data.points, performance.now());
          };
        }
        const schedule = () => {
          frameHandle = video.requestVideoFrameCallback ? video.requestVideoFrameCallback(onFrame) : requestAnimationFrame(onFrame);
        };
        const onFrame = async () => {
          if (!alive) return;
          schedule();
          if (video.readyState < 2) return;
          const now = performance.now();
          if (worker) {
            if (busy) return;
            busy = true;
            try {
              const bitmap = await createImageBitmap(video);
              worker.postMessage({ type: 'frame', bitmap, t: now }, [bitmap]);
            } catch {
              busy = false;
            }
          } else if (mainLandmarker) {
            try {
              const lm = mainLandmarker.detectForVideo(video, now)?.landmarks?.[0];
              handle(lm ? Float32Array.from(lm.flatMap((p) => [p.x, p.y, p.z || 0])) : null, now);
            } catch {}
          }
        };
        schedule();
      } catch (err) {
        console.error('[HandTracker] 初始化失败:', err);
        if (alive) setCameraState(err?.name === 'NotAllowedError' || err?.name === 'SecurityError' ? 'denied' : 'error');
      }
    };

    init();
    return () => {
      alive = false;
      const video = videoRef.current;
      if (video?.cancelVideoFrameCallback && frameHandle) video.cancelVideoFrameCallback(frameHandle);
      else cancelAnimationFrame(frameHandle);
      worker?.terminate();
      try { mainLandmarker?.close(); } catch {}
      stream?.getTracks().forEach((t) => t.stop());
      setCameraState('off');
    };
  }, [enabled, videoRef, setCursor, setPinching, setRiverAccelerate, setCameraState]);
}

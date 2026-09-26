// 占星师的 Live2D 渲染层。只在浏览器、空闲之后才加载。
// 形象：Live2D 官方示例模型「Mao（真央）」，Live2D Free Material License，原样使用。
// Cubism Core 为 Live2D 专有软件，按其再分发条款随站点提供。

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

const MODEL_URL = '/companion/mao/Mao.model3.json';
const CORE_URL = '/companion/live2dcubismcore.min.js?v=5';

// 心情 → 模型自带的表情（expressions/exp_0N）
const EXPRESSION = {
  happy: 'exp_02', excited: 'exp_04', think: null, worry: 'exp_05',
  sad: 'exp_05', surprise: 'exp_07', shy: 'exp_06', angry: 'exp_08', neutral: null,
};
// 模型自带动作（Mao.model3.json）：
//   Idle 0 待机 · Idle 1 水晶球占卜
//   TapBody 0–2 小动作 · 3 治愈魔法（爱心+光环）· 4 魔法失手（爆炸+冒烟）· 5 召唤兔子
const MOTION = {
  crystal: ['Idle', 1], bless: ['TapBody', 3], misfire: ['TapBody', 4], rabbit: ['TapBody', 5],
};
const MOTION_SECONDS = { 'Idle:0': 5.6, 'Idle:1': 5.6, 'TapBody:0': 3.5, 'TapBody:1': 4.4, 'TapBody:2': 4.2, 'TapBody:3': 7.8, 'TapBody:4': 9.4, 'TapBody:5': 9.2 };
// 空闲时一闪而过的小表情
const QUIRKS = ['exp_02', 'exp_04', 'exp_06', 'exp_07'];
// 场景层：叠在动作之上的小状态（淡入淡出）
const SCENES = [
  {},
  { ParamCheek: 0.6 },                         // 微微脸红
  { ParamEyeEffect: 1 },                       // 眼里有星星
  { ParamHatForm: 0.5 },                       // 帽子歪一点
];
const HOLD = {
  crystal: { ParamSphereOn: 1 },               // 占卜时一直托着水晶球
};
const SCENE_FADE = 0.45;
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const between = (min, max) => min + Math.random() * (max - min);

let coreLoading = null;
function loadCore() {
  if (window.Live2DCubismCore) return Promise.resolve();
  if (!coreLoading) {
    coreLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = CORE_URL;
      script.async = true;
      script.onload = () => (window.Live2DCubismCore ? resolve() : reject(new Error('Cubism Core 未初始化')));
      script.onerror = () => reject(new Error('Cubism Core 缺失'));
      document.head.appendChild(script);
    }).catch((error) => {
      coreLoading = null;
      throw error;
    });
  }
  return coreLoading;
}

const AstrologerStage = forwardRef(function AstrologerStage({ width, height, paused, reducedMotion, onReady, onError }, ref) {
  const canvasRef = useRef(null);
  const appRef = useRef(null);
  const modelRef = useRef(null);
  const speakingRef = useRef(false);
  const moodTimer = useRef(null);
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const moodActive = useRef(false);
  const walkDir = useRef(0);
  const holdRef = useRef({});
  const playRef = useRef(() => {});
  const callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };

  useImperativeHandle(ref, () => ({
    setMood(mood) {
      const model = modelRef.current;
      if (!model) return;
      clearTimeout(moodTimer.current);
      const name = EXPRESSION[mood] ?? null;
      const manager = model.internalModel?.motionManager?.expressionManager;
      try {
        if (name) model.expression(name);
        else manager?.resetExpression?.();
      } catch {}
      if (!reducedRef.current) {
        if (mood === 'excited') playRef.current('TapBody', 5, 2);
        else if (mood === 'happy') playRef.current('TapBody', Math.floor(Math.random() * 3), 2);
        else if (mood === 'surprise') playRef.current('TapBody', 1, 2);
      }
      // 情绪会慢慢回到平静的脸，而不是一直挂着
      moodActive.current = !!name;
      if (name) moodTimer.current = setTimeout(() => {
        moodActive.current = false;
        try { manager?.resetExpression?.(); } catch {}
      }, 7000);
    },
    /** 一段有名字的魔法：crystal 水晶球 / bless 治愈 / misfire 失手 / rabbit 兔子 */
    cast(name) {
      if (reducedRef.current || !MOTION[name]) return;
      const [group, index] = MOTION[name];
      playRef.current(group, index, 3);
    },
    /** 持续状态：占卜期间一直托着水晶球 */
    hold(name, on) {
      holdRef.current = on && HOLD[name] ? HOLD[name] : {};
    },
    touch() {
      if (reducedRef.current) return;
      playRef.current('TapBody', Math.floor(Math.random() * 3), 3);
    },
    speak(speaking) { speakingRef.current = speaking; },
    walk(direction) { walkDir.current = reducedRef.current ? 0 : direction; },
    greet() {
      if (reducedRef.current) return;
      playRef.current('TapBody', 5, 3);
    },
  }), []);

  useEffect(() => {
    let disposed = false;
    let frame = 0;
    let follow = null;
    let stopBehaviour = () => {};
    (async () => {
      try {
        await loadCore();
        const PIXI = await import('pixi.js');
        const { Live2DModel } = await import('pixi-live2d-display/cubism4');
        if (disposed || !canvasRef.current) return;
        Live2DModel.registerTicker(PIXI.Ticker);

        const app = new PIXI.Application({
          view: canvasRef.current, width, height, backgroundAlpha: 0, antialias: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true,
          powerPreference: 'low-power',
        });
        appRef.current = app;
        // 3D 牌阵才是主角：看板娘最多 40 帧（弱设备 30 帧），把 GPU 留给场景
        app.ticker.maxFPS = (navigator.hardwareConcurrency || 8) <= 4 ? 30 : 40;
        const model = await Live2DModel.from(MODEL_URL, { autoInteract: false });
        if (disposed) { model.destroy(); return; }
        modelRef.current = model;

        // Mao 的画布四周留了很多给魔法特效的空白：按人物本身取景，脚踩在舞台底边
        const bounds = model.getLocalBounds();
        const scale = Math.min(width / (bounds.width * 0.62), height / (bounds.height * 0.9));
        model.scale.set(scale);
        model.anchor.set(0.5, 0.94);
        model.position.set(width / 2, height);
        app.stage.addChild(model);

        const core = () => model.internalModel.coreModel;
        // 说话时嘴巴开合（写在动作之后，不被覆盖）
        let phase = 0;
        model.internalModel.on('beforeModelUpdate', () => {
          if (!speakingRef.current) return;
          phase += 0.35;
          core().setParameterValueById('ParamA', 0.2 + Math.abs(Math.sin(phase)) * 0.7);
        });

        // 场景层：参数按权重淡入淡出，叠在动作结果上
        const layer = [];
        let lastUpdate = performance.now();
        let turn = 0;
        let scene = {};
        const setTargets = () => {
          const want = { ...scene, ...holdRef.current };
          const keep = new Set();
          for (const [id, value] of Object.entries(want)) {
            const same = layer.find((e) => e.id === id && e.value === value);
            if (same) keep.add(same);
            else { const e = { id, value, weight: 0, on: true }; layer.push(e); keep.add(e); }
          }
          for (const e of layer) e.on = keep.has(e);
        };
        let lastHold = holdRef.current;
        const play = (group, index, priority) => {
          const chosen = index ?? 0;
          try { model.motion(group, chosen, priority); } catch {}
        };
        playRef.current = play;
        model.internalModel.on('beforeModelUpdate', () => {
          const now = performance.now();
          const step = Math.min(0.1, (now - lastUpdate) / 1000) / SCENE_FADE;
          lastUpdate = now;
          if (holdRef.current !== lastHold) { lastHold = holdRef.current; setTargets(); }
          for (let i = layer.length - 1; i >= 0; i--) {
            const e = layer[i];
            e.weight = Math.max(0, Math.min(1, e.weight + (e.on ? step : -step)));
            if (!e.on && e.weight === 0) layer.splice(i, 1);
          }
          const c = core();
          // 走路时朝前进方向侧身（从模型视角看，屏幕右边是 +X）
          turn += (walkDir.current - turn) * Math.min(1, step * SCENE_FADE * 5);
          if (Math.abs(turn) > 0.005) {
            for (const [id, amount] of [['ParamAngleX', 22], ['ParamBodyAngleX', 8], ['ParamEyeBallX', 0.7]]) {
              c.setParameterValueById(id, c.getParameterValueById(id) + turn * amount);
            }
          }
          for (const e of layer) {
            if (e.weight === 0) continue;
            const base = c.getParameterValueById(e.id);
            c.setParameterValueById(e.id, base + (e.value - base) * e.weight);
          }
        });

        // 自主行为：换小状态、做小动作、闪个小表情。收起/隐藏/减少动态效果时都不动
        const timers = new Set();
        const later = (ms, run) => {
          const timer = setTimeout(() => { timers.delete(timer); if (!disposed) run(); }, ms);
          timers.add(timer);
        };
        const every = (min, max, run) => {
          const loop = () => later(between(min, max) * 1000, () => { if (!pausedRef.current && !reducedRef.current) run(); loop(); });
          loop();
        };
        every(10, 18, () => { scene = Math.random() < 0.5 ? {} : pick(SCENES); setTargets(); });
        every(6, 11, () => {
          if (speakingRef.current || Object.keys(holdRef.current).length) return;
          const r = Math.random();
          if (r < 0.55) play('TapBody', Math.floor(Math.random() * 3), 1);
          else if (r < 0.85) play('Idle', 1, 1); // 看一眼水晶球
          else play('TapBody', 5, 1);
        });
        every(6, 12, () => {
          const manager = model.internalModel?.motionManager?.expressionManager;
          if (moodActive.current || speakingRef.current || !manager) return;
          try { model.expression(pick(QUIRKS)); } catch {}
          later(between(1800, 3200), () => { if (!moodActive.current) try { manager.resetExpression?.(); } catch {} });
        });
        stopBehaviour = () => { timers.forEach(clearTimeout); timers.clear(); };

        // 眼睛和头跟着整页的指针走，不只是画布上方
        let pending = null;
        follow = (event) => {
          if (reducedRef.current) return;
          pending = event;
          if (frame) return;
          frame = requestAnimationFrame(() => {
            frame = 0;
            const canvas = canvasRef.current;
            if (!pending || !canvas || !modelRef.current) return;
            const rect = canvas.getBoundingClientRect();
            modelRef.current.focus(pending.clientX - rect.left, pending.clientY - rect.top);
          });
        };
        window.addEventListener('pointermove', follow, { passive: true });
        if (pausedRef.current) app.ticker.stop();
        callbacks.current.onReady?.();
      } catch (error) {
        if (!disposed) callbacks.current.onError?.(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      disposed = true;
      stopBehaviour();
      if (frame) cancelAnimationFrame(frame);
      if (follow) window.removeEventListener('pointermove', follow);
      clearTimeout(moodTimer.current);
      try { modelRef.current?.destroy(); } catch {}
      try { appRef.current?.destroy(false, { children: true }); } catch {}
      modelRef.current = null;
      appRef.current = null;
    };
    // 舞台尺寸每次挂载定一次；尺寸档变化时由外层重新挂载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    if (paused) app.ticker?.stop();
    else app.ticker?.start();
  }, [paused]);

  return <canvas ref={canvasRef} width={width} height={height} aria-hidden="true" style={{ width, height, display: 'block' }} />;
});

export { MOTION_SECONDS };
export default AstrologerStage;

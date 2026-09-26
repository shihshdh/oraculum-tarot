import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ARCH, BAR, SHARDS, SHARD_PATHS } from './BrandMark';
import { startGlass } from './introGlass';
import { sampleLetters, startStardust } from './introStardust';
import { useTarotStore } from '../../store/useTarotStore';

/**
 * 开场标题（每次完整加载页面都播放；地址加 ?nointro 跳过；副屏不播）。
 *
 *   0.25s  四片金色液态玻璃从屏幕四角旋转飞来，拼成一颗四芒星
 *   1.5s   拱顶牌框一笔画出，底部牌名栏展开
 *   2.35s  星芒一闪
 *   2.7s   标志滑向左边，ORACULUM 逐字浮现，副标题淡入
 *   4.9s   标志飞进顶栏的位置，夜空与牌阵在下面展开
 *
 * 做法与 Pixel Reconstruction 的开场一致：会动的全是 transform / opacity（合成器上跑），
 * 玻璃由 WebGL 在 Worker 里画、与动画同一个时钟；3D 场景等碎片落定后才开始加载，开场不被拖慢。
 * 轻触任意处或按任意键跳过。减少动态效果时只淡入淡出。
 */

const T = {
  shard: [250, 420, 590, 760], shardDur: 1300, shardFade: 500,
  arch: 1500, archDur: 1000,
  bar: 2300,
  flash: 2350,
  slide: 2700, slideDur: 900,
  letters: 3000, letterStep: 55,
  sub: 3650,
  land: 4900, flight: 950,
  scene: 1600,
};
const FROM = [
  { tx: -240, ty: -170, rot: -140, scale: 1.9 },
  { tx: 280, ty: -130, rot: 120, scale: 1.6 },
  { tx: 190, ty: 210, rot: -100, scale: 2.0 },
  { tx: -280, ty: 150, rot: 150, scale: 1.7 },
];
const EASE = 'cubic-bezier(.16,1,.3,1)';
const EASE_FLY = 'cubic-bezier(.22,1,.36,1)';
const EASE_TRAVEL = 'cubic-bezier(.65,0,.2,1)';
const NAME = 'ORACULUM';

export function introWanted() {
  const params = new URLSearchParams(location.search);
  return !params.has('nointro') && params.get('role') !== 'mirror';
}

export default function BrandIntro({ onSceneStart }) {
  const [live, setLive] = useState(introWanted);
  const setIntroDone = useTarotStore((s) => s.setIntroDone);
  const rootRef = useRef(null);
  const backdropRef = useRef(null);
  const slideRef = useRef(null);
  const markRef = useRef(null);
  const wordRef = useRef(null);
  const sceneRef = useRef(onSceneStart);
  sceneRef.current = onSceneStart;

  useLayoutEffect(() => {
    if (!live) {
      setIntroDone(true);
      sceneRef.current?.();
      return;
    }
    document.documentElement.setAttribute('data-intro', '');
    const root = rootRef.current;
    const slideEl = slideRef.current;
    const mark = markRef.current;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const startedAt = performance.now();
    const anims = [];
    const timers = [];
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    const animate = (el, frames, opts) => { const a = el.animate(frames, { fill: 'both', ...opts }); anims.push(a); return a; };
    let phase = 'play';
    const debug = /[?&]introdebug/.test(location.search) ? (...a) => console.log('INTRO-DBG', Math.round(performance.now() - startedAt), ...a) : () => {};
    debug('start');
    let glass = null;
    let dust = null;

    // 标志居中：先把整组向右推"字标宽度的一半"，滑动时再回到正中
    // 窄屏上字标排在标志下方，不需要横向滑动
    const stacked = getComputedStyle(slideEl).flexDirection === 'column';
    const slideX = stacked ? 0 : (slideEl.offsetWidth - mark.offsetWidth) / 2;
    const scale = mark.offsetWidth / 64;

    const finish = () => {
      debug('finish', phase);
      if (phase === 'done') return;
      phase = 'done';
      glass?.stop();
      dust?.stop();
      timers.forEach(clearTimeout);
      document.documentElement.removeAttribute('data-intro');
      setIntroDone(true);
      setLive(false);
    };
    const sceneOnce = (() => { let started = false; return () => { if (!started) { started = true; sceneRef.current?.(); } }; })();

    if (reduced) {
      animate(slideEl, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: 'linear' });
      sceneOnce();
      later(1900, () => { phase = 'leaving'; root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, fill: 'forwards' }).finished.then(finish, finish); });
      return () => { timers.forEach(clearTimeout); document.documentElement.removeAttribute('data-intro'); };
    }

    // ---------- 时间轴 ----------
    animate(slideEl, [{ transform: `translateX(${slideX}px)` }, { transform: 'none' }], { duration: T.slideDur, delay: T.slide, easing: EASE_TRAVEL });
    const shards = mark.querySelectorAll('[data-part="shard"]');
    shards.forEach((el, i) => {
      const f = FROM[i];
      animate(el, [{ transform: `translate(${f.tx / scale}px,${f.ty / scale}px) rotate(${f.rot}deg) scale(${f.scale})`, opacity: 0 }, { transform: 'none', opacity: SHARDS[i].o }], {
        duration: T.shardDur, delay: T.shard[i], easing: EASE_FLY,
      });
    });
    animate(mark.querySelector('[data-part="shell"]'), [{ strokeDashoffset: 1, fillOpacity: 0 }, { strokeDashoffset: 0, fillOpacity: 0, offset: 0.8 }, { strokeDashoffset: 0, fillOpacity: 0.07 }], { duration: T.archDur, delay: T.arch, easing: 'cubic-bezier(.45,0,.2,1)' });
    animate(mark.querySelector('[data-part="bar"]'), [{ transform: 'scaleX(0)', opacity: 0 }, { transform: 'none', opacity: 0.7 }], { duration: 420, delay: T.bar, easing: EASE });
    animate(mark.querySelector('[data-flash]'), [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1)', offset: 0.25 }, { opacity: 0, transform: 'scale(1.6)' }], { duration: 900, delay: T.flash, easing: 'ease-out' });
    wordRef.current.querySelectorAll('[data-letter]').forEach((el, i) => {
      animate(el, [{ opacity: 0, transform: 'translateY(22px)' }, { opacity: 1, transform: 'none' }], { duration: 760, delay: T.letters + i * T.letterStep, easing: EASE });
    });
    animate(wordRef.current.querySelector('[data-sub]'), [{ opacity: 0, transform: 'translateY(8px)', letterSpacing: '0.2em' }, { opacity: 1, transform: 'none', letterSpacing: '0.62em' }], { duration: 900, delay: T.sub, easing: EASE });

    // ---------- 液态玻璃碎片 ----------
    const measure = () => {
      const r = mark.getBoundingClientRect();
      const offset = new DOMMatrixReadOnly(getComputedStyle(slideEl).transform).m41 || 0;
      return { left: r.left - offset + slideX, top: r.top, box: r.width, slideX: -slideX };
    };
    // 每次挂载新建画布：画布一旦交给 Worker 就不能再用（开发模式下 effect 会跑两次）
    const canvas = document.createElement('canvas');
    canvas.className = 'brand-intro-glass';
    canvas.setAttribute('aria-hidden', 'true');
    backdropRef.current.after(canvas);
    if (canvas) {
      glass = startGlass(
        canvas,
        startedAt,
        { shards: SHARDS.map((s, i) => ({ ...s, delay: T.shard[i], duration: T.shardDur, fade: T.shardFade, ...FROM[i] })), slide: { delay: T.slide, duration: T.slideDur } },
        measure,
        () => { if (phase === 'play') root.setAttribute('data-glass', ''); },
        () => root.removeAttribute('data-glass')
      );
    }
    // ---------- 沿笔画流动的星光 ----------
    const dustCanvas = document.createElement('canvas');
    dustCanvas.className = 'brand-intro-glass';
    dustCanvas.setAttribute('aria-hidden', 'true');
    root.appendChild(dustCanvas);
    dust = startStardust(dustCanvas, startedAt, { x: slideX, delay: T.slide, duration: T.slideDur });
    later(T.letters - 250, () => {
      if (phase !== 'play' || !dust) return;
      try {
        const spans = [...wordRef.current.querySelectorAll('[data-letter]')];
        const offset = new DOMMatrixReadOnly(getComputedStyle(slideEl).transform).m41 || 0;
        const lineTop = wordRef.current.querySelector('.brand-intro-name').getBoundingClientRect().top;
        dust.feed(sampleLetters(spans, offset, lineTop).map((pts, i) => ({ pts, start: T.letters + i * T.letterStep + 180 })));
      } catch (e) {
        debug('stardust sample failed', e);
      }
    });
    // 字母全部到场后，一道金光从左到右扫过字面
    wordRef.current.querySelectorAll('[data-letter]').forEach((el, i) => {
      animate(el, [{ backgroundPosition: '100% 0' }, { backgroundPosition: '0% 0' }], { duration: 1100, delay: T.letters + 700 + i * 75, easing: 'cubic-bezier(.4,0,.2,1)' });
    });

    const onPointer = (e) => glass?.pointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
    window.addEventListener('pointermove', onPointer, { passive: true });

    later(T.scene, sceneOnce);

    // ---------- 收尾：标志飞进顶栏，夜空在下面展开 ----------
    const land = () => {
      debug('land', phase);
      if (phase !== 'play') return;
      phase = 'leaving';
      sceneOnce();
      glass?.leave();
      dust?.leave();
      root.removeAttribute('data-glass');
      const target = document.querySelector('[data-brand-mark]')?.getBoundingClientRect();
      mark.style.transformOrigin = '0 0';
      const from = mark.getBoundingClientRect();
      if (target && target.width) {
        const s = target.width / from.width;
        animate(mark, [{ transform: 'none' }, { transform: `translate(${target.left - from.left}px,${target.top - from.top}px) scale(${s})` }], { duration: T.flight, easing: EASE_TRAVEL, fill: 'forwards' }).finished.then(() => { mark.style.opacity = '0'; });
      } else {
        animate(mark, [{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' });
      }
      animate(wordRef.current, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-24px)' }], { duration: 420, easing: EASE, fill: 'forwards' });
      animate(backdropRef.current, [{ opacity: 1 }, { opacity: 0 }], { duration: 800, delay: 150, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
      later(T.flight + 60, finish);
    };
    // 在标题完整之前跳过：直接整体淡出
    const dissolve = () => {
      debug('dissolve', phase);
      if (phase !== 'play') return;
      phase = 'leaving';
      sceneOnce();
      glass?.leave();
      dust?.leave();
      root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 480, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }).finished.then(finish, finish);
    };
    later(T.land, land);
    const skip = (e) => (debug('skip', e.type, e.key || ''), performance.now() - startedAt > T.sub ? land() : dissolve());
    root.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', skip);
    // 安全网：无论如何 9 秒后一定结束
    later(9000, finish);

    return () => {
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('keydown', skip);
      root.removeEventListener('pointerdown', skip);
      timers.forEach(clearTimeout);
      anims.forEach((a) => a.cancel());
      glass?.stop();
      dust?.stop();
      canvas.remove();
      dustCanvas.remove();
      document.documentElement.removeAttribute('data-intro');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!live) return null;

  return (
    <div ref={rootRef} className="brand-intro" data-no-card-click aria-label="ORACULUM 命运的抉择" role="img">
      <div ref={backdropRef} className="brand-intro-backdrop" />
      <div className="brand-intro-center">
        <div ref={slideRef} className="brand-intro-lockup">
          <span ref={markRef} className="brand-intro-mark">
            <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
              <path data-part="shell" d={ARCH} pathLength="1" strokeDasharray="1" fill="currentColor" fillOpacity=".07" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
              <path data-part="bar" d={BAR} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              {SHARD_PATHS.map((d, i) => <path key={i} data-part="shard" d={d} fill="currentColor" />)}
            </svg>
            <span data-flash className="brand-intro-flash" />
          </span>
          <div ref={wordRef} className="brand-intro-word">
            <div className="brand-intro-name">{NAME.split('').map((c, i) => <span key={i} data-letter>{c}</span>)}</div>
            <div data-sub className="brand-intro-sub">命运的抉择 · TAROT</div>
          </div>
        </div>
      </div>
      <style>{`
        .brand-intro { position: fixed; inset: 0; z-index: 2000; cursor: pointer; }
        .brand-intro-backdrop { position: absolute; inset: 0; background: radial-gradient(ellipse 70% 60% at 50% 45%, #171034 0%, #0a0818 55%, #040309 100%); }
        .brand-intro-glass { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
        .brand-intro-center { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
        .brand-intro-lockup { display: flex; align-items: center; gap: clamp(18px, 3vw, 34px); }
        .brand-intro-mark { position: relative; flex: none; width: clamp(104px, 15vw, 168px); height: clamp(104px, 15vw, 168px); color: var(--gold); }
        .brand-intro-mark svg { width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 0 18px rgba(233,203,139,.35)); }
        .brand-intro-mark [data-part="shard"], .brand-intro-mark [data-part="bar"] { transform-box: fill-box; transform-origin: center; }
        /* 玻璃画出来后，扁平碎片藏起来；飞进顶栏时再换回扁平的 */
        .brand-intro[data-glass] .brand-intro-mark [data-part="shard"] { visibility: hidden; }
        .brand-intro-flash { position: absolute; left: 50%; top: 57%; width: 70%; height: 70%; margin: -35% 0 0 -35%; border-radius: 50%; opacity: 0; pointer-events: none;
          background: radial-gradient(circle, rgba(255,246,220,.95) 0%, rgba(233,203,139,.45) 18%, transparent 60%); mix-blend-mode: screen; }
        .brand-intro-word { display: flex; flex-direction: column; gap: 12px; }
        .brand-intro-name { font-family: var(--display); font-size: clamp(34px, 6.4vw, 78px); letter-spacing: .2em; line-height: 1; color: #fbf4e2; text-shadow: 0 0 30px rgba(233,203,139,.3); white-space: nowrap; }
        .brand-intro-name span { display: inline-block;
          /* 扫光：平时是字色，一道亮带从右往左移过（背景位置动画） */
          background-image: linear-gradient(100deg, #fbf4e2 0%, #fbf4e2 38%, #fffdf6 46%, #f3d49a 50%, #fffdf6 54%, #fbf4e2 62%, #fbf4e2 100%);
          background-size: 320% 100%; background-position: 100% 0;
          -webkit-background-clip: text; background-clip: text; color: transparent; }
        .brand-intro-sub { font-family: var(--serif); font-size: clamp(12px, 1.3vw, 15px); letter-spacing: .62em; color: var(--gold); opacity: .85; white-space: nowrap; }
        @media (max-width: 560px) {
          .brand-intro-lockup { flex-direction: column; gap: 22px; }
          .brand-intro-word { align-items: center; }
        }
      `}</style>
    </div>
  );
}

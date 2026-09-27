import { AnimatePresence, motion } from 'framer-motion';
import { useTarotStore } from '../../store/useTarotStore';
import { D, prefersReduced, rise } from '../../lib/motion';
import { isTouchOnly } from '../../lib/device';

/**
 * 开场。背后就是 3D 的占卜室，标题和按钮浮在上半屏，把桌上那副牌让出来；文字后面压一层柔和的暗，始终看得清。
 * 按钮可以点、轻触，或用手势捏合（全站统一由 lib/liquid 处理）。
 */
export default function SplashScreen() {
  const phase = useTarotStore((s) => s.phase);
  const setPhase = useTarotStore((s) => s.setPhase);
  const isMirror = useTarotStore((s) => s.isMirror);
  const cameraState = useTarotStore((s) => s.cameraState);
  const introDone = useTarotStore((s) => s.introDone);
  const reduced = prefersReduced();

  const hint = cameraState === 'on' ? '食指移动光标 · 拇指与食指捏合即是点击' : isTouchOnly() ? '轻触开始' : '点击或轻触开始 · 允许摄像头后也可以隔空手势';

  return (
    <AnimatePresence>
      {phase === 'splash' && introDone && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-40 flex flex-col items-center justify-center px-6 pb-[26svh] text-center"
          exit={{ opacity: 0, transition: { duration: D.layout } }}
        >
          <div aria-hidden="true" className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 42% at 50% 34%, rgba(6,4,10,.6), rgba(6,4,10,.16) 70%, transparent)' }} />
          <motion.p className="eyebrow relative m-0" {...rise(reduced, 10, 0.3)}>Tarot · 塔罗占卜</motion.p>
          <motion.h1 className="title-glow relative m-0 mt-4" style={{ fontSize: 'clamp(40px, 7vw, 76px)', letterSpacing: '0.24em', paddingLeft: '0.24em', fontWeight: 400 }} {...rise(reduced, 18, 0.45)}>
            ORACULUM
          </motion.h1>
          <motion.p className="relative m-0 mt-4 font-serif-sc" style={{ fontSize: 16, letterSpacing: '0.42em', paddingLeft: '0.42em', color: 'var(--ink2)' }} {...rise(reduced, 10, 0.7)}>
            命运的抉择
          </motion.p>
          <motion.p className="relative m-0 mt-6 max-w-md font-serif-sc" style={{ fontSize: 14, lineHeight: 2, color: 'var(--ink3)' }} {...rise(reduced, 10, 0.9)}>
            凝神默问，从流动的星河里拾起五张牌，<br />由占星师为你读出它们之间的故事。
          </motion.p>

          {!isMirror && (
            <motion.div className="pointer-events-auto relative mt-10" {...rise(reduced, 12, 1.1)}>
              <button type="button" className="glass-btn is-primary is-lg" onClick={() => setPhase('question')}>
                <span className="font-display tracking-[0.2em]">BEGIN</span>
                <span className="tracking-[0.2em]">开始占卜</span>
              </button>
            </motion.div>
          )}
          <motion.p className="relative m-0 mt-8 text-[12px] tracking-[0.18em]" style={{ color: 'var(--ink3)' }} {...rise(reduced, 6, 1.35)}>
            {isMirror ? '副屏 · 正在等待主屏开始' : hint}
          </motion.p>

        </motion.div>
      )}
    </AnimatePresence>
  );
}

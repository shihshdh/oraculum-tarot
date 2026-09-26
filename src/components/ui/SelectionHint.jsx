import { AnimatePresence, motion } from 'framer-motion';
import { useTarotStore } from '../../store/useTarotStore';
import { POSITION_NAMES } from '../../data/spread';
import { D, EASE, prefersReduced, rise } from '../../lib/motion';

/**
 * 选牌阶段的进度：五个位置依次点亮，下一个要放的位置在呼吸。
 * 提示语跟着输入方式变：手势用户看到手势说明，鼠标/触屏用户看到点按说明。
 */
export default function SelectionHint() {
  const phase = useTarotStore((s) => s.phase);
  const cards = useTarotStore((s) => s.cards);
  const pickedTarotIds = useTarotStore((s) => s.pickedTarotIds);
  const cursorSource = useTarotStore((s) => s.cursorSource);
  const riverAccelerate = useTarotStore((s) => s.riverAccelerate);
  const reduced = prefersReduced();

  const picked = pickedTarotIds.length;
  const tip = riverAccelerate
    ? '牌河加速中…'
    : cursorSource === 'gesture'
      ? '食指指向一张牌，捏合拾取 · 张开手掌让牌河加速'
      : '停在一张牌上它会慢下来，单击拾取 · 长按空白处加速';

  return (
    <AnimatePresence>
      {(phase === 'selecting' || phase === 'revealing') && (
        <motion.div className="pointer-events-none fixed inset-x-0 top-[70px] z-30 flex flex-col items-center gap-3 px-4 sm:top-[82px]" {...rise(reduced, -8)}>
          <div className="glass flex items-center gap-4 rounded-full py-2 pl-5 pr-3">
            <span className="font-serif-sc text-[13px] tracking-[0.2em]" style={{ color: 'var(--ink2)' }}>
              {picked < 5 ? '拾取命运之牌' : '牌阵已成'}
            </span>
            <ol className="m-0 flex list-none gap-1.5 p-0" aria-label={`已拾取 ${picked} / 5`}>
              {cards.map((c, i) => {
                const filled = i < picked;
                const next = i === picked;
                return (
                  <li key={c.slotId} title={POSITION_NAMES[i]} className="relative grid h-[26px] w-[26px] place-items-center rounded-full text-[10px]"
                    style={{
                      color: filled ? '#2a1d06' : 'var(--ink3)',
                      background: filled ? 'linear-gradient(150deg, #fff1cf, var(--gold) 55%, var(--gold-deep))' : 'rgba(255,255,255,.05)',
                      boxShadow: filled ? 'inset 0 1px 1px rgba(255,255,255,.8), 0 0 14px rgba(233,203,139,.45)' : 'inset 0 1px 1px rgba(255,255,255,.12)',
                      border: next ? '1px solid rgba(233,203,139,.6)' : '1px solid transparent',
                      transition: `background ${D.layout}s, box-shadow ${D.layout}s`,
                    }}>
                    {POSITION_NAMES[i][0]}
                    {next && !reduced && (
                      <motion.span className="absolute inset-[-4px] rounded-full" style={{ border: '1px solid rgba(233,203,139,.5)' }} animate={{ opacity: [0.9, 0], scale: [1, 1.35] }} transition={{ duration: 1.6, repeat: Infinity, ease: EASE }} />
                    )}
                  </li>
                );
              })}
            </ol>
            <span className="min-w-[32px] text-right font-display text-[12px] tracking-[0.1em]" style={{ color: 'var(--gold)' }}>{picked}/5</span>
          </div>
          <p className="m-0 text-center text-[12px] tracking-[0.12em]" style={{ color: 'var(--ink3)', textShadow: '0 1px 8px rgba(0,0,0,.8)' }}>{tip}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

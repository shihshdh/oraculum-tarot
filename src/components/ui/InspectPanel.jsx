import { AnimatePresence, motion } from 'framer-motion';
import { useTarotStore } from '../../store/useTarotStore';
import { TAROT_DECK } from '../../data/tarotDeck';
import { POSITION_EN, POSITION_NAMES } from '../../data/spread';
import { D, EASE, prefersReduced } from '../../lib/motion';

/**
 * 端详一张牌时的说明：它在牌阵里的位置、正逆位、关键词和一句话含义。
 * 牌本身在 3D 里浮到眼前（SlotCard），这块玻璃贴在左下角，不挡住牌也不挡住右侧的解读面板。
 */
export default function InspectPanel() {
  const inspectSlot = useTarotStore((s) => s.inspectSlot);
  const phase = useTarotStore((s) => s.phase);
  const allFlipped = useTarotStore((s) => s.cards.every((c) => c.flipped));
  const cards = useTarotStore((s) => s.cards);
  const setInspectSlot = useTarotStore((s) => s.setInspectSlot);
  const reduced = prefersReduced();
  const card = inspectSlot !== null ? cards[inspectSlot] : null;
  const tarot = card?.tarotId ? TAROT_DECK.find((t) => t.id === card.tarotId) : null;

  return (
    <>
    <AnimatePresence>
      {phase === 'done' && allFlipped && inspectSlot === null && (
        <motion.div
          className="glass pointer-events-none fixed bottom-5 left-5 z-[60] rounded-full px-4 py-2 text-[12px] tracking-[0.1em]"
          style={{ color: 'var(--ink3)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 3.5, duration: D.layout } }}
          exit={{ opacity: 0, transition: { duration: D.state } }}
        >
          点一张牌，凑近看看
        </motion.div>
      )}
    </AnimatePresence>
    <AnimatePresence>
      {tarot && (
        <motion.aside
          key={inspectSlot}
          className="glass fixed bottom-5 left-5 z-[65] w-[min(340px,calc(100vw-40px))] rounded-[22px] px-5 pb-4 pt-4"
          data-no-card-click
          aria-live="polite"
          initial={{ opacity: 0, y: reduced ? 0 : 14 }}
          animate={{ opacity: 1, y: 0, transition: { duration: D.layout, ease: EASE, delay: 0.25 } }}
          exit={{ opacity: 0, y: reduced ? 0 : 8, transition: { duration: D.state } }}
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[11px] tracking-[0.3em]" style={{ color: 'var(--gold)' }}>
              <span className="mr-1.5 font-display text-[9px] tracking-[0.3em]" style={{ color: 'var(--ink3)' }}>{POSITION_EN[inspectSlot]}</span>
              {POSITION_NAMES[inspectSlot]}
            </span>
            <span className="text-[11px] tracking-[0.2em]" style={{ color: card.reversed ? 'var(--rose)' : 'var(--jade)' }}>{card.reversed ? '逆位' : '正位'}</span>
          </div>
          <h3 className="m-0 mt-2 font-serif-sc text-[24px] font-semibold tracking-[0.12em]" style={{ textShadow: '0 0 22px rgba(233,203,139,.35)' }}>{tarot.nameZh}</h3>
          <div className="mt-0.5 font-display text-[11px] tracking-[0.24em]" style={{ color: 'var(--ink3)' }}>{tarot.nameEn}</div>
          <p className="m-0 mt-3 font-serif-sc text-[14px] leading-relaxed" style={{ color: 'var(--ink2)' }}>{tarot.meaning}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(card.reversed ? tarot.keywordsReversed : tarot.keywords).map((k) => (
              <span key={k} className="rounded-full px-2.5 py-1 text-[11px] tracking-[0.08em]" style={{ color: 'var(--ink2)', background: 'rgba(233,203,139,.08)', border: '1px solid rgba(233,203,139,.18)' }}>{k}</span>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-[11px]" style={{ color: 'var(--ink3)' }}>点任意处或按 Esc 放回</span>
            <button type="button" className="glass-btn is-sm" onClick={() => setInspectSlot(null)}>放回牌阵</button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
    </>
  );
}

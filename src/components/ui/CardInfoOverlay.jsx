import { AnimatePresence, motion } from 'framer-motion';
import { useTarotStore } from '../../store/useTarotStore';
import { TAROT_DECK } from '../../data/tarotDeck';
import { POSITION_EN, POSITION_NAMES } from '../../data/spread';
import { EASE, prefersReduced } from '../../lib/motion';

/**
 * 牌名层：紧贴在 3D 卡位下方（位置由 TarotCanvas 投影得到）。先显示位置名，
 * 牌翻开后稍等片刻（配合翻牌动画），牌名浮现在位置名下面。
 */
export default function CardInfoOverlay() {
  const cards = useTarotStore((s) => s.cards);
  const phase = useTarotStore((s) => s.phase);
  const reduced = prefersReduced();
  const deckOpen = useTarotStore((s) => s.deckOpen);
  // 桌上的牌组点开、卡位描出来之后才显示位置名
  const showPositions = (phase === 'selecting' || phase === 'revealing' || phase === 'done') && deckOpen;

  return (
    <div className="pointer-events-none fixed inset-x-0 z-30" data-slot-overlay style={{ top: 'calc(var(--slot-bottom, 80vh) + 14px)' }}>
      {/* 每一列对准 3D 卡位在屏幕上的投影（--slot-x-N 由 TarotCanvas 每帧写入） */}
      <div className="relative w-full">
        {cards.map((c, i) => {
          const tarot = c.tarotId ? TAROT_DECK.find((t) => t.id === c.tarotId) : null;
          const keywords = tarot ? (c.reversed ? tarot.keywordsReversed : tarot.keywords) : [];
          return (
            <div key={c.slotId} className="absolute top-0 flex w-[19vw] max-w-[180px] -translate-x-1/2 flex-col items-center text-center" style={{ left: `var(--slot-x-${i}, ${10 + i * 20}%)` }}>
              {showPositions && (
                <div className="mb-1.5 flex items-center gap-1.5 opacity-80" style={{ animation: `slot-label-in 700ms var(--ease) ${0.9 + i * 0.12}s both` }}>
                  <span className="hidden font-display text-[9px] tracking-[0.3em] md:inline" style={{ color: 'var(--ink3)' }}>{POSITION_EN[i]}</span>
                  <span className="text-[11px] tracking-[0.3em]" style={{ color: 'var(--gold)' }}>{POSITION_NAMES[i]}</span>
                </div>
              )}
              <AnimatePresence>
                {c.flipped && tarot && (
                  <motion.div
                    className="max-w-full"
                    initial={{ opacity: 0, y: reduced ? 0 : -8 }}
                    animate={{ opacity: 1, y: 0, transition: { delay: 0.9, duration: 0.7, ease: EASE } }}
                    exit={{ opacity: 0, transition: { duration: 0.2 } }}
                  >
                    <div className="font-serif-sc text-[14px] font-semibold tracking-[0.06em] sm:text-[17px] md:text-[21px] md:tracking-[0.12em]" style={{ textShadow: '0 0 22px rgba(233,203,139,.5), 0 2px 10px rgba(0,0,0,.8)' }}>
                      {tarot.nameZh}
                    </div>
                    <div className="mt-1 text-[11px] tracking-[0.2em] md:text-[12px]" style={{ color: c.reversed ? 'var(--rose)' : 'var(--jade)' }}>
                      {c.reversed ? '逆位' : '正位'}
                    </div>
                    <div className="mt-1.5 hidden text-[11px] leading-relaxed md:block" style={{ color: 'var(--ink3)' }}>
                      {keywords.slice(0, 3).join(' · ')}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useTarotStore } from '../../store/useTarotStore';
import { loadHistory } from '../../utils/history';
import { TAROT_DECK, getCardImageUrl } from '../../data/tarotDeck';
import { POSITION_NAMES } from '../../data/spread';
import { D, EASE, prefersReduced } from '../../lib/motion';
import { isTouchOnly } from '../../lib/device';
import BrandMark from '../brand/BrandMark';
import styles from './LastReading.module.css';

/**
 * 开场左下角的「牌袋」：上一次占卜的五张牌插在一只黑丝绒牌袋里，只露出顶边。
 * 与 Pixel Reconstruction 首页「走过的地方」那只文件夹同一套结构，按占卜室的规矩改了动效：
 *   · 指针（或手势光标）进入牌袋，五张牌按牌阵顺序扇形展开，自然减速、不回弹；指到哪张，哪张抬起并写出它的位置
 *   · 点任意一张或牌袋本身，打开占卜史并选中这一次
 *   · 牌袋后面一行金色手写的 memoria，第一次出现时顺着书写方向写出来
 *   · 左下角的摄像头提示在的时候先不出来，提示收起后再浮现
 * 卡片分两层：外层 .card 是感应区，只随牌袋展开到扇形位置；里层 .face 才是看得见的牌，悬停时在感应区里抬起，
 * 感应区不动，指针就不会从牌下面“滑出去”再滑回来来回抖。开合由脚本判断：离开整个舞台 180ms 后才收起。
 * 手机上不显示（顶栏的「占卜史」就够了，开场保持干净）；没有占卜记录、副屏时也不显示。
 */
export default function LastReading() {
  const phase = useTarotStore((s) => s.phase);
  const introDone = useTarotStore((s) => s.introDone);
  const isMirror = useTarotStore((s) => s.isMirror);
  const historyOpen = useTarotStore((s) => s.historyOpen);
  const noticeShown = useTarotStore((s) => s.cameraNoticeShown);
  const reduced = prefersReduced();
  const [entry, setEntry] = useState(null);
  const [open, setOpen] = useState(false);
  const closeTimer = useRef(0);
  const scriptRef = useRef(null);

  // 回到开场、关掉占卜史（可能删了记录）时重新读一次
  useEffect(() => {
    if (phase !== 'splash' || historyOpen) return;
    setEntry(loadHistory()[0] || null);
  }, [phase, historyOpen]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const show = () => { clearTimeout(closeTimer.current); setOpen(true); };
  const hide = () => { clearTimeout(closeTimer.current); closeTimer.current = window.setTimeout(() => setOpen(false), 180); };
  const openHistory = () => useTarotStore.getState().openHistoryAt(entry.id);

  const visible = phase === 'splash' && introDone && !isMirror && !noticeShown && !isTouchOnly() && entry?.cards?.length === 5;
  const mid = 2;
  const when = entry ? new Date(entry.timestamp) : null;

  // 牌袋浮现之后，背后的 memoria 再从左到右写出来；写完不再重放
  useEffect(() => {
    const el = scriptRef.current;
    if (!visible || !el) return;
    if (reduced) { el.setAttribute('data-written', ''); return; }
    const t = setTimeout(() => el.setAttribute('data-written', ''), 2000);
    return () => clearTimeout(t);
  }, [visible, entry?.id, reduced]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={entry.id}
          className={styles.stage}
          data-open={open || undefined}
          data-no-card-click
          onPointerLeave={hide}
          onFocus={show}
          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) hide(); }}
          initial={{ opacity: 0, y: reduced ? 0 : 14 }}
          animate={{ opacity: 1, y: 0, transition: { duration: D.hero, ease: EASE, delay: 1.5 } }}
          exit={{ opacity: 0, transition: { duration: D.state } }}
        >
          <span ref={scriptRef} className={styles.script} aria-hidden="true">memoria</span>
          <div className={styles.pouch} onPointerEnter={show}>
            <span className={styles.back} aria-hidden="true"><BrandMark size={14} /></span>
            {entry.cards.map((c, i) => {
              const tarot = TAROT_DECK.find((t) => t.id === c.tarotId);
              const k = i - mid, edge = Math.abs(k);
              return (
                <button key={i} type="button" className={styles.card} onClick={openHistory}
                  aria-label={`${POSITION_NAMES[i]}：${tarot?.nameZh || ''}${c.reversed ? '（逆位）' : ''}，打开这次占卜`}
                  style={{
                    '--rest-x': `${k * 7}px`, '--rest-r': `${k * 2.5}deg`,
                    // 展开：越靠外越低、越斜
                    '--open-x': `${k * 54}px`, '--open-y': `${-96 + edge * edge * 9}px`, '--open-r': `${k * 10}deg`,
                    '--delay': `${edge * 60}ms`, zIndex: 10 - edge,
                  }}>
                  <span className={styles.face}>
                    {tarot && <img src={getCardImageUrl(tarot)} alt="" draggable={false} decoding="async" style={c.reversed ? { transform: 'rotate(180deg)' } : undefined} />}
                  </span>
                  <span className={styles.tag}>{POSITION_NAMES[i]}{c.reversed ? ' · 逆' : ''}</span>
                </button>
              );
            })}
            <button type="button" className={styles.pocket} onClick={openHistory} aria-label="打开占卜史，看上一次的解读">
              <span className={styles.label}>上一次的牌</span>
              <span className={styles.note}>{when ? `${when.getMonth() + 1} 月 ${when.getDate()} 日` : ''}{entry.question ? ` · ${entry.question}` : ''}</span>
              <span className={styles.arrow} aria-hidden="true">→</span>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

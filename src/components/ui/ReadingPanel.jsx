import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useTarotStore } from '../../store/useTarotStore';
import { useAIReading } from '../../hooks/useAIReading';
import { fetchAvailableModels, readingStream, splitMood } from '../../utils/aiClient';
import { emitCompanion } from '../../lib/companionBus';
import { TAROT_DECK, getCardImageUrl } from '../../data/tarotDeck';
import { POSITION_NAMES } from '../../data/spread';
import { D, EASE, prefersReduced } from '../../lib/motion';
import StarLoader from './StarLoader';
import ShareSheet from './ShareSheet';
import ReadingText from './ReadingText';

const MOOD_WORDS = {
  happy: '明朗', excited: '振奋', think: '深思', worry: '需留心', sad: '沉静',
  surprise: '意外', shy: '温柔', angry: '冲突', neutral: '平和',
};



/**
 * 占星师的解读面板。翻牌后从右侧滑入：
 *   水晶球凝视（loading）→ 流式书写（streaming）→ 完成后可以继续追问。
 * 右上角可以把面板收成一颗胶囊，把牌阵让出来。
 */
export default function ReadingPanel() {
  useAIReading();

  const phase = useTarotStore((s) => s.phase);
  const question = useTarotStore((s) => s.question);
  const cards = useTarotStore((s) => s.cards);
  const reading = useTarotStore((s) => s.reading);
  const readingStatus = useTarotStore((s) => s.readingStatus);
  const readingError = useTarotStore((s) => s.readingError);
  const readingMood = useTarotStore((s) => s.readingMood);
  const selectedModelId = useTarotStore((s) => s.selectedModelId);
  const isMirror = useTarotStore((s) => s.isMirror);
  const chatMessages = useTarotStore((s) => s.chatMessages);
  const chatStatus = useTarotStore((s) => s.chatStatus);
  const chatError = useTarotStore((s) => s.chatError);
  const retryReading = useTarotStore((s) => s.retryReading);

  const scrollRef = useRef(null);
  const followRef = useRef(true);
  const abortRef = useRef(null);
  const [input, setInput] = useState('');
  const [minimized, setMinimized] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const reduced = prefersReduced();

  useEffect(() => { if (phase !== 'done') { setMinimized(false); abortRef.current?.abort(); } }, [phase]);
  const docked = phase === 'done' && !minimized;
  useEffect(() => { useTarotStore.getState().setPanelDocked(docked); }, [docked]);
  // 跟随最新内容滚动，除非用户往上翻着在读
  useEffect(() => {
    const el = scrollRef.current;
    if (el && followRef.current) el.scrollTop = el.scrollHeight;
  }, [reading, chatMessages, chatStatus, readingStatus]);

  const canChat = readingStatus === 'done' && !isMirror && chatStatus !== 'streaming';

  const send = async (preset) => {
    const text = (preset ?? input).trim();
    if (!text || !canChat) return;
    setInput('');
    followRef.current = true;
    const s = useTarotStore.getState();
    const history = s.chatMessages.filter((m) => m.content).map(({ role, content }) => ({ role, content }));
    s.addChatMessage({ role: 'user', content: text });
    s.addChatMessage({ role: 'assistant', content: '', streaming: true });
    s.setChatStatus('streaming');
    emitCompanion({ type: 'followup', state: 'thinking' });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const models = await fetchAvailableModels();
      if (!models.length) throw new Error('AI 服务已关闭');
      const modelId = models.some((m) => m.id === selectedModelId) ? selectedModelId : models[0].id;
      let raw = '';
      let mood = null;
      for await (const chunk of readingStream({ modelId, question: s.question, cards: s.cards, reading: s.reading, messages: [...history, { role: 'user', content: text }] }, { signal: controller.signal })) {
        raw += chunk;
        const parsed = splitMood(raw);
        mood = parsed.mood || mood;
        useTarotStore.getState().updateLastChat({ content: parsed.text });
      }
      useTarotStore.getState().updateLastChat({ content: splitMood(raw).text.trim() || '（星星沉默了，换个问法试试？）', streaming: false });
      useTarotStore.getState().setChatStatus('idle');
      emitCompanion({ type: 'followup', state: 'done', mood: mood || 'neutral' });
    } catch (err) {
      if (err.name === 'AbortError') return;
      const st = useTarotStore.getState();
      st.updateLastChat({ streaming: false });
      if (!st.chatMessages[st.chatMessages.length - 1]?.content) st.updateLastChat({ content: '……' });
      st.setChatError(err.message || '追问失败');
      emitCompanion({ type: 'reading', state: 'error' });
    }
  };

  const visible = phase === 'done';
  const waiting = readingStatus === 'idle' || readingStatus === 'loading';
  const status =
    readingStatus === 'error' ? { text: '解读失败', tone: 'var(--rose)' }
      : waiting ? { text: '凝视水晶球…', tone: 'var(--lilac)', loader: true }
        : readingStatus === 'streaming' ? { text: '正在书写', tone: 'var(--gold)', loader: true }
          : chatStatus === 'streaming' ? { text: '回应中', tone: 'var(--gold)', loader: true }
            : { text: `牌面气氛 · ${MOOD_WORDS[readingMood] || '平和'}`, tone: 'var(--ink3)' };

  return (
    <>
      <AnimatePresence>
        {visible && minimized && (
          <motion.button
            key="pill"
            type="button"
            className="glass-btn is-lg fixed right-4 top-[70px] z-[55] sm:top-[78px]"
            data-no-card-click
            onClick={() => setMinimized(false)}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: D.layout, ease: EASE } }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: D.state } }}
          >
            <span style={{ color: 'var(--gold)' }}>✦</span> 展开占星师的解读
            {status.loader && <StarLoader size={12} style={{ color: status.tone }} />}
          </motion.button>
        )}
        {visible && !minimized && (
          <motion.aside
            key="panel"
            className="glass glass-dense fixed z-[55] flex flex-col overflow-hidden rounded-[26px] inset-x-3 bottom-3 top-[45svh] md:inset-x-auto md:bottom-4 md:right-4 md:top-[76px] md:w-[440px]"
            data-reading-panel
            data-companion-avoid
            data-no-card-click
            aria-label="占星师的解读"
            initial={{ opacity: 0, x: reduced ? 0 : 48 }}
            animate={{ opacity: 1, x: 0, transition: { duration: D.hero, ease: EASE, delay: 0.35 } }}
            exit={{ opacity: 0, x: reduced ? 0 : 32, transition: { duration: D.state } }}
          >
            {/* 头部 */}
            <header className="flex items-center gap-3 px-5 pb-3.5 pt-4" style={{ borderBottom: '1px solid var(--line)' }}>
              <span className="grid h-9 w-9 flex-none place-items-center rounded-full" style={{ color: 'var(--gold)', background: 'radial-gradient(circle at 35% 30%, rgba(255,246,225,.3), rgba(185,166,255,.12) 60%, transparent)', boxShadow: 'inset 0 1px 1px var(--surface-rim), 0 0 18px rgba(233,203,139,.18)' }}>✦</span>
              <div className="min-w-0 flex-1">
                <h2 className="m-0 font-serif-sc text-[15px] font-semibold tracking-[0.14em]">占星师的解读</h2>
                <p className="m-0 mt-0.5 flex items-center gap-1.5 text-[11px] tracking-[0.08em]" style={{ color: status.tone }}>
                  {status.loader && <StarLoader size={10} />}
                  {status.text}
                </p>
              </div>
              {!isMirror && readingStatus === 'done' && (
                <button type="button" className="glass-btn is-sm" onClick={() => setShareOpen(true)}>分享</button>
              )}
              <button type="button" className="glass-btn is-icon is-sm is-quiet" onClick={() => setMinimized(true)} aria-label="收起解读面板" title="收起，看看牌阵">
                <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" style={{ width: 12, height: 12 }}><path d="M2.5 6h7" /></svg>
              </button>
            </header>

            <div ref={scrollRef} className="scroll-soft flex-1 px-5 pb-4 pt-4" onScroll={(e) => { const el = e.currentTarget; followRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 32; }}>
              {/* 问题与牌阵 */}
              <div className="mb-4">
                <p className="m-0 font-serif-sc text-[13px] leading-relaxed" style={{ color: 'var(--ink2)' }}>
                  <span style={{ color: 'var(--ink3)' }}>所问 · </span>{question || '（未明确提问，看看当下的整体指引）'}
                </p>
                <ol className="m-0 mt-3 grid list-none grid-cols-5 gap-2 p-0">
                  {cards.map((c, i) => {
                    const tarot = TAROT_DECK.find((t) => t.id === c.tarotId);
                    return (
                      <li key={c.slotId} className="min-w-0 text-center">
                        <div className="overflow-hidden rounded-md" style={{ aspectRatio: '1 / 1.7', boxShadow: '0 4px 12px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,246,225,.15)' }}>
                          {tarot && <img src={getCardImageUrl(tarot)} alt={`${POSITION_NAMES[i]}：${tarot.nameZh}${c.reversed ? '（逆位）' : ''}`} className="block h-full w-full object-cover" style={{ transform: c.reversed ? 'rotate(180deg)' : undefined }} draggable={false} />}
                        </div>
                        <div className="mt-1 text-[10px] tracking-[0.1em]" style={{ color: 'var(--gold)' }}>{POSITION_NAMES[i]}</div>
                        <div className="truncate text-[11px]" style={{ color: 'var(--ink2)' }}>{tarot?.nameZh}{c.reversed ? '·逆' : ''}</div>
                      </li>
                    );
                  })}
                </ol>
              </div>
              <div className="hairline mb-4" />

              {/* 解读 */}
              {readingStatus === 'error' ? (
                <div role="alert" className="rounded-2xl p-4 text-[13px] leading-relaxed" style={{ background: 'rgba(255,156,143,.07)', border: '1px solid rgba(255,156,143,.28)' }}>
                  <p className="m-0 font-semibold" style={{ color: 'var(--rose)' }}>解读失败</p>
                  <p className="m-0 mt-1.5" style={{ color: 'var(--ink2)' }}>{readingError}</p>
                  {!isMirror && <button type="button" className="glass-btn is-sm mt-3" onClick={retryReading}>重新解读</button>}
                </div>
              ) : waiting ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <StarLoader size={22} style={{ color: 'var(--gold)' }} />
                  <p className="m-0 font-serif-sc text-[13px] tracking-[0.2em]" style={{ color: 'var(--ink3)' }}>占星师正在凝视水晶球</p>
                </div>
              ) : (
                <ReadingText text={reading} streaming={readingStatus === 'streaming'} />
              )}

              {/* 追问 */}
              {chatMessages.length > 0 && <div className="hairline my-5" />}
              <div className="flex flex-col gap-3">
                {chatMessages.map((m, i) => (
                  m.role === 'user' ? (
                    <p key={i} className="m-0 max-w-[86%] self-end whitespace-pre-wrap break-words rounded-[16px] rounded-br-[6px] px-3.5 py-2.5 text-[13px] leading-relaxed" style={{ background: 'linear-gradient(150deg, rgba(233,203,139,.3), rgba(184,145,74,.18))', color: '#fff9ea', boxShadow: 'inset 0 1px 0 rgba(255,246,220,.35)' }}>
                      {m.content}
                    </p>
                  ) : (
                    <div key={i} className="max-w-[94%] self-start rounded-[16px] rounded-bl-[6px] px-3.5 py-2.5" style={{ background: 'rgba(255,255,255,.055)', boxShadow: 'inset 0 1px 0 rgba(255,249,232,.08)' }}>
                      {m.content ? <ReadingText text={m.content} streaming={m.streaming} /> : <StarLoader size={12} style={{ color: 'var(--gold)' }} />}
                    </div>
                  )
                ))}
                {chatError && <p role="alert" className="m-0 text-xs" style={{ color: 'var(--rose)' }}>{chatError}</p>}
              </div>
            </div>

            {/* 追问输入 */}
            {!isMirror && readingStatus === 'done' && (
              <div className="px-3 pb-3 pt-2.5" style={{ borderTop: '1px solid var(--line)' }}>
                {chatMessages.length === 0 && (
                  <div className="mb-2.5 flex gap-1.5 overflow-x-auto px-1" style={{ scrollbarWidth: 'none' }}>
                    {['哪张牌最关键？', '最需要注意什么？', '给我一个今天就能做的小行动'].map((q) => (
                      <button key={q} type="button" className="glass-btn is-sm flex-none" style={{ color: 'var(--ink2)' }} onClick={() => send(q)}>{q}</button>
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-2 rounded-[18px] p-1.5 pl-3.5" style={{ background: 'rgba(6,4,16,.45)', border: '1px solid var(--line)' }}>
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    placeholder={canChat ? '继续问占星师 · Shift+Enter 换行' : '占星师回应中…'}
                    disabled={!canChat}
                    rows={1}
                    maxLength={1200}
                    aria-label="追问占星师"
                    className="max-h-[120px] min-h-[36px] flex-1 resize-none bg-transparent py-2 text-[13.5px] leading-relaxed outline-none"
                    style={{ color: 'var(--ink)', fieldSizing: 'content' }}
                  />
                  <button type="button" className="glass-btn is-primary is-icon" onClick={() => send()} disabled={!canChat || !input.trim()} aria-label="发送">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </button>
                </div>
              </div>
            )}
          </motion.aside>
        )}
      </AnimatePresence>
      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} />
    </>
  );
}

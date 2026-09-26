import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { useTarotStore } from '../../store/useTarotStore';
import { D, pop, prefersReduced, rise } from '../../lib/motion';
import ModelPicker from './ModelPicker';

const SAMPLE_QUESTIONS = ['我最近的事业方向如何？', '这段感情会走向何处？', '我该如何面对当下的困境？', '近期最需要关注的课题是什么？'];

export default function QuestionScreen() {
  const phase = useTarotStore((s) => s.phase);
  const setPhase = useTarotStore((s) => s.setPhase);
  const question = useTarotStore((s) => s.question);
  const setQuestion = useTarotStore((s) => s.setQuestion);
  const isMirror = useTarotStore((s) => s.isMirror);
  const textareaRef = useRef(null);
  const reduced = prefersReduced();

  useEffect(() => {
    if (phase !== 'question' || isMirror) return;
    const t = setTimeout(() => textareaRef.current?.focus(), 450);
    return () => clearTimeout(t);
  }, [phase, isMirror]);

  const confirm = () => !isMirror && setPhase('selecting');

  return (
    <AnimatePresence>
      {phase === 'question' && (
        <motion.div
          // 手机上内容比可见区域高：外层可以滑动，内层放得下时居中；底部留出系统手势条的安全区
          className="question-scroll fixed inset-0 z-40 overflow-y-auto overscroll-contain"
          data-no-card-click
          exit={{ opacity: 0, transition: { duration: D.layout } }}
        >
          <div className="pointer-events-none flex min-h-full flex-col items-center justify-center px-5 pb-[max(28px,env(safe-area-inset-bottom))] pt-[76px] sm:pt-16">
          <motion.p className="eyebrow m-0" {...rise(reduced, 10, 0.05)}>Ask the stars</motion.p>
          <motion.h2 className="m-0 mt-3 text-center font-serif-sc" style={{ fontSize: 'clamp(22px, 3.4vw, 30px)', letterSpacing: '0.2em', fontWeight: 600 }} {...rise(reduced, 12, 0.15)}>
            在心中写下你的疑问
          </motion.h2>
          <motion.p className="m-0 mt-2.5 text-center text-[13px] tracking-[0.12em]" style={{ color: 'var(--ink3)' }} {...rise(reduced, 8, 0.25)}>
            问得越具体，牌越能回应你。也可以什么都不写，随心抽牌。
          </motion.p>

          <motion.div className="glass pointer-events-auto mt-6 w-full max-w-2xl sm:mt-8 rounded-[26px] p-2" data-no-card-click {...pop(reduced)} transition={{ delay: 0.3 }}>
            <textarea
              ref={textareaRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  confirm();
                }
              }}
              readOnly={isMirror}
              placeholder={'此刻你心中在寻求什么答案？\n例如：我该接受这个工作机会吗？'}
              rows={4}
              maxLength={200}
              aria-label="你的问题"
              className="block w-full resize-none bg-transparent px-5 pb-2 pt-4 font-serif-sc outline-none"
              style={{ color: 'var(--ink)', fontSize: 15, lineHeight: 1.9, letterSpacing: '0.04em' }}
            />
            <div className="flex items-center justify-between px-5 pb-3 text-[11px] tracking-[0.08em]" style={{ color: 'var(--ink3)' }}>
              <span>Ctrl / ⌘ + Enter 进入牌阵</span>
              <span>{question.length} / 200</span>
            </div>
          </motion.div>

          {!isMirror && (
            <motion.div className="pointer-events-auto mt-4 flex max-w-2xl flex-wrap justify-center gap-2" data-no-card-click {...rise(reduced, 8, 0.45)}>
              {SAMPLE_QUESTIONS.map((q) => (
                <button key={q} type="button" className="glass-btn is-sm" aria-pressed={question === q} style={question === q ? { borderColor: 'rgba(233,203,139,.5)', color: '#fff9ea' } : { color: 'var(--ink2)' }} onClick={() => setQuestion(q)}>
                  {q}
                </button>
              ))}
            </motion.div>
          )}

          {!isMirror && (
            <motion.div className="pointer-events-auto" data-no-card-click {...rise(reduced, 8, 0.55)}>
              <ModelPicker />
            </motion.div>
          )}

          {!isMirror && (
            <motion.div className="pointer-events-auto mt-6 flex flex-wrap justify-center gap-3 sm:mt-9" data-no-card-click {...rise(reduced, 10, 0.65)}>
              <button type="button" className="glass-btn is-lg" style={{ color: 'var(--ink2)' }} onClick={() => { setQuestion(''); confirm(); }}>
                不写问题 · 随心抽牌
              </button>
              <button type="button" className="glass-btn is-primary is-lg" onClick={confirm}>
                <span className="font-display tracking-[0.18em]">DRAW</span>
                <span className="tracking-[0.14em]">进入牌阵</span>
              </button>
            </motion.div>
          )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

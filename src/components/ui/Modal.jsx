import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useId, useRef } from 'react';
import { D, EASE, pop, prefersReduced } from '../../lib/motion';

// 叠在一起的对话框：Esc 只关最上面那个
const stack = [];

/**
 * 玻璃对话框：遮罩淡入、面板轻微放大浮现；Esc / 点遮罩关闭；打开时把焦点放进来、关闭后还回去。
 */
export default function Modal({ open, onClose, title, subtitle, children, width = 440, labelledBy, className = '' }) {
  const panelRef = useRef(null);
  const reduced = prefersReduced();
  const autoId = useId();
  const titleId = labelledBy || autoId;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const token = {};
    stack.push(token);
    const onKey = (e) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === token) {
        e.stopPropagation();
        closeRef.current?.();
      }
    };
    window.addEventListener('keydown', onKey);
    requestAnimationFrame(() => {
      const el = panelRef.current?.querySelector('[autofocus], input, textarea, button:not([data-modal-close])');
      el?.focus();
    });
    return () => {
      window.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(token), 1);
      previous?.focus?.();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[900] flex items-center justify-center p-4"
          data-no-card-click
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: D.state } }}
          exit={{ opacity: 0, transition: { duration: D.state } }}
          style={{ background: 'rgba(3, 2, 10, 0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
          onPointerDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
        >
          <motion.section
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            className={`glass glass-dense w-full rounded-[26px] max-h-[88svh] flex flex-col overflow-hidden ${className}`}
            style={{ maxWidth: width }}
            {...pop(reduced)}
            transition={{ duration: D.layout, ease: EASE }}
          >
            {title && (
              <header className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
                <div className="min-w-0">
                  <h2 id={titleId} className="m-0 font-serif-sc text-[18px] font-semibold tracking-[0.08em]">{title}</h2>
                  {subtitle && <p className="m-0 mt-1.5 text-[12px] leading-relaxed" style={{ color: 'var(--ink3)' }}>{subtitle}</p>}
                </div>
                <button type="button" data-modal-close className="glass-btn is-icon is-sm is-quiet" onClick={onClose} aria-label="关闭">
                  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" style={{ width: 12, height: 12 }}><path d="m2.5 2.5 7 7m0-7-7 7" /></svg>
                </button>
              </header>
            )}
            {children}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

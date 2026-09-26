import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useTarotStore } from '../../store/useTarotStore';
import { D, EASE } from '../../lib/motion';

const TEXT = {
  denied: '摄像头没有授权，手势暂时用不了——可以继续用鼠标或触屏占卜。',
  error: '这个浏览器开不了摄像头（需要 HTTPS 或 localhost），手势暂时用不了——鼠标和触屏照常可用。',
};

/** 摄像头不可用时的一条提示。role="alert"：占星师看到会主动问要不要帮忙。 */
export default function CameraNotice() {
  const cameraState = useTarotStore((s) => s.cameraState);
  const [dismissed, setDismissed] = useState(false);
  const text = TEXT[cameraState];

  useEffect(() => {
    if (!text) return;
    setDismissed(false);
    const t = setTimeout(() => setDismissed(true), 12000);
    return () => clearTimeout(t);
  }, [text]);

  return (
    <AnimatePresence>
      {text && !dismissed && (
        <motion.div
          role="alert"
          className="glass fixed bottom-4 left-4 z-[80] flex max-w-[min(420px,calc(100vw-32px))] items-start gap-3 rounded-2xl py-3 pl-4 pr-2 text-[12.5px] leading-relaxed"
          data-no-card-click
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0, transition: { duration: D.layout, ease: EASE } }}
          exit={{ opacity: 0, y: 8, transition: { duration: D.state } }}
        >
          <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full" style={{ background: 'var(--rose)' }} />
          <span style={{ color: 'var(--ink2)' }}>{text}</span>
          <button type="button" className="glass-btn is-icon is-sm is-quiet flex-none" onClick={() => setDismissed(true)} aria-label="知道了">✕</button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

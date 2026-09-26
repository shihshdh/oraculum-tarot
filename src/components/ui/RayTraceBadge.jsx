import { AnimatePresence, motion } from 'framer-motion';
import { useTarotStore } from '../../store/useTarotStore';
import { D, EASE } from '../../lib/motion';

const LABEL = { building: '正在搭建光追场景…', compiling: '正在编译光追着色器…', tracing: '光线追踪中', done: '光线追踪完成' };

/** 客户端版：牌阵光追的进度（累积采样数，越多越干净） */
export default function RayTraceBadge() {
  const { status, samples } = useTarotStore((s) => s.rayTrace);
  const show = status !== 'off';
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="glass pointer-events-none fixed left-4 top-[74px] z-[60] flex items-center gap-2.5 rounded-full py-2 pl-3 pr-4 text-[12px] tracking-[0.08em] sm:top-[88px]"
          style={{ color: 'var(--ink2)' }}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0, transition: { duration: D.layout, ease: EASE } }}
          exit={{ opacity: 0, transition: { duration: D.state } }}
          aria-live="polite"
        >
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: status === 'done' ? '#8fe3b0' : '#f3d49a', boxShadow: '0 0 10px currentColor' }} />
          <span>{LABEL[status]}</span>
          {(status === 'tracing' || status === 'done') && <span className="font-display tabular-nums" style={{ color: 'var(--ink3)' }}>{samples} spp</span>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

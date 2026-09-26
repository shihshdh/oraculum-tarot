import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { useTarotStore } from '../../store/useTarotStore';
import { D, EASE } from '../../lib/motion';
import Seg from './Seg';
import AdminLogin from './AdminLogin';
import AISettings from './AISettings';
import { confirmAsync } from './Confirm';
import { adminLogout } from '../../utils/adminAuth';
import BrandMark from '../brand/BrandMark';

const STEPS = [
  { value: 'splash', label: '开场' },
  { value: 'question', label: '默问' },
  { value: 'selecting', label: '选牌' },
  { value: 'done', label: '解读' },
];

const Icon = {
  history: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></svg>,
  mirror: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="13" height="10" rx="2" /><path d="M8 18h11a2 2 0 0 0 2-2V9" /></svg>,
  reset: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>,
  gear: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>,
  lock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>,
  hand: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v5" /><path d="M14 10V4a2 2 0 0 0-4 0v6" /><path d="M10 10.5V6a2 2 0 0 0-4 0v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-5.9-2.3l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15" /></svg>,
};

const CAMERA = {
  starting: { label: '手势启动中', tone: 'var(--ink3)' },
  on: { label: '手势已开启', tone: 'var(--jade)' },
  denied: { label: '手势未授权', tone: 'var(--rose)' },
  error: { label: '手势不可用', tone: 'var(--rose)' },
};

export default function TopBar() {
  const phase = useTarotStore((s) => s.phase);
  const isMirror = useTarotStore((s) => s.isMirror);
  const isAdmin = useTarotStore((s) => s.isAdmin);
  const setIsAdmin = useTarotStore((s) => s.setIsAdmin);
  const cameraState = useTarotStore((s) => s.cameraState);
  const reset = useTarotStore((s) => s.reset);
  const setHistoryOpen = useTarotStore((s) => s.setHistoryOpen);
  const [loginOpen, setLoginOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const step = phase === 'revealing' ? 'selecting' : phase;
  const camera = CAMERA[cameraState];

  const openMirror = () => {
    const url = `${window.location.origin}${window.location.pathname}?role=mirror`;
    window.open(url, '_blank', 'width=1280,height=800');
  };
  const restart = async () => {
    if (phase === 'selecting' && !(await confirmAsync({ title: '重新开始？', body: '已经拾取的牌会放回牌河。', confirmLabel: '重新开始' }))) return;
    reset();
  };
  const logout = async () => {
    if (!(await confirmAsync({ title: '退出管理员模式？', confirmLabel: '退出', danger: true }))) return;
    adminLogout();
    setIsAdmin(false);
  };

  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex items-start justify-between gap-3 px-3 pt-3 sm:px-5 sm:pt-4" data-no-card-click>
        {/* 左：品牌 + 屏幕角色 */}
        <div className="pointer-events-auto flex items-center gap-2">
          <div className="glass flex h-[42px] items-center gap-2 rounded-full pl-2.5 pr-4">
            <span data-brand-mark className="inline-flex" style={{ color: 'var(--gold)', filter: 'drop-shadow(0 0 8px rgba(233,203,139,.45))' }}><BrandMark size={26} /></span>
            <span className="font-display text-[13px] tracking-[0.28em]">ORACULUM</span>
            <span className="hidden text-[11px] tracking-[0.1em] sm:inline" style={{ color: 'var(--ink3)' }}>
              {isMirror ? '副屏 · 镜像' : '主屏'}
            </span>
          </div>
          {!isMirror && (
            <>
              <button type="button" className="glass-btn is-icon hidden sm:inline-flex" style={{ minHeight: 42, width: 42 }} onClick={openMirror} aria-label="打开副屏" title="打开副屏（同一浏览器的镜像窗口）">
                {Icon.mirror}
              </button>
              {(phase === 'splash' || phase === 'done') && (
                <button type="button" className="glass-btn" style={{ minHeight: 42 }} onClick={() => setHistoryOpen(true)} aria-label="占卜史">
                  {Icon.history}
                  <span className="hidden sm:inline">占卜史</span>
                </button>
              )}
            </>
          )}
        </div>

        {/* 中：阶段进度，一滴玻璃跟着走 */}
        <div className="pointer-events-auto absolute left-1/2 top-3 hidden -translate-x-1/2 sm:top-4 lg:block">
          <Seg items={STEPS} value={step} readOnly ariaLabel="占卜进度" />
        </div>

        {/* 右：手势状态、重来、管理 */}
        {!isMirror && (
          <div className="pointer-events-auto flex items-center gap-2">
            {camera && (
              <span className="glass hidden h-[42px] items-center gap-2 rounded-full px-3.5 text-[12px] md:inline-flex" title={cameraState === 'denied' ? '浏览器没有给摄像头权限，可以继续用鼠标或触屏' : undefined}>
                <span style={{ width: 16, height: 16, color: camera.tone, display: 'inline-flex' }}>{Icon.hand}</span>
                <span style={{ color: 'var(--ink2)' }}>{camera.label}</span>
              </span>
            )}
            <AnimatePresence>
              {(phase === 'done' || phase === 'selecting') && (
                <motion.button
                  type="button"
                  className="glass-btn whitespace-nowrap"
                  style={{ minHeight: 42 }}
                  onClick={restart}
                  aria-label={phase === 'done' ? '重新占卜' : '重来'}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: D.layout, ease: EASE } }}
                  exit={{ opacity: 0, y: -6, transition: { duration: D.state } }}
                >
                  {Icon.reset}
                  <span className="hidden sm:inline">{phase === 'done' ? '重新占卜' : '重来'}</span>
                </motion.button>
              )}
            </AnimatePresence>
            {isAdmin ? (
              <>
                <button type="button" className="glass-btn is-icon" style={{ minHeight: 42, width: 42, color: 'var(--gold)' }} onClick={() => setSettingsOpen(true)} aria-label="AI 解读设置" title="AI 解读设置（管理员）">
                  {Icon.gear}
                </button>
                <button type="button" className="glass-btn is-sm is-quiet" onClick={logout} title="退出管理员模式">退出管理</button>
              </>
            ) : (
              <button type="button" className="glass-btn is-icon is-quiet" style={{ minHeight: 42, width: 42, opacity: 0.55 }} onClick={() => setLoginOpen(true)} aria-label="管理员登录" title="管理员">
                {Icon.lock}
              </button>
            )}
          </div>
        )}
      </header>

      {!isMirror && (
        <>
          <AdminLogin open={loginOpen} onOpenChange={setLoginOpen} />
          <AISettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </>
      )}
    </>
  );
}

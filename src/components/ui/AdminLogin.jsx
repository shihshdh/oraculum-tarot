import { useEffect, useState } from 'react';
import Modal from './Modal';
import { isAdminLoggedIn, tryAdminLogin } from '../../utils/adminAuth';
import { useTarotStore } from '../../store/useTarotStore';

/**
 * 管理员登录（密码只在服务端校验）。
 * 入口：右上角锁形按钮，或访问 ?admin=1 自动弹出。
 */
export default function AdminLogin({ open, onOpenChange }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isAdmin = useTarotStore((s) => s.isAdmin);
  const setIsAdmin = useTarotStore((s) => s.setIsAdmin);

  useEffect(() => {
    if (isAdminLoggedIn()) setIsAdmin(true);
    else if (new URLSearchParams(window.location.search).get('admin') === '1') onOpenChange(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    onOpenChange(false);
    setPassword('');
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    const result = await tryAdminLogin(password);
    setBusy(false);
    if (result.ok) {
      setIsAdmin(true);
      close();
    } else setError(result.message);
  };

  return (
    <Modal open={open && !isAdmin} onClose={close} title="管理员登录" subtitle="登录后可以在右上角配置 AI 解读服务。" width={380}>
      <form onSubmit={submit} className="px-6 pb-6">
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(''); }}
          placeholder="管理员密码"
          aria-label="管理员密码"
          className="glass-input px-4 py-3 text-sm"
        />
        {error && <p role="alert" className="m-0 mt-3 text-xs" style={{ color: 'var(--rose)' }}>{error}</p>}
        <div className="mt-5 flex gap-2.5">
          <button type="button" className="glass-btn flex-1" onClick={close}>取消</button>
          <button type="submit" className="glass-btn is-primary flex-1" disabled={!password || busy}>{busy ? '验证中…' : '登录'}</button>
        </div>
      </form>
    </Modal>
  );
}

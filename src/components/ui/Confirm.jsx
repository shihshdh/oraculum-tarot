import { create } from 'zustand';
import Modal from './Modal';

// 替代 window.confirm / alert：浏览器原生弹窗会卡住手势识别，也和玻璃界面格格不入。
const useConfirmStore = create((set) => ({ request: null, set }));

/** await confirmAsync({ title, body, confirmLabel, danger }) → true / false */
export function confirmAsync(options) {
  return new Promise((resolve) => {
    useConfirmStore.getState().request?.resolve(false);
    useConfirmStore.setState({ request: { ...options, resolve } });
  });
}

/** 只有"知道了"按钮的提示 */
export const notify = (title, body) => confirmAsync({ title, body, confirmLabel: '知道了', alertOnly: true });

export default function ConfirmHost() {
  const request = useConfirmStore((s) => s.request);
  const close = (value) => {
    request?.resolve(value);
    useConfirmStore.setState({ request: null });
  };
  return (
    <Modal open={!!request} onClose={() => close(false)} title={request?.title} subtitle={request?.body} width={380}>
      <div className="flex gap-2.5 px-6 pb-6 pt-1">
        {!request?.alertOnly && (
          <button type="button" className="glass-btn flex-1" onClick={() => close(false)}>
            {request?.cancelLabel || '取消'}
          </button>
        )}
        <button type="button" autoFocus className={`glass-btn flex-1 ${request?.danger ? 'is-danger' : 'is-primary'}`} onClick={() => close(true)}>
          {request?.confirmLabel || '确认'}
        </button>
      </div>
    </Modal>
  );
}

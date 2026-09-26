// 页面 → 占星师 的信号。页面只"广播发生了什么"，要不要说话、做什么动作由她自己决定。
//   { type: 'reading', state: 'thinking' | 'speaking' | 'done' | 'error', mood?, text? }
//   { type: 'moment', kind: 'picked' | 'revealed' | 'reset', count? }

const listeners = new Set();

export function emitCompanion(signal) {
  for (const fn of listeners) {
    try {
      fn(signal);
    } catch (e) {
      console.warn('[占星师] 信号处理失败', e);
    }
  }
}

export function onCompanion(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

import { useEffect, useState } from 'react';
import Modal from './Modal';
import { confirmAsync, notify } from './Confirm';
import { PROVIDER_META, clearAllConfig, fetchAIStatus, fetchConfigStatus, saveConfig } from '../../utils/aiClient';

/**
 * AI 配置（仅管理员）。配置存服务端，所有设备共用；每家可以单独开关。
 * 豆包接入点可以标记"能看图"，占星师看截图/牌阵时会用到。
 */
export default function AISettings({ open, onClose }) {
  const [status, setStatus] = useState(null);
  const [models, setModels] = useState([]);
  const [editing, setEditing] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [endpoints, setEndpoints] = useState([]);
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hint, setHint] = useState('');

  const reload = async () => {
    const [s, m] = await Promise.all([fetchConfigStatus(), fetchAIStatus({ fresh: true })]);
    setStatus(s);
    setModels(m.models || []);
  };
  useEffect(() => {
    if (open) reload();
    else setEditing(null);
  }, [open]);

  const startEdit = (key) => {
    const s = status?.[key] || {};
    setEditing(key);
    setApiKey('');
    setEndpoints(key === 'doubao' ? (s.endpoints || []).map((e) => ({ ...e })) : []);
    setEnabled(s.enabled !== false);
    setHint('');
  };

  const handleSave = async () => {
    const meta = PROVIDER_META[editing];
    const payload = { enabled };
    if (apiKey.trim()) payload.apiKey = apiKey.trim();
    else if (!status?.[editing]?.configured) return setHint('首次配置必须填写 API Key');
    if (meta.kind === 'endpoints') {
      const valid = endpoints.filter((e) => e.id.trim());
      if (!valid.length) return setHint('至少配置一个推理接入点');
      payload.endpoints = valid.map((e) => ({ id: e.id.trim(), label: (e.label || '').trim() || e.id.trim(), vision: !!e.vision }));
    }
    setSaving(true);
    setHint('');
    try {
      await saveConfig({ [editing]: payload });
      await reload();
      setHint('✓ 已保存');
      setTimeout(() => { setEditing(null); setHint(''); }, 700);
    } catch (err) {
      setHint('保存失败：' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const run = async (fn) => {
    try {
      await fn();
      await reload();
    } catch (err) {
      notify('操作失败', err.message);
    }
  };
  const toggle = (key, current) => run(() => saveConfig({ [key]: { enabled: !current } }));
  const clearKey = async (key) => {
    if (await confirmAsync({ title: `清除 ${PROVIDER_META[key].name} 的配置？`, confirmLabel: '清除', danger: true })) run(() => saveConfig({ [key]: { apiKey: '' } }));
  };
  const clearAll = async () => {
    if (await confirmAsync({ title: '清空所有 AI 配置？', body: '所有设备的解读和占星师对话都会停止。', confirmLabel: '清空', danger: true })) run(clearAllConfig);
  };
  const setAssistModel = (id) => run(() => saveConfig({}, { assistModel: id }));

  const meta = editing && PROVIDER_META[editing];

  return (
    <Modal open={open} onClose={() => (editing ? setEditing(null) : onClose())} title={editing ? `配置 ${meta.name}` : 'AI 解读设置'} subtitle={editing ? meta.description : '配置保存在服务端，所有设备共用；每家可以单独开关。'} width={560}>
      <div className="scroll-soft px-6 pb-6">
        {!editing && !status && <p className="text-sm" style={{ color: 'var(--ink3)' }}>正在读取配置…</p>}

        {!editing && status && (
          <>
            <div className="flex flex-col gap-2.5">
              {Object.entries(PROVIDER_META).map(([key, m]) => {
                const s = status[key] || {};
                const tone = s.configured ? (s.enabled ? 'var(--jade)' : 'var(--ink3)') : 'var(--line2)';
                return (
                  <div key={key} className="glass rounded-2xl p-3.5" style={{ opacity: s.configured && !s.enabled ? 0.7 : 1 }}>
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 flex-none place-items-center rounded-xl font-serif-sc text-[15px]" style={{ color: 'var(--gold)', background: 'rgba(233,203,139,0.08)', boxShadow: 'inset 0 1px 1px var(--surface-rim)' }}>{m.mark}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          {m.name}
                          <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: tone }}>
                            <span style={{ width: 6, height: 6, borderRadius: 9, background: tone }} />
                            {s.configured ? (s.enabled ? '已启用' : '已关闭') : '未配置'}
                          </span>
                          {key === 'doubao' && s.endpoints?.length > 0 && <span className="text-[11px]" style={{ color: 'var(--ink3)' }}>{s.endpoints.length} 个接入点</span>}
                        </div>
                        <div className="mt-0.5 text-xs" style={{ color: 'var(--ink3)' }}>{m.description}</div>
                      </div>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {s.configured && <button type="button" className="glass-btn is-sm" onClick={() => toggle(key, s.enabled)}>{s.enabled ? '关闭' : '启用'}</button>}
                        <button type="button" className="glass-btn is-sm is-primary" onClick={() => startEdit(key)}>{s.configured ? '修改' : '配置'}</button>
                        {s.configured && <button type="button" className="glass-btn is-sm is-danger" onClick={() => clearKey(key)}>清除</button>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {models.length > 0 && (
              <label className="mt-5 block">
                <span className="mb-2 block text-xs tracking-[0.08em]" style={{ color: 'var(--ink2)' }}>占星师聊天用的模型</span>
                <select className="glass-input px-3 py-2.5 text-sm" value={status.assistModel || ''} onChange={(e) => setAssistModel(e.target.value)}>
                  <option value="">自动（优先选快速模型）</option>
                  {models.map((m) => <option key={m.id} value={m.id}>{m.label}{m.vision ? ' · 能看图' : ''}</option>)}
                </select>
                <span className="mt-1.5 block text-[11px]" style={{ color: 'var(--ink3)' }}>用户附上截图或牌阵时，会自动换成能看图的模型。</span>
              </label>
            )}

            <div className="mt-6 flex gap-2.5">
              <button type="button" className="glass-btn is-danger flex-1" onClick={clearAll}>清空全部</button>
              <button type="button" className="glass-btn flex-1" onClick={onClose}>完成</button>
            </div>
          </>
        )}

        {editing && (
          <>
            <label className="block">
              <span className="mb-2 flex justify-between text-xs tracking-[0.08em]" style={{ color: 'var(--ink2)' }}>
                API Key
                <a href={meta.docUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>获取 Key ↗</a>
              </span>
              <input
                type="password"
                autoFocus
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={status?.[editing]?.configured ? '已保存；留空保持不变，填写则覆盖' : meta.keyPlaceholder}
                className="glass-input px-3.5 py-2.5 text-sm"
              />
            </label>

            {meta.kind === 'endpoints' && (
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs tracking-[0.08em]" style={{ color: 'var(--ink2)' }}>
                    推理接入点 <span className="ml-1 text-[11px]" style={{ color: 'var(--ink3)' }}>在火山方舟控制台创建</span>
                  </span>
                  <button type="button" className="glass-btn is-sm" onClick={() => setEndpoints([...endpoints, { id: '', label: '', vision: false }])}>+ 添加</button>
                </div>
                {endpoints.length === 0 ? (
                  <div className="rounded-xl border border-dashed py-4 text-center text-xs" style={{ borderColor: 'var(--line2)', color: 'var(--ink3)' }}>暂无，点「+ 添加」</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {endpoints.map((ep, i) => {
                      const update = (patch) => setEndpoints(endpoints.map((e, j) => (j === i ? { ...e, ...patch } : e)));
                      return (
                        <div key={i} className="flex flex-wrap items-center gap-2">
                          <input value={ep.id} onChange={(e) => update({ id: e.target.value })} placeholder={meta.endpointPlaceholder} className="glass-input min-w-[140px] flex-1 px-3 py-2 font-mono text-xs" aria-label="接入点 ID" />
                          <input value={ep.label} onChange={(e) => update({ label: e.target.value })} placeholder="显示名（如：豆包 pro）" className="glass-input min-w-[120px] flex-1 px-3 py-2 text-xs" aria-label="显示名" />
                          <label className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--ink2)' }}>
                            <input type="checkbox" checked={!!ep.vision} onChange={(e) => update({ vision: e.target.checked })} style={{ accentColor: 'var(--gold)' }} />
                            能看图
                          </label>
                          <button type="button" className="glass-btn is-icon is-sm is-quiet" onClick={() => setEndpoints(endpoints.filter((_, j) => j !== i))} aria-label="删除这个接入点">✕</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <label className="mt-5 flex items-center gap-2 text-xs" style={{ color: 'var(--ink2)' }}>
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{ accentColor: 'var(--gold)' }} />
              保存后立即启用
            </label>

            {hint && <p className="m-0 mt-3 text-xs" style={{ color: hint.startsWith('✓') ? 'var(--jade)' : 'var(--rose)' }}>{hint}</p>}

            <div className="mt-5 flex gap-2.5">
              <button type="button" className="glass-btn flex-1" onClick={() => setEditing(null)}>返回</button>
              <button type="button" className="glass-btn is-primary flex-1" onClick={handleSave} disabled={saving}>{saving ? '保存中…' : '保存'}</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

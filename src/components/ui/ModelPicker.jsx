import { useEffect, useState } from 'react';
import { useTarotStore } from '../../store/useTarotStore';
import { fetchAvailableModels } from '../../utils/aiClient';
import Seg from './Seg';

const LS_KEY = 'tarot-preferred-model';

/**
 * 解读模型选择：只有一个可用时只显示名字；多个时是一排液态分段按钮；一个都没有就不显示。
 */
export default function ModelPicker() {
  const [models, setModels] = useState(null);
  const selectedModelId = useTarotStore((s) => s.selectedModelId);
  const setSelectedModelId = useTarotStore((s) => s.setSelectedModelId);

  useEffect(() => {
    fetchAvailableModels().then((list) => {
      setModels(list);
      let saved = null;
      try { saved = localStorage.getItem(LS_KEY); } catch {}
      if (saved && list.some((m) => m.id === saved)) setSelectedModelId(saved);
      else if (list.length && !list.some((m) => m.id === useTarotStore.getState().selectedModelId)) setSelectedModelId(list[0].id);
    });
  }, [setSelectedModelId]);

  if (!models || !models.length) return null;

  if (models.length === 1) {
    return <p className="m-0 mt-6 text-center text-[11px] tracking-[0.2em]" style={{ color: 'var(--ink3)' }}>占星师将借助 {models[0].label} 为你解读</p>;
  }

  const choose = (id) => {
    setSelectedModelId(id);
    try { localStorage.setItem(LS_KEY, id); } catch {}
  };

  return (
    <div className="mt-6 flex max-w-[92vw] flex-col items-center gap-2.5">
      <span className="text-[11px] tracking-[0.24em]" style={{ color: 'var(--ink3)' }}>解读模型</span>
      <Seg items={models.map((m) => ({ value: m.id, label: m.label, title: m.id }))} value={selectedModelId || models[0].id} onChange={choose} ariaLabel="选择解读模型" size="sm" />
    </div>
  );
}

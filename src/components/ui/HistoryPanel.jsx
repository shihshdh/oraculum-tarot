import { useEffect, useState } from 'react';
import Modal from './Modal';
import { confirmAsync } from './Confirm';
import { clearAllHistory, deleteHistoryEntry, formatTimestamp, loadHistory } from '../../utils/history';
import { TAROT_DECK, getCardImageUrl } from '../../data/tarotDeck';
import { POSITION_NAMES } from '../../data/spread';
import { useTarotStore } from '../../store/useTarotStore';
import ReadingText from './ReadingText';

/** 占卜史：左边列表，右边详情；窄屏上是先列表、点进去看详情。只存在当前浏览器，最多 50 条。 */
export default function HistoryPanel() {
  const open = useTarotStore((s) => s.historyOpen);
  const setOpen = useTarotStore((s) => s.setHistoryOpen);
  const isMirror = useTarotStore((s) => s.isMirror);
  const [entries, setEntries] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [narrowDetail, setNarrowDetail] = useState(false);

  useEffect(() => {
    if (!open) return;
    const list = loadHistory();
    setEntries(list);
    setSelectedId((id) => (list.some((e) => e.id === id) ? id : list[0]?.id || null));
    setNarrowDetail(false);
  }, [open]);

  const selected = entries.find((e) => e.id === selectedId);

  const remove = async (id) => {
    if (!(await confirmAsync({ title: '删除这条记录？', confirmLabel: '删除', danger: true }))) return;
    deleteHistoryEntry(id);
    const list = loadHistory();
    setEntries(list);
    if (selectedId === id) { setSelectedId(list[0]?.id || null); setNarrowDetail(false); }
  };
  const clear = async () => {
    if (!(await confirmAsync({ title: '清空全部占卜史？', body: '此操作无法撤销。', confirmLabel: '清空', danger: true }))) return;
    clearAllHistory();
    setEntries([]);
    setSelectedId(null);
  };

  if (isMirror) return null;

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="占卜史" subtitle={`保存在当前浏览器，最多 50 次 · 共 ${entries.length} 次`} width={980} className="h-[82svh]">
      <div className="flex min-h-0 flex-1 gap-0" style={{ borderTop: '1px solid var(--line)' }}>
        <div className={`scroll-soft w-full flex-none md:block md:w-72 ${narrowDetail ? 'hidden' : 'block'}`} style={{ borderRight: '1px solid var(--line)' }}>
          {entries.length === 0 ? (
            <p className="px-6 py-12 text-center text-xs" style={{ color: 'var(--ink3)' }}>还没有占卜记录</p>
          ) : (
            <ul className="m-0 list-none p-2">
              {entries.map((e) => {
                const active = e.id === selectedId;
                return (
                  <li key={e.id}>
                    <button type="button" className="w-full rounded-2xl px-3.5 py-3 text-left transition-colors" aria-current={active || undefined}
                      style={{ background: active ? 'rgba(233,203,139,.1)' : 'transparent', boxShadow: active ? 'inset 0 1px 1px rgba(255,249,232,.15), inset 0 0 0 1px rgba(233,203,139,.25)' : 'none' }}
                      onClick={() => { setSelectedId(e.id); setNarrowDetail(true); }}>
                      <span className="line-clamp-2 block font-serif-sc text-[13px] leading-relaxed" style={{ color: 'var(--ink)' }}>{e.question || '（未明确提问）'}</span>
                      <span className="mt-1 block text-[11px] tracking-[0.06em]" style={{ color: 'var(--ink3)' }}>{formatTimestamp(e.timestamp)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {entries.length > 0 && (
            <div className="p-3 pt-0"><button type="button" className="glass-btn is-sm is-danger w-full" onClick={clear}>清空全部</button></div>
          )}
        </div>

        <div className={`scroll-soft min-w-0 flex-1 px-6 py-5 md:block ${narrowDetail ? 'block' : 'hidden'}`}>
          {selected ? (
            <>
              <div className="mb-4 flex items-center justify-between gap-2">
                <button type="button" className="glass-btn is-sm md:hidden" onClick={() => setNarrowDetail(false)}>← 列表</button>
                <span className="text-[11px] tracking-[0.08em]" style={{ color: 'var(--ink3)' }}>{formatTimestamp(selected.timestamp)}{selected.modelLabel ? ` · ${selected.modelLabel}` : ''}</span>
                <button type="button" className="glass-btn is-sm is-danger" onClick={() => remove(selected.id)}>删除</button>
              </div>
              <HistoryDetail entry={selected} />
            </>
          ) : (
            <p className="py-16 text-center text-sm" style={{ color: 'var(--ink3)' }}>选择左侧记录查看详情</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function HistoryDetail({ entry }) {
  return (
    <div className="select-text">
      <p className="m-0 font-serif-sc text-[16px] leading-relaxed"><span style={{ color: 'var(--ink3)' }}>所问 · </span>{entry.question || '（未明确提问）'}</p>
      <ol className="m-0 mt-5 grid list-none grid-cols-5 gap-3 p-0">
        {entry.cards.map((c, i) => {
          const tarot = TAROT_DECK.find((t) => t.id === c.tarotId);
          return (
            <li key={i} className="min-w-0 text-center">
              <div className="overflow-hidden rounded-lg" style={{ aspectRatio: '1 / 1.7', boxShadow: '0 6px 16px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,246,225,.15)' }}>
                {tarot && <img src={getCardImageUrl(tarot)} alt={tarot.nameZh} className="block h-full w-full object-cover" style={{ transform: c.reversed ? 'rotate(180deg)' : undefined }} loading="lazy" draggable={false} />}
              </div>
              <div className="mt-1.5 text-[11px] tracking-[0.1em]" style={{ color: 'var(--gold)' }}>{POSITION_NAMES[i]}</div>
              <div className="truncate text-[12px]">{tarot?.nameZh}</div>
              <div className="text-[11px]" style={{ color: c.reversed ? 'var(--rose)' : 'var(--jade)' }}>{c.reversed ? '逆位' : '正位'}</div>
            </li>
          );
        })}
      </ol>
      <div className="hairline my-5" />
      <ReadingText text={entry.reading || ''} />
    </div>
  );
}

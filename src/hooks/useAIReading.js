import { useEffect, useRef } from 'react';
import { useTarotStore } from '../store/useTarotStore';
import { fetchAvailableModels, readingStream, splitMood } from '../utils/aiClient';
import { saveHistoryEntry } from '../utils/history';
import { emitCompanion } from '../lib/companionBus';

/**
 * 五张牌翻开后，由占星师流式写出解读。
 * 解读的每个阶段都广播给看板娘：凝视水晶球（thinking）→ 开口（speaking）→ 说完（done）。
 */
export function useAIReading() {
  const phase = useTarotStore((s) => s.phase);
  const isMirror = useTarotStore((s) => s.isMirror);
  const nonce = useTarotStore((s) => s.readingNonce);
  const triggeredRef = useRef(false);
  const abortRef = useRef(null);

  useEffect(() => {
    if (isMirror) return;
    if (phase === 'splash') {
      triggeredRef.current = null;
      abortRef.current?.abort();
      return;
    }
    if (phase !== 'done' || triggeredRef.current === `run-${nonce}`) return;
    triggeredRef.current = `run-${nonce}`;

    const store = useTarotStore.getState;
    const { question, cards, selectedModelId } = store();
    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      const { setReading, setReadingStatus, setReadingError, setReadingMood } = store();
      try {
        setReading('');
        setReadingStatus('loading');
        emitCompanion({ type: 'reading', state: 'thinking' });
        const models = await fetchAvailableModels();
        if (!models.length) throw new Error('AI 解读服务暂未开启，请稍后再试，或联系管理员配置。');
        const modelId = models.some((m) => m.id === selectedModelId) ? selectedModelId : models[0].id;

        let raw = '';
        let mood = null;
        for await (const chunk of readingStream({ modelId, question, cards }, { signal: controller.signal })) {
          raw += chunk;
          const parsed = splitMood(raw);
          if (parsed.mood && parsed.mood !== mood) {
            mood = parsed.mood;
            setReadingMood(mood);
          }
          if (parsed.text) {
            if (store().readingStatus !== 'streaming') {
              setReadingStatus('streaming');
              emitCompanion({ type: 'reading', state: 'speaking', mood });
            }
            setReading(parsed.text);
          }
        }
        const text = splitMood(raw).text.trim();
        if (!text) throw new Error('占星师这次没有给出解读，请重新占卜试试。');
        setReading(text);
        setReadingStatus('done');
        emitCompanion({ type: 'reading', state: 'done', mood: mood || 'happy', text });

        try {
          const modelInfo = models.find((m) => m.id === modelId);
          saveHistoryEntry({
            question,
            cards: cards.map(({ slotId, tarotId, reversed }) => ({ slotId, tarotId, reversed })),
            reading: text,
            modelId,
            modelLabel: modelInfo?.label,
          });
        } catch (e) {
          console.warn('保存历史失败', e);
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('[AI Reading] 失败:', err);
        setReadingError(err.message || '解读失败');
        emitCompanion({ type: 'reading', state: 'error', text: err.message });
      }
    })();

    return () => controller.abort();
  }, [phase, isMirror, nonce]);
}

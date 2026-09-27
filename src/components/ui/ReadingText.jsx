import { memo, useEffect, useRef, useState } from 'react';

/**
 * 解读正文：【小标题】单独成行渲染成标题，其余按段落。
 *
 * 星光显现：流式写出时，每个新到的字从一点金色星光里亮起来、再褪成正文颜色；偶尔有一个字迸出一颗小星芒。
 *   · 只有"挂载之后才到的字"会有动画：收起再展开面板、翻历史时，已经在的字直接显示，不会整篇重放
 *   · 每个字的 key 是它在全文里的位置，后面的字到了不会让前面的动画重来
 *   · 写完 1.6 秒后所有字合并回普通文本，不再留着上千个 <span>
 *   · 只有最后一段会随新字重渲染（段落组件按内容记忆）
 */
const SETTLE_MS = 1600;

export default function ReadingText({ text, streaming }) {
  // 挂载时已经有的字：不做动画
  const seen = useRef(null);
  if (seen.current === null) seen.current = streaming ? 0 : text.length;
  const [settled, setSettled] = useState(!streaming);
  useEffect(() => {
    if (streaming) { setSettled(false); return; }
    const t = setTimeout(() => setSettled(true), SETTLE_MS);
    return () => clearTimeout(t);
  }, [streaming]);
  const animateFrom = settled ? Infinity : seen.current;

  // 按行切块，记下每一块在全文里的起点
  const blocks = [];
  let at = 0;
  for (const line of text.split('\n')) {
    if (line.trim()) blocks.push({ line, start: at });
    at += line.length + 1;
  }

  return (
    <div className="reading-text">
      {blocks.map((b, i) => (
        <Block key={b.start} line={b.line} start={b.start} from={animateFrom} caret={streaming && i === blocks.length - 1} />
      ))}
      {!blocks.length && streaming && <Caret />}
    </div>
  );
}

const Block = memo(function Block({ line, start, from, caret }) {
  // 标题还没写完（只到了"【"）时也按标题排版，结构不会在"】"到达时跳变
  const m = line.match(/^(\s*)【([^】]*)(】)?\s*(.*)$/);
  if (m) {
    const titleStart = start + m[1].length + 1;
    const bodyStart = start + line.length - m[4].length;
    return (
      <div>
        <h3><Glyphs text={m[2]} start={titleStart} from={from} />{!m[3] && caret && <Caret />}</h3>
        {m[4] && <p><Glyphs text={m[4]} start={bodyStart} from={from} />{caret && <Caret />}</p>}
        {m[3] && !m[4] && caret && <Caret />}
      </div>
    );
  }
  return <p><Glyphs text={line} start={start} from={from} />{caret && <Caret />}</p>;
});

/** 一段文字：from 之前的部分是普通文本，之后的每个字包一层做显现动画 */
function Glyphs({ text, start, from }) {
  const cut = Math.max(0, Math.min(text.length, from - start));
  if (cut >= text.length) return text;
  const chars = Array.from(text.slice(cut));
  let pos = start + cut;
  return (
    <>
      {text.slice(0, cut)}
      {chars.map((ch) => {
        const i = pos;
        pos += ch.length;
        // 大约每 17 个字有一个带星芒（按位置取，重渲染时不会变）
        const spark = (i * 2654435761) % 17 === 0 && ch.trim();
        return <span key={i} className={spark ? 'glyph glyph-spark' : 'glyph'}>{ch}</span>;
      })}
    </>
  );
}

const Caret = () => <span className="reading-caret" aria-hidden="true">✦</span>;

import { useState } from 'react';
import Modal from './Modal';
import { notify } from './Confirm';
import { useTarotStore } from '../../store/useTarotStore';
import { TAROT_DECK, getCardImageUrl } from '../../data/tarotDeck';
import { POSITION_NAMES } from '../../data/spread';
import StarLoader from './StarLoader';

/** 分享 / 导出：竖版长图（牌阵 + 问题 + 解读）或纯文本。 */
export default function ShareSheet({ open, onClose }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const cards = useTarotStore((s) => s.cards);
  const question = useTarotStore((s) => s.question);
  const reading = useTarotStore((s) => s.reading);
  const readingStatus = useTarotStore((s) => s.readingStatus);

  const toText = () => {
    const lines = ['【命运的抉择 · 塔罗占卜】', `时间：${new Date().toLocaleString('zh-CN')}`, `问题：${question || '（未明确提问）'}`, '', '—— 牌阵 ——'];
    cards.forEach((c, i) => {
      const t = TAROT_DECK.find((x) => x.id === c.tarotId);
      if (t) lines.push(`${POSITION_NAMES[i]}：${t.nameZh}（${c.reversed ? '逆位' : '正位'}）`);
    });
    lines.push('', '—— 占星师的解读 ——', reading || '（未生成）');
    return lines.join('\n');
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(toText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (e) {
      notify('复制失败', e.message);
    }
  };

  const downloadImage = async () => {
    setBusy(true);
    try {
      const canvas = await composeImage({ cards, question, reading });
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png', 1));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tarot-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      notify('导出失败', e.message);
    } finally {
      setBusy(false);
    }
  };

  const Row = ({ onClick, disabled, title, note, children }) => (
    <button type="button" className="glass-btn w-full justify-between rounded-2xl" style={{ minHeight: 54, padding: '0 18px' }} onClick={onClick} disabled={disabled}>
      <span className="flex items-center gap-2.5 text-[14px]">{children}{title}</span>
      <span className="text-[11px]" style={{ color: 'var(--ink3)' }}>{note}</span>
    </button>
  );

  return (
    <Modal open={open} onClose={onClose} title="分享 / 导出" subtitle="把这次的牌阵和占星师的解读带走。" width={420}>
      <div className="flex flex-col gap-2.5 px-6 pb-6">
        <Row onClick={downloadImage} disabled={busy} title={busy ? '正在生成…' : '下载长图'} note="PNG · 含牌面">
          {busy && <StarLoader size={12} style={{ color: 'var(--gold)' }} />}
        </Row>
        <Row onClick={copyText} title={copied ? '已复制 ✓' : '复制文字'} note="纯文本" />
        {readingStatus !== 'done' && <p className="m-0 pt-1 text-xs" style={{ color: 'var(--gold)' }}>解读还没写完，建议等占星师说完再导出。</p>}
      </div>
    </Modal>
  );
}

// ==================== 长图合成 ====================
async function composeImage({ cards, question, reading }) {
  const W = 1200;
  const CARD_W = 180;
  const CARD_H = Math.floor(CARD_W * 1.7);
  const PAD = 72;
  const FONT = '"Noto Serif SC", "Songti SC", "SimSun", serif';

  const imgs = await Promise.all(cards.map((c) => {
    const t = TAROT_DECK.find((x) => x.id === c.tarotId);
    return t ? loadImage(getCardImageUrl(t)).catch(() => null) : Promise.resolve(null);
  }));

  // 先量一遍解读有多高
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = `24px ${FONT}`;
  const readingLines = wrapLines(probe, (reading || '（未生成）').replace(/【(.+?)】/g, '✦ $1\n'), W - PAD * 2);
  const questionLines = (() => { probe.font = `28px ${FONT}`; return wrapLines(probe, question || '（未明确提问）', W - PAD * 2); })();
  const H = 250 + questionLines.length * 44 + 60 + CARD_H + 120 + 70 + readingLines.length * 42 + 130;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createRadialGradient(W / 2, 260, 60, W / 2, H / 2, H);
  bg.addColorStop(0, '#1a1438');
  bg.addColorStop(0.5, '#0d0a22');
  bg.addColorStop(1, '#05040c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = `rgba(${Math.random() < 0.3 ? '255,232,190' : '226,232,255'},${0.15 + Math.random() * 0.5})`;
    ctx.beginPath();
    ctx.arc(Math.random() * W, Math.random() * H, Math.random() * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#e9cb8b';
  ctx.font = '22px Cinzel, serif';
  ctx.fillText('✦  O R A C U L U M  ✦', W / 2, 96);
  ctx.fillStyle = '#f4efe3';
  ctx.font = `600 46px ${FONT}`;
  ctx.fillText('命运的抉择', W / 2, 162);
  ctx.fillStyle = 'rgba(244,239,227,.45)';
  ctx.font = `20px ${FONT}`;
  ctx.fillText(new Date().toLocaleString('zh-CN'), W / 2, 202);

  let y = 262;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(244,239,227,.5)';
  ctx.font = `20px ${FONT}`;
  ctx.fillText('所问', PAD, y);
  y += 44;
  ctx.fillStyle = '#f4efe3';
  ctx.font = `28px ${FONT}`;
  for (const line of questionLines) { ctx.fillText(line, PAD, y); y += 44; }
  y += 30;

  const gap = (W - PAD * 2 - CARD_W * 5) / 4;
  cards.forEach((c, i) => {
    const t = TAROT_DECK.find((x) => x.id === c.tarotId);
    const x = PAD + i * (CARD_W + gap);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.6)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
    if (imgs[i]) {
      if (c.reversed) {
        ctx.translate(x + CARD_W / 2, y + CARD_H / 2);
        ctx.rotate(Math.PI);
        ctx.drawImage(imgs[i], -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H);
      } else ctx.drawImage(imgs[i], x, y, CARD_W, CARD_H);
    }
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e9cb8b';
    ctx.font = `18px ${FONT}`;
    ctx.fillText(POSITION_NAMES[i], x + CARD_W / 2, y + CARD_H + 34);
    ctx.fillStyle = '#f4efe3';
    ctx.font = `600 22px ${FONT}`;
    ctx.fillText(t?.nameZh || '', x + CARD_W / 2, y + CARD_H + 66);
    ctx.fillStyle = c.reversed ? '#ff9c8f' : '#93dcb6';
    ctx.font = `16px ${FONT}`;
    ctx.fillText(c.reversed ? '逆位' : '正位', x + CARD_W / 2, y + CARD_H + 92);
  });
  y += CARD_H + 150;

  ctx.textAlign = 'left';
  ctx.fillStyle = '#e9cb8b';
  ctx.font = `20px ${FONT}`;
  ctx.fillText('占星师的解读', PAD, y);
  y += 52;
  ctx.font = `24px ${FONT}`;
  for (const line of readingLines) {
    ctx.fillStyle = line.startsWith('✦') ? '#e9cb8b' : 'rgba(244,239,227,.9)';
    ctx.fillText(line, PAD, y);
    y += 42;
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(244,239,227,.35)';
  ctx.font = `16px ${FONT}`;
  ctx.fillText('塔罗是照见自己的镜子，而非命定的答案', W / 2, H - 56);
  return canvas;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function wrapLines(ctx, text, maxW) {
  const out = [];
  for (const para of (text || '').split('\n')) {
    if (!para.trim()) continue;
    let line = '';
    for (const ch of para) {
      if (ctx.measureText(line + ch).width > maxW && line) {
        out.push(line);
        line = ch;
      } else line += ch;
    }
    if (line) out.push(line);
  }
  return out;
}

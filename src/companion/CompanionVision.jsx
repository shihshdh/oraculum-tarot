import { useEffect, useRef, useState } from 'react';
import { encodeVisionImage, spreadImage } from './vision';
import { useTarotStore } from '../store/useTarotStore';
import styles from './Astrologer.module.css';

// 面板底部的一行说明（她会读页面文字）＋ 折叠的图片托盘。页面文字每条消息都带；
// 图片（截屏、上传的截图、当前牌阵）只在用户在这里附上后随下一条消息发送。
export default function CompanionVision({ enabled, busy, screen, onScreen, pageImage, onPageImage }) {
  const input = useRef(null);
  const stream = useRef(null);
  const generation = useRef(0);
  const [capturing, setCapturing] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState('');
  const hasSpread = useTarotStore((s) => s.cards.some((c) => c.flipped));

  useEffect(() => {
    setSupported(!!navigator.mediaDevices?.getDisplayMedia);
    return () => {
      generation.current++;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = async () => {
    const version = ++generation.current;
    setCapturing(true);
    setError('');
    let media;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    let timer;
    try {
      media = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1 }, audio: false });
      if (version !== generation.current) return;
      stream.current = media;
      video.srcObject = media;
      await Promise.race([
        new Promise((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error('无法读取画面。'));
          video.play().catch(reject);
        }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('画面读取超时，请重试。')), 12000); }),
      ]);
      if (version === generation.current) onScreen(encodeVisionImage(video, video.videoWidth, video.videoHeight));
    } catch (e) {
      if (version === generation.current && !(e instanceof DOMException && e.name === 'NotAllowedError')) setError('无法截取屏幕，可以改用上传截图。');
    } finally {
      clearTimeout(timer);
      media?.getTracks().forEach((t) => t.stop());
      video.pause();
      video.srcObject = null;
      if (version === generation.current) {
        stream.current = null;
        setCapturing(false);
      }
    }
  };

  const upload = async (file) => {
    if (!file) return;
    const version = ++generation.current;
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) {
      setError('请选择 20MB 以内的 JPG、PNG 或 WebP 截图。');
      return;
    }
    setCapturing(true);
    const url = URL.createObjectURL(file);
    const image = new Image();
    try {
      image.src = url;
      await image.decode();
      if (image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error('图片尺寸过大。');
      if (version === generation.current) onScreen(encodeVisionImage(image, image.naturalWidth, image.naturalHeight));
    } catch {
      if (version === generation.current) setError('无法读取截图，请换一张较小的图片。');
    } finally {
      URL.revokeObjectURL(url);
      if (version === generation.current) setCapturing(false);
    }
  };

  const attachSpread = async () => {
    setError('');
    try {
      const sheet = await spreadImage(useTarotStore.getState().cards);
      if (sheet) onPageImage(sheet);
      else setError('还没有翻开的牌。');
    } catch {
      setError('牌面图片读取失败，可以改用截图。');
    }
  };

  const attached = (screen ? 1 : 0) + (pageImage ? 1 : 0);
  return (
    <div className={styles.vision}>
      <details open={attached > 0 || undefined}>
        <summary>
          <span className={styles.notice}>占星师会读取当前页面内容</span>
          <span className={styles.tray}>
            {attached ? `图片 · 已附 ${attached}` : '图片'}
            <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3" /></svg>
          </span>
        </summary>
        <p>
          {enabled
            ? '每条消息会自动带上页面文字和按钮名称（不含输入框和图片），方便她帮你看、帮你点。图片只在你在这里附上后随消息发送。'
            : '看图需要管理员配置 Gemini 或支持视觉的豆包接入点；页面文字仍会随消息发送。'}
        </p>
        <div className={styles.visionActions}>
          {supported && <button type="button" disabled={!enabled || busy || capturing} onClick={() => void capture()}>{capturing ? '正在读取…' : '截取屏幕'}</button>}
          <button type="button" disabled={!enabled || busy || capturing} onClick={() => input.current?.click()}>上传截图</button>
          <button type="button" disabled={!enabled || busy || capturing || !hasSpread} onClick={() => void attachSpread()}>附上牌阵</button>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="选择截图" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {(screen || pageImage) && (
          <div className={styles.screenPreview}>
            {screen && <span><img src={screen} alt="待发送截图预览" /><button type="button" disabled={busy} onClick={() => onScreen(null)}>移除截图</button></span>}
            {pageImage && <span><img src={pageImage.image} alt={`待发送的 ${pageImage.count} 张牌`} /><button type="button" disabled={busy} onClick={() => onPageImage(null)}>移除牌阵</button></span>}
          </div>
        )}
        {(screen || pageImage) && <p>图片只随你下一条消息交给 AI。截图里的隐私文字不会自动遮挡，请先检查。</p>}
        {error && <p role="status">{error}</p>}
      </details>
    </div>
  );
}

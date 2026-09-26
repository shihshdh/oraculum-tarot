import { useRef } from 'react';
import { useHandTracker } from '../../hooks/useHandTracker';
import { useTarotStore } from '../../store/useTarotStore';
import { isTouchOnly } from '../../lib/device';

/**
 * 摄像头容器：视频元素隐藏，仅供 MediaPipe 分析使用
 * 副屏不启用摄像头，仅通过 BroadcastChannel 镜像主屏
 */
export default function HandTracker() {
  const videoRef = useRef(null);
  const isMirror = useTarotStore((s) => s.isMirror);

  // 手机、平板不开摄像头：省下约 19MB 的识别模型下载，也不弹摄像头授权
  useHandTracker(videoRef, !isMirror && !isTouchOnly());

  return (
    <video
      ref={videoRef}
      className="hidden"
      playsInline
      muted
      autoPlay
    />
  );
}

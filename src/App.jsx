import { lazy, Suspense, useCallback, useState } from 'react';
import HandTracker from './components/tracking/HandTracker';
import MouseInput from './components/tracking/MouseInput';
import BrandIntro from './components/brand/BrandIntro';
import TopBar from './components/ui/TopBar';
import SplashScreen from './components/ui/SplashScreen';
import QuestionScreen from './components/ui/QuestionScreen';
import SelectionHint from './components/ui/SelectionHint';
import CardInfoOverlay from './components/ui/CardInfoOverlay';
import ReadingPanel from './components/ui/ReadingPanel';
import HistoryPanel from './components/ui/HistoryPanel';
import VirtualCursor from './components/ui/VirtualCursor';
import CameraNotice from './components/ui/CameraNotice';
import ConfirmHost from './components/ui/Confirm';
import Astrologer from './companion/Astrologer';
import { useTarotStore } from './store/useTarotStore';
import { useLiquidInteractions } from './lib/liquid';
import { DESKTOP } from './lib/edition';
import RayTraceBadge from './components/ui/RayTraceBadge';
import InspectPanel from './components/ui/InspectPanel';
import LastReading from './components/ui/LastReading';

// three.js 那一大块等开场碎片落定后才下载、解析
const TarotCanvas = lazy(() => import('./components/scene/TarotCanvas'));

export default function App() {
  const isMirror = useTarotStore((s) => s.isMirror);
  // 3D 场景等开场的玻璃碎片落定后再加载，开场动画不被拖慢
  const [sceneOn, setSceneOn] = useState(false);
  const startScene = useCallback(() => setSceneOn(true), []);
  useLiquidInteractions();

  // 占星师的 navigate 动作。返回 false 表示现在去不了。
  const navigate = useCallback((page) => {
    const s = useTarotStore.getState();
    if (page === 'home') { s.reset(); return true; }
    if (page === 'question') {
      if (s.phase !== 'splash') return false;
      s.setPhase('question');
      return true;
    }
    if (page === 'history') { s.setHistoryOpen(true); return true; }
    return false;
  }, []);

  return (
    <div id="app-root" className="relative w-screen overflow-hidden" style={{ height: 'var(--app-h, 100svh)' }}>
      <div className="absolute inset-0 z-[5]" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 45%, #18121f 0%, #0a080d 55%, #040305 100%)' }}>
        {sceneOn && <Suspense fallback={null}><TarotCanvas /></Suspense>}
      </div>

      <CardInfoOverlay />
      <SelectionHint />
      <SplashScreen />
      <LastReading />
      <QuestionScreen />
      <ReadingPanel />
      <TopBar />
      <HistoryPanel />
      <CameraNotice />
      <InspectPanel />
      {DESKTOP && <RayTraceBadge />}

      <HandTracker />
      <MouseInput />
      <VirtualCursor />
      <ConfirmHost />
      {!isMirror && <Astrologer onNavigate={navigate} />}
      <BrandIntro onSceneStart={startScene} />
    </div>
  );
}

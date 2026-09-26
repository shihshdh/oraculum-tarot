import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

const params = new URLSearchParams(window.location.search);
const ROLE = params.get('role') || 'main';
const IS_MIRROR = ROLE === 'mirror';

// 主屏 → 副屏：同一浏览器内用 BroadcastChannel 同步
const stateChannel = new BroadcastChannel('tarot-state');
const cursorChannel = new BroadcastChannel('tarot-cursor');
let lastCursorSend = 0;

const emptySlots = () =>
  Array.from({ length: 5 }, (_, i) => ({ slotId: i, flipped: false, tarotId: null, reversed: false }));

// 只广播真正变了的字段：光标每秒几十次更新，不能每次都把解读全文、聊天记录序列化一遍
const STATE_KEYS = ['phase', 'cards', 'pickedTarotIds', 'question', 'reading', 'readingStatus', 'readingMood', 'chatMessages', 'chatStatus', 'riverAccelerate'];
const CURSOR_KEYS = ['cursor', 'isPinching', 'hoveredRiverId'];
let pendingCursor = null;

const broadcastMiddleware = (config) => (set, get, api) =>
  config(
    (partial, replace) => {
      const fromRemote = partial && partial.__fromRemote;
      if (fromRemote) delete partial.__fromRemote;
      const before = get();
      set(partial, replace);
      if (IS_MIRROR || fromRemote) return;
      const after = get();

      const changed = {};
      let any = false;
      for (const k of STATE_KEYS) if (before[k] !== after[k]) { changed[k] = after[k]; any = true; }
      if (any) stateChannel.postMessage(changed);

      if (CURSOR_KEYS.some((k) => before[k] !== after[k])) {
        // 光标节流到约 30 次/秒，最后一次一定会发出去
        const now = performance.now();
        if (now - lastCursorSend > 33) {
          lastCursorSend = now;
          cursorChannel.postMessage({ cursor: after.cursor, isPinching: after.isPinching, hoveredRiverId: after.hoveredRiverId });
        } else if (!pendingCursor) {
          pendingCursor = setTimeout(() => {
            pendingCursor = null;
            lastCursorSend = performance.now();
            const s = get();
            cursorChannel.postMessage({ cursor: s.cursor, isPinching: s.isPinching, hoveredRiverId: s.hoveredRiverId });
          }, 34);
        }
      }
    },
    get,
    api
  );

export const useTarotStore = create(
  subscribeWithSelector(
    broadcastMiddleware((set) => ({
      role: ROLE,
      isMirror: IS_MIRROR,
      isAdmin: false,

      // splash → question → selecting → done
      phase: 'splash',
      cursor: { x: 0.5, y: 0.5, visible: false },
      // 光标输入源：'gesture' | 'mouse'，避免两种输入互相抢
      cursorSource: 'mouse',
      lastGestureUpdate: 0,
      isPinching: false,
      pinchAmount: 0,
      // 摄像头状态：'off' | 'starting' | 'on' | 'denied' | 'error'
      cameraState: 'off',

      hoveredRiverId: null,
      pickedTarotIds: [],
      cards: emptySlots(),

      question: '',
      reading: '',
      readingStatus: 'idle', // idle | loading | streaming | done | error
      readingError: '',
      readingMood: 'neutral',
      readingNonce: 0, // 加一 = 重新解读
      selectedModelId: null,

      // 解读完成后的追问：{ role, content, streaming? }
      chatMessages: [],
      chatStatus: 'idle', // idle | streaming | error
      chatError: '',

      riverAccelerate: false,
      historyOpen: false,
      // 解读面板是否停靠在右侧（收起成胶囊时为 false）：3D 镜头和牌名据此让位
      panelDocked: false,
      // 开场动画是否结束（副屏、?nointro、减少动态效果时很快就是 true）
      introDone: false,
      // 客户端光追（路径追踪）进度：off | building | compiling | tracing | done；samples = 已累积的采样数
      rayTrace: { status: 'off', samples: 0 },

      // ==================== Actions ====================
      setPhase: (phase) => set({ phase }),
      setIsAdmin: (isAdmin) => set({ isAdmin }),
      setCameraState: (cameraState) => set({ cameraState }),
      setHistoryOpen: (historyOpen) => set({ historyOpen }),
      setPanelDocked: (panelDocked) => set({ panelDocked }),
      setIntroDone: (introDone) => set({ introDone }),
      setRayTrace: (rayTrace) => set({ rayTrace }),
      // pinchAmount：0 = 两指张开，1 = 已捏上（手势光标据此收紧，提示还差多少）
      setCursor: (x, y, visible = true, source = 'gesture', pinchAmount = 0) => {
        const patch = { cursor: { x, y, visible }, cursorSource: source, pinchAmount };
        if (source === 'gesture') patch.lastGestureUpdate = performance.now();
        set(patch);
      },
      setPinching: (isPinching) => set({ isPinching }),

      // 鼠标点击：制造一次 pinch 上升沿（80ms 后释放）
      triggerMouseClick: () => {
        set({ isPinching: false });
        requestAnimationFrame(() => {
          set({ isPinching: true });
          setTimeout(() => set({ isPinching: false }), 80);
        });
      },

      setHoveredRiverId: (hoveredRiverId) => set({ hoveredRiverId }),
      addPickedTarot: (tarotId) => set((s) => ({ pickedTarotIds: [...s.pickedTarotIds, tarotId] })),
      setQuestion: (question) => set({ question }),
      setSelectedModelId: (selectedModelId) => set({ selectedModelId }),

      flipCard: (slotId, tarotId, reversed) =>
        set((s) => {
          const cards = s.cards.map((c) => (c.slotId === slotId ? { ...c, flipped: true, tarotId, reversed } : c));
          return { cards, phase: cards.every((c) => c.flipped) ? 'done' : s.phase };
        }),

      setReadingStatus: (readingStatus) => set({ readingStatus }),
      setReading: (reading) => set({ reading }),
      setReadingMood: (readingMood) => set({ readingMood }),
      setReadingError: (readingError) => set({ readingError, readingStatus: 'error' }),
      retryReading: () => set((s) => ({ readingNonce: s.readingNonce + 1, readingError: '', readingStatus: 'idle' })),

      addChatMessage: (msg) => set((s) => ({ chatMessages: [...s.chatMessages, msg] })),
      updateLastChat: (patch) =>
        set((s) => {
          if (!s.chatMessages.length) return {};
          const last = s.chatMessages[s.chatMessages.length - 1];
          return { chatMessages: [...s.chatMessages.slice(0, -1), { ...last, ...patch }] };
        }),
      clearChat: () => set({ chatMessages: [], chatStatus: 'idle', chatError: '' }),
      setChatStatus: (chatStatus) => set({ chatStatus }),
      setChatError: (chatError) => set({ chatError, chatStatus: 'error' }),

      setRiverAccelerate: (riverAccelerate) => set({ riverAccelerate }),

      reset: () =>
        set({
          phase: 'splash',
          question: '',
          reading: '',
          readingStatus: 'idle',
          readingError: '',
          readingMood: 'neutral',
          hoveredRiverId: null,
          pickedTarotIds: [],
          chatMessages: [],
          chatStatus: 'idle',
          chatError: '',
          riverAccelerate: false,
          cards: emptySlots(),
        }),

      _applyRemoteState: (payload) => set({ ...payload, __fromRemote: true }),
    }))
  )
);

if (IS_MIRROR) {
  stateChannel.onmessage = (e) => useTarotStore.getState()._applyRemoteState(e.data);
  cursorChannel.onmessage = (e) => useTarotStore.getState()._applyRemoteState(e.data);
}

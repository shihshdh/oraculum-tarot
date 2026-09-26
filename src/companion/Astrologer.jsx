// 占星师：本站的看板娘。角落里的 Live2D 小魔女——
//   · 解读由她来做：翻牌后她托起水晶球凝视，解读流式写出时她开口说话，说完按牌面心情做出反应
//   · 留意页面已经显示给用户的报错（role="alert"），主动问要不要帮忙
//   · 可以聊天、读当前页面、指出/点击按钮（危险操作先问）、看用户附上的截图或牌阵
//   · 会自己在屏幕底部散步，可以拖动、收起；尊重"减少动态效果"
// 体验与 Pixel Reconstruction 的「鲸鱼娘」一致。
// 形象：Live2D 官方示例模型「Mao」，Free Material License。

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { assistChat, fetchAIStatus } from '../utils/aiClient';
import { useTarotStore } from '../store/useTarotStore';
import { onCompanion } from '../lib/companionBus';
import { PAGE_NAMES, SCROLL_WORDS, findRef, highlight, isDisabled, isRisky, labelOf, scrollPage } from './actions';
import { collectPageText } from './vision';
import { trapScroll } from './scrollTrap';
import CompanionVision from './CompanionVision';
import StarLoader from '../components/ui/StarLoader';
import styles from './Astrologer.module.css';

const Stage = lazy(() => import('./AstrologerStage'));

const NAME = '占星师';
const PREF_KEY = 'oraculum-companion-v1';
const CHAT_KEY = 'oraculum-companion-chat-v1';
const SESSION_KEY = 'oraculum-companion-session-v1';
const ERROR_MEMORY_MS = 15 * 60 * 1000;

function readJson(storage, key, fallback) {
  try {
    const raw = storage().getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(storage, key, value) {
  try { storage().setItem(key, JSON.stringify(value)); } catch {}
}
/** 气泡停留时间：够把整段读完（含打字过程） */
const readTime = (text) => Math.min(90000, Math.max(9000, 5000 + text.length * 160));
/** 客户端先粗扫一遍；服务端发给模型前还会再扫 */
const scrub = (text) => text.replace(/(https?:\/\/[^\s?#]+)\?\S*/g, '$1').replace(/[A-Za-z0-9_-]{40,}/g, '…').slice(0, 300);
const short = (text, max = 28) => (text.length > max ? text.slice(0, max) + '…' : text);

const SUGGESTIONS = {
  splash: ['怎么用手势占卜？', '塔罗牌准吗？', '带我看看占卜史'],
  question: ['帮我把问题问得更好', '什么样的问题适合塔罗？', '可以不写问题吗？'],
  selecting: ['选牌有什么讲究吗？', '牌河怎么加速？', '逆位是什么意思？'],
  revealing: ['这五个位置分别代表什么？'],
  done: ['用一句话总结我的牌阵', '哪张牌最关键？', '我接下来该怎么做？'],
};
const STAGE_TEXT = { loading: '占星师正在凝视水晶球', streaming: '占星师正在写解读', done: '解读已完成', error: '解读失败' };

export default function Astrologer({ onNavigate }) {
  const phase = useTarotStore((s) => s.phase);
  const readingStatus = useTarotStore((s) => s.readingStatus);
  const chatStatus = useTarotStore((s) => s.chatStatus);
  const introDone = useTarotStore((s) => s.introDone);

  const rootRef = useRef(null);
  const hitRef = useRef(null);
  const inputRef = useRef(null);
  const logRef = useRef(null);
  const stageRef = useRef(null);
  const abortRef = useRef(null);
  const errorsRef = useRef([]);
  const nextId = useRef(1);
  const bubbleTimer = useRef(null);
  const lastProactive = useRef(0);

  const [compact, setCompact] = useState(false);
  const [reduced, setReduced] = useState(false);
  // 手机和省流量模式默认收起：4MB 的形象等用户点开再加载
  const [prefs, setPrefs] = useState(() => readJson(() => localStorage, PREF_KEY, {
    collapsed: matchMedia('(max-width: 767px)').matches || !!navigator.connection?.saveData, right: 18, bottom: 16,
  }));
  const [idle, setIdle] = useState(false);
  const [stageState, setStageState] = useState('off'); // off | loading | ready | failed
  const [open, setOpen] = useState(false);
  const [bubble, setBubble] = useState(null);
  const [items, setItems] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(null);
  const [unseenError, setUnseenError] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [screen, setScreen] = useState(null);
  const [pageImage, setPageImage] = useState(null);
  const [pending, setPending] = useState(null);
  const [vision, setVision] = useState(false);
  const openRef = useRef(false);
  const inspectHinted = useRef(false); // "凑近看看"只说一次
  openRef.current = open;
  const sending = useRef(false);
  const navigateRef = useRef(onNavigate);
  navigateRef.current = onNavigate;

  // ---- 环境：尺寸档、减少动态、保存的偏好、空闲后再加载 ----
  useEffect(() => {
    const narrow = matchMedia('(max-width: 767px)');
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => { setCompact(narrow.matches); setReduced(motion.matches); };
    sync();
    narrow.addEventListener('change', sync);
    motion.addEventListener('change', sync);
    setItems(readJson(() => sessionStorage, CHAT_KEY, { items: [] }).items);
    const visibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', visibility);
    fetchAIStatus().then((s) => setVision(!!s.vision));
    return () => {
      narrow.removeEventListener('change', sync);
      motion.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', visibility);
      abortRef.current?.abort();
    };
  }, []);
  useEffect(() => { writeJson(() => localStorage, PREF_KEY, prefs); }, [prefs]);
  useEffect(() => { writeJson(() => sessionStorage, CHAT_KEY, { items: items.slice(-30) }); }, [items]);
  useEffect(() => {
    if (idle || !introDone) return;
    const id = window.requestIdleCallback ? window.requestIdleCallback(() => setIdle(true), { timeout: 2500 }) : window.setTimeout(() => setIdle(true), 1200);
    return () => (window.cancelIdleCallback ? window.cancelIdleCallback(id) : clearTimeout(id));
  }, [idle, introDone]);
  const wantStage = idle && !prefs.collapsed && stageState !== 'failed';
  useEffect(() => { if (wantStage && stageState === 'off') setStageState('loading'); }, [wantStage, stageState]);

  const say = useCallback((next, ms = 9000) => {
    clearTimeout(bubbleTimer.current);
    setBubble(next);
    if (next?.mood) stageRef.current?.setMood(next.mood);
    if (next) bubbleTimer.current = setTimeout(() => setBubble(null), ms);
  }, []);
  // 手指/指针停在气泡上（在读、在滚）时，气泡不消失
  const holdBubble = () => { clearTimeout(bubbleTimer.current); bubbleTimer.current = null; };
  const releaseBubble = () => { holdBubble(); bubbleTimer.current = setTimeout(() => setBubble(null), 8000); };
  // React 18 的回调 ref 不支持返回清理函数：自己记住上一次的清理
  const trapCleanups = useRef(new Map());
  const makeTrap = (key) => (el) => {
    trapCleanups.current.get(key)?.();
    trapCleanups.current.delete(key);
    if (el) trapCleanups.current.set(key, trapScroll(el));
  };
  const panelTrap = useCallback(makeTrap('panel'), []);
  const bubbleTrap = useCallback(makeTrap('bubble'), []);
  const bubbleTextRef = useRef(null);
  const bubbleFollow = useRef(true);
  useEffect(() => () => clearTimeout(bubbleTimer.current), []);

  const openChat = useCallback((prefill) => {
    setOpen(true);
    setBubble(null);
    setUnseenError(false);
    setPrefs((p) => (p.collapsed ? { ...p, collapsed: false } : p));
    if (prefill !== undefined) setInput(prefill);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);
  const closeChat = useCallback(() => {
    setOpen(false);
    setScreen(null);
    setPageImage(null);
    setPending(null);
    requestAnimationFrame(() => hitRef.current?.focus());
  }, []);

  // ---- 发消息 ----
  const context = useCallback(() => {
    const now = Date.now();
    const s = useTarotStore.getState();
    return {
      page: s.phase,
      stage: STAGE_TEXT[s.readingStatus],
      errors: errorsRef.current.filter((e) => now - e.at < ERROR_MEMORY_MS).slice(-5).map((e) => e.text),
      online: navigator.onLine,
      input: s.cursorSource,
      question: s.question,
      cards: s.cards.filter((c) => c.tarotId).map(({ tarotId, reversed, flipped }) => ({ tarotId, reversed, flipped })),
      reading: s.reading ? s.reading.slice(0, 1600) : undefined,
    };
  }, []);
  const note = useCallback((content) => {
    setItems((list) => [...list, { id: nextId.current++, role: 'assistant', content, local: true }]);
  }, []);

  // 一步步执行她提议的操作，并在对话里告诉用户发生了什么
  const runActions = useCallback(async (actions) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    let touchedPage = false;
    for (const action of actions.slice(0, 4)) {
      if (action.type === 'navigate') {
        if (!PAGE_NAMES[action.page]) continue;
        // 回到开场会清掉当前占卜：先问
        const phaseNow = useTarotStore.getState().phase;
        if (action.page === 'home' && phaseNow !== 'splash') {
          setPending({ id: nextId.current++, nav: 'home', label: '回到开场（当前占卜会结束）' });
          return false;
        }
        const result = navigateRef.current?.(action.page);
        note(result === false ? `↪ 现在去不了「${PAGE_NAMES[action.page]}」` : `↪ 已打开「${PAGE_NAMES[action.page]}」`);
        touchedPage = true;
        await wait(500);
        continue;
      }
      if (action.type === 'scroll' && !action.ref) {
        if (action.direction && scrollPage(action.direction, reduced)) { note(`↪ ${SCROLL_WORDS[action.direction]}`); touchedPage = true; }
        await wait(350);
        continue;
      }
      const el = action.ref ? findRef(action.ref) : null;
      if (!el) { note('↪ 没找到她说的那个位置，页面可能已经变了，可以再问她一次。'); continue; }
      const label = labelOf(el);
      touchedPage = true;
      if (action.type !== 'click') { highlight(el, reduced); note(`↪ 已标出「${label}」`); await wait(350); continue; }
      if (isDisabled(el)) { highlight(el, reduced); note(`↪「${label}」现在不可用，已帮你标出来。`); continue; }
      if (isRisky(el)) {
        highlight(el, reduced);
        setPending({ id: nextId.current++, ref: action.ref, label });
        return false; // 面板保持打开等用户回答；后面的步骤都等着
      }
      highlight(el, reduced);
      await wait(reduced ? 80 : 420);
      if (!el.isConnected) { note('↪ 页面变化了，这一步没有执行。'); continue; }
      el.click();
      note(`↪ 已点击「${label}」`);
      await wait(450);
    }
    return touchedPage;
  }, [note, reduced]);
  const confirmPending = (yes) => {
    const current = pending;
    setPending(null);
    if (!current) return;
    if (!yes) { note(`↪ 已取消「${current.label}」`); return; }
    if (current.nav) {
      navigateRef.current?.(current.nav);
      note(`↪ ${current.label.replace(/（.*）/, '')}`);
      return;
    }
    const el = findRef(current.ref);
    if (!el || isDisabled(el)) { note(`↪「${current.label}」已经不在页面上或不可用了。`); return; }
    el.click();
    note(`↪ 已点击「${current.label}」`);
  };

  const send = useCallback(async (text, manual = false) => {
    const attachment = manual && vision ? screen : null;
    const pictures = manual && vision ? pageImage : null;
    const content = text.trim() || (attachment || pictures ? '请看看我附上的图片。' : '');
    if (!content || busy || sending.current) return;
    sending.current = true;
    const user = { id: nextId.current++, role: 'user', content: content.slice(0, 1200) };
    const history = [...items, user];
    setItems(history);
    setInput('');
    setBusy(true);
    setPending(null);
    stageRef.current?.setMood('think');
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const messages = history.filter((m) => !m.local).slice(-12).map(({ role, content }) => ({ role, content }));
    try {
      // 页面文字和控件清单每条都带（面板里写明了）；图片只在附上时才带
      let pageText;
      try { pageText = collectPageText() || undefined; } catch {}
      const { reply, mood, actions } = await assistChat(messages, { ...context(), page_text: pageText }, controller.signal, {
        screen: attachment || undefined,
        page_image: pictures?.image,
      });
      if (controller.signal.aborted) return;
      if (attachment) setScreen(null);
      if (pictures) setPageImage(null);
      const answer = { id: nextId.current++, role: 'assistant', content: reply };
      setItems((list) => [...list, answer]);
      setReveal(reduced ? null : { id: answer.id, count: 0 });
      stageRef.current?.setMood(mood);
      if (!openRef.current) say({ text: reply, itemId: answer.id, mood, actions: [{ label: '展开聊聊', run: () => openChat() }, { label: '好', run: () => setBubble(null) }] }, readTime(reply));
      if (Array.isArray(actions) && actions.length) {
        const touched = await runActions(actions);
        // 手机上面板会盖住页面：让开，让用户看到她做了什么
        if (touched && compact && !controller.signal.aborted) {
          setOpen(false);
          say({ text: reply, itemId: answer.id, mood, actions: [{ label: '展开聊聊', run: () => openChat() }] }, readTime(reply));
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : `${NAME}暂时回不了话，请稍后再试。`;
      setItems((list) => [...list, { id: nextId.current++, role: 'assistant', content: message, local: true }]);
      stageRef.current?.setMood('worry');
      stageRef.current?.cast('misfire');
    } finally {
      sending.current = false;
      if (abortRef.current === controller) { abortRef.current = null; setBusy(false); }
    }
  }, [busy, items, context, reduced, screen, pageImage, vision, runActions, compact, say, openChat]);
  const sendRef = useRef(send);
  sendRef.current = send;

  // ---- 解读由她来做：水晶球 → 开口 → 反应 ----
  useEffect(() => onCompanion((signal) => {
    const stage = stageRef.current;
    if (signal.type === 'reading') {
      if (signal.state === 'thinking') {
        stage?.setMood('think');
        stage?.hold('crystal', true);
        stage?.cast('crystal');
        if (!openRef.current) say({ text: '五张牌都翻开啦……让我凝视一下水晶球～', mood: 'think' }, 12000);
      } else if (signal.state === 'speaking') {
        stage?.hold('crystal', false);
        if (signal.mood) stage?.setMood(signal.mood);
        setBubble(null);
      } else if (signal.state === 'done') {
        stage?.hold('crystal', false);
        const gentle = ['sad', 'worry'].includes(signal.mood);
        stage?.setMood(signal.mood);
        if (!gentle) stage?.cast('bless');
        if (!openRef.current) {
          say({
            text: gentle ? '解读写在旁边了。牌面有点沉，但转机也在里面——有想不通的，随时问我。' : '解读写在旁边啦～想追问哪张牌，直接在面板里问我，或者点我聊聊。',
            mood: signal.mood,
            actions: [
              { label: '看解读', run: () => { const el = document.querySelector('[data-reading-panel]'); if (el) highlight(el, reduced); setBubble(null); } },
              { label: '和你聊聊', run: () => openChat() },
            ],
          }, 16000);
        }
      } else if (signal.state === 'error') {
        stage?.hold('crystal', false);
        stage?.cast('misfire');
        stage?.setMood('worry');
      }
    } else if (signal.type === 'followup') {
      if (signal.state === 'thinking') stage?.setMood('think');
      else if (signal.mood) stage?.setMood(signal.mood);
    } else if (signal.type === 'moment') {
      if (signal.kind === 'picked' && signal.count === 1 && !openRef.current) say({ text: '第一张～凭直觉就好，不用想太多。', mood: 'happy' }, 5000);
      if (signal.kind === 'picked' && signal.count === 4 && !openRef.current) say({ text: '还差最后一张了哦。', mood: 'excited' }, 4000);
      if (signal.kind === 'shuffled' && !openRef.current) {
        const lines = ['哗啦——牌重新洗过啦，这回的顺序只属于你。', '洗得好！让牌重新找一找你。', '手气换一换～再凭直觉挑吧。'];
        say({ text: lines[Math.floor(Math.random() * lines.length)], mood: 'excited' }, 4500);
      }
      if (signal.kind === 'inspect' && !openRef.current && !inspectHinted.current) {
        inspectHinted.current = true;
        say({ text: '凑近看看～牌面的细节里也藏着答案。', mood: 'happy' }, 4000);
      }
    }
  }), [say, openChat, reduced]);

  // 她说话时嘴巴动：自己的回复在逐字出现，或解读/追问正在流式写出
  const streamingReading = readingStatus === 'streaming' || chatStatus === 'streaming';
  useEffect(() => {
    if (!reveal) stageRef.current?.speak(streamingReading);
  }, [streamingReading, reveal]);

  // 最新一条回复几个字几个字地出现，同时嘴巴在动
  useEffect(() => {
    if (!reveal) return;
    const target = items.find((m) => m.id === reveal.id);
    if (!target || reveal.count >= target.content.length) {
      stageRef.current?.speak(false);
      setReveal(null);
      return;
    }
    stageRef.current?.speak(true);
    const timer = setTimeout(() => setReveal((r) => (r ? { ...r, count: r.count + 2 } : r)), 45);
    return () => clearTimeout(timer);
  }, [reveal, items]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [items, busy, reveal?.count, open, pending]);

  // 回复打字时气泡跟着往下滚，除非用户往回翻着在读
  useEffect(() => { bubbleFollow.current = true; bubbleTextRef.current?.scrollTo({ top: 0 }); }, [bubble]);
  useEffect(() => {
    const el = bubbleTextRef.current;
    if (el && bubbleFollow.current && bubble?.itemId !== undefined && reveal?.id === bubble.itemId) el.scrollTop = el.scrollHeight;
  }, [reveal?.count, reveal?.id, bubble]);

  // ---- 留意页面已经告诉用户的事 ----
  useEffect(() => {
    const seen = new Set();
    let timer = 0;
    const scan = () => {
      timer = 0;
      const root = rootRef.current;
      const alerts = Array.from(document.querySelectorAll('[role="alert"]'))
        .filter((el) => !root?.contains(el) && el.getClientRects().length > 0)
        .map((el) => scrub((el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()))
        .filter((text) => text.length >= 4);
      for (const text of alerts) {
        if (seen.has(text)) continue;
        seen.add(text);
        errorsRef.current = [...errorsRef.current.filter((e) => e.text !== text), { text, at: Date.now() }].slice(-8);
        setUnseenError(true);
        stageRef.current?.setMood('worry');
        if (Date.now() - lastProactive.current > 20000) {
          lastProactive.current = Date.now();
          say({
            text: `呜…页面说「${short(text)}」。要我帮你看看吗？`,
            mood: 'worry',
            actions: [
              { label: '帮我看看', run: () => { openChat(); void sendRef.current(`页面提示：「${text}」。这是怎么回事？我该怎么办？`); } },
              { label: '没事', run: () => setBubble(null) },
            ],
          }, 14000);
        }
      }
    };
    const observer = new MutationObserver(() => { if (!timer) timer = window.setTimeout(scan, 350); });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    scan();
    return () => { observer.disconnect(); if (timer) clearTimeout(timer); };
  }, [say, openChat]);

  // 每次访问第一次出现时打个招呼
  useEffect(() => {
    if (stageState !== 'ready') return;
    const session = readJson(() => sessionStorage, SESSION_KEY, { greeted: false });
    if (session.greeted) return;
    writeJson(() => sessionStorage, SESSION_KEY, { ...session, greeted: true });
    stageRef.current?.greet();
    say({ text: `你好呀，我是${NAME}～这次的解读由我来做。想问怎么玩、看不懂牌，或者只是想聊聊，都可以点我。`, mood: 'happy' });
  }, [stageState, say]);

  // ---- 拖动（整个形象），轻点打开 ----
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const stageSize = compact ? { width: 132, height: 176 } : { width: 190, height: 254 };
  // 面板在形象（或小胶囊）上方：把它的高度限制在视口顶部到形象之间，跟随可视区域（手机键盘）
  const [viewHeight, setViewHeight] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    const sync = () => setViewHeight(Math.round(vv?.height || window.innerHeight));
    sync();
    vv?.addEventListener('resize', sync);
    window.addEventListener('resize', sync);
    return () => { vv?.removeEventListener('resize', sync); window.removeEventListener('resize', sync); };
  }, []);
  const figureHeight = prefs.collapsed || stageState === 'failed' ? 38 : stageSize.height;
  const panelMax = viewHeight ? Math.max(220, viewHeight - (figureHeight + 10 + prefs.bottom) - 12) : undefined;

  const clampPos = useCallback((right, bottom) => {
    const box = rootRef.current?.querySelector('[data-figure]')?.getBoundingClientRect();
    const w = box?.width || stageSize.width;
    const h = box?.height || stageSize.height;
    let minRight = 8;
    let minBottom = 8;
    // 别挡住解读面板：宽屏站到它左边，窄屏（底部抽屉）站到它上面
    const avoid = document.querySelector('[data-companion-avoid]')?.getBoundingClientRect();
    if (avoid && window.innerWidth >= 768 && avoid.left - w - 16 > 8) {
      minRight = Math.max(minRight, window.innerWidth - avoid.left + 8);
      // 牌阵占着底部：站到五张牌的上方（牌顶由 3D 场景投影出的卡位位置算出）
      const overlay = document.querySelector('[data-slot-overlay]');
      const css = overlay ? getComputedStyle(overlay) : null;
      const slotBottom = css ? parseFloat(css.getPropertyValue('--slot-bottom')) : 0;
      const spacing = css ? parseFloat(css.getPropertyValue('--slot-x-1')) - parseFloat(css.getPropertyValue('--slot-x-0')) : 0;
      if (slotBottom && spacing > 0) {
        const cardTop = slotBottom - (spacing / 1.3) * 1.56;
        if (cardTop - h > 70) minBottom = window.innerHeight - cardTop + 6;
      }
    }
    else if (avoid && window.innerWidth < 768 && avoid.top - h - 16 > 60) minBottom = window.innerHeight - avoid.top + 8;
    return {
      right: Math.max(minRight, Math.min(window.innerWidth - w - 8, right)),
      bottom: Math.max(minBottom, Math.min(window.innerHeight - h - 8, bottom)),
    };
  }, [stageSize.width, stageSize.height]);
  useEffect(() => {
    const fit = () => setPrefs((p) => ({ ...p, ...clampPos(p.right, p.bottom) }));
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [clampPos]);
  // 解读面板出现/消失时重新站位
  useEffect(() => {
    const t = setTimeout(() => setPrefs((p) => { const f = clampPos(p.right, p.bottom); return f.right === p.right && f.bottom === p.bottom ? p : { ...p, ...f }; }), 700);
    return () => clearTimeout(t);
  }, [phase, clampPos]);

  // ---- 散步：没人和她说话时，她在屏幕底部走来走去 ----
  const [walking, setWalking] = useState(null);
  const walkingRef = useRef(walking);
  walkingRef.current = walking;
  const walkTimer = useRef(null);
  /** 就地停下（过渡进行到一半也行），返回当前位置 */
  const stopWalk = useCallback(() => {
    clearTimeout(walkTimer.current);
    walkTimer.current = null;
    stageRef.current?.walk(0);
    const root = rootRef.current;
    if (!walkingRef.current || !root) return null;
    const here = { right: Math.round(parseFloat(getComputedStyle(root).right) || 0), bottom: Math.round(parseFloat(getComputedStyle(root).bottom) || 0) };
    walkingRef.current = null;
    setWalking(null);
    setPrefs((p) => ({ ...p, ...here }));
    return here;
  }, []);
  const canWander = stageState === 'ready' && !prefs.collapsed && !open && !busy && !pending && !hidden && !reduced && !streamingReading && readingStatus !== 'loading';
  useEffect(() => {
    if (stageState === 'ready' || stageState === 'failed') setPrefs((p) => { const f = clampPos(p.right, p.bottom); return f.right === p.right && f.bottom === p.bottom ? p : { ...p, ...f }; });
  }, [stageState, prefs.collapsed, clampPos]);
  const [walkRound, setWalkRound] = useState(0);
  useEffect(() => {
    if (!canWander) { stopWalk(); return; }
    if (walking) return;
    const timer = setTimeout(() => {
      const figure = rootRef.current?.querySelector('[data-figure]')?.getBoundingClientRect();
      const width = figure?.width || stageSize.width;
      const lo = clampPos(0, prefs.bottom).right;
      const hi = window.innerWidth - width - 8;
      // 正在被拖、或没地方走：下一轮再试，而不是永远不走了
      if (drag.current || hi - lo < 80) { setWalkRound((n) => n + 1); return; }
      const from = prefs.right;
      // 走 120–420px；靠边就掉头
      let to = from + (Math.random() < 0.5 ? -1 : 1) * (120 + Math.random() * 300);
      if (to < lo || to > hi) to = from - (to - from);
      to = Math.max(lo, Math.min(hi, to));
      const ms = Math.round((Math.abs(to - from) / 75) * 1000); // 约 75px/s
      if (ms < 800) { setWalkRound((n) => n + 1); return; }
      stageRef.current?.walk(to < from ? 1 : -1); // right 变小 = 往屏幕右边走
      setWalking({ ms });
      setPrefs((p) => ({ ...p, right: Math.round(to) }));
      walkTimer.current = setTimeout(() => { walkTimer.current = null; stageRef.current?.walk(0); setWalking(null); }, ms);
    }, 7000 + Math.random() * 9000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canWander, walking, walkRound]);
  useEffect(() => () => clearTimeout(walkTimer.current), []);

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    const here = stopWalk();
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, right: here?.right ?? prefs.right, bottom: here?.bottom ?? prefs.bottom, moved: false };
  };
  const onPointerMove = (event) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    if (!d.moved) { d.moved = true; event.currentTarget.setPointerCapture(event.pointerId); }
    setPrefs((p) => ({ ...p, ...clampPos(d.right - dx, d.bottom - dy) }));
  };
  const onPointerUp = (event) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    suppressClick.current = d.moved;
    drag.current = null;
  };
  const onFigureClick = () => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    stageRef.current?.touch();
    if (open) closeChat();
    else openChat();
  };

  const errorsNow = errorsRef.current.filter((e) => Date.now() - e.at < ERROR_MEMORY_MS);
  const suggestions = [...(errorsNow.length ? ['刚才的报错是什么意思？'] : []), ...(SUGGESTIONS[phase] || SUGGESTIONS.splash)].slice(0, 3);
  const showFigure = !prefs.collapsed && stageState !== 'failed';

  return (
    <div
      ref={rootRef}
      className={styles.root}
      data-assist-private
      data-no-card-click
      data-compact={compact || undefined}
      data-reduced={reduced || undefined}
      style={{ right: prefs.right, bottom: prefs.bottom, transition: walking ? `right ${walking.ms}ms cubic-bezier(.45,.05,.55,.95)` : undefined }}
      onKeyDown={(event) => { if (event.key === 'Escape' && open) { event.stopPropagation(); closeChat(); } }}
    >
      {open && (
        <section ref={panelTrap} className={`${styles.panel} glass glass-dense`} style={{ maxHeight: panelMax }} role="dialog" aria-modal="false" aria-labelledby="astrologer-title">
          <header className={styles.panelHead}>
            <div className={styles.who}>
              <span className={styles.sigil} aria-hidden="true">✦</span>
              <div>
                <strong id="astrologer-title">{NAME}</strong>
                <span>见习魔女 · 你的塔罗向导</span>
              </div>
            </div>
            <div className={styles.headActions}>
              <button type="button" onClick={() => { abortRef.current?.abort(); setItems([]); setBusy(false); setReveal(null); setScreen(null); setPageImage(null); setPending(null); }} disabled={!items.length && !busy && !screen && !pageImage}>清空</button>
              <button type="button" onClick={closeChat} aria-label="关闭对话"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2.5 2.5 7 7m0-7-7 7" /></svg></button>
            </div>
          </header>
          <div ref={logRef} className={`${styles.log} scroll-soft`} aria-live="polite">
            {items.length === 0 && <p className={styles.empty}>可以问我怎么占卜、牌是什么意思、刚才的报错怎么办；也可以让我帮你找按钮、翻面板，或者随便聊聊。</p>}
            {items.map((m) => {
              const revealing = reveal?.id === m.id;
              return (
                <p key={m.id} className={m.role === 'user' ? styles.me : m.local ? styles.system : styles.her}>
                  {revealing ? m.content.slice(0, reveal.count) : m.content}
                </p>
              );
            })}
            {pending && (
              <div className={styles.confirm} role="group" aria-label="确认操作">
                <span>要我{pending.nav ? '' : '点击'}「{short(pending.label, 20)}」吗？这一步可能会结束当前占卜、删除或导出内容。</span>
                <div>
                  <button type="button" onClick={() => confirmPending(true)}>确认</button>
                  <button type="button" onClick={() => confirmPending(false)}>取消</button>
                </div>
              </div>
            )}
            {busy && <p className={styles.typing} role="status" aria-label={`${NAME}正在输入`}><StarLoader size={12} /></p>}
          </div>
          {items.length === 0 && (
            <div className={styles.suggest}>
              {suggestions.map((s) => <button key={s} type="button" onClick={() => void send(s, true)}>{s}</button>)}
            </div>
          )}
          <CompanionVision enabled={vision} busy={busy} screen={screen} onScreen={setScreen} pageImage={pageImage} onPageImage={setPageImage} />
          <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void send(input, true); }}>
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              maxLength={1200}
              placeholder={`和${NAME}说点什么…`}
              aria-label={`给${NAME}的消息`}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                // 中文输入法：选字时的回车不发送
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(input, true); }
              }}
            />
            <button type="submit" className="glass-btn is-primary" disabled={busy || (!input.trim() && !screen && !pageImage)}>发送</button>
          </form>
          <footer className={styles.credit}>
            形象 Live2D 官方示例模型「Mao」 · <a href="https://www.live2d.com/eula/live2d-free-material-license-agreement_cn.html" target="_blank" rel="noopener noreferrer">Free Material License</a> · Live2D Cubism · 回答由 AI 生成，仅供参考，请勿发送密码或密钥
          </footer>
        </section>
      )}

      {bubble && !open && (
        <div ref={bubbleTrap} className={`${styles.bubble} glass glass-dense`} role="status" onPointerEnter={holdBubble} onPointerDown={holdBubble} onPointerLeave={releaseBubble} onTouchEnd={releaseBubble}>
          <p ref={bubbleTextRef} className={styles.bubbleText} onScroll={(event) => { const el = event.currentTarget; bubbleFollow.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 24; }}>
            {bubble.itemId !== undefined && reveal?.id === bubble.itemId ? bubble.text.slice(0, reveal.count) : bubble.text}
          </p>
          {bubble.actions && <div>{bubble.actions.map((a) => <button key={a.label} type="button" onClick={a.run}>{a.label}</button>)}</div>}
        </div>
      )}

      {!showFigure ? (
        <button type="button" className={`${styles.chip} glass-btn`} onClick={() => { setPrefs((p) => ({ ...p, collapsed: false })); openChat(); }} aria-label={`展开${NAME}并聊天`}>
          <span className={styles.chipDot} data-alert={unseenError || undefined} />{NAME}
        </button>
      ) : (
        <div className={styles.figure} data-figure data-walking={walking ? '' : undefined} style={{ width: stageSize.width, height: stageSize.height }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          {stageState !== 'off' && (
            <Suspense fallback={null}>
              <Stage
                key={compact ? 'c' : 'w'}
                ref={stageRef}
                width={stageSize.width}
                height={stageSize.height}
                paused={hidden || !!prefs.collapsed}
                reducedMotion={reduced}
                onReady={() => setStageState('ready')}
                onError={(reason) => { console.warn(`[${NAME}] Live2D 形象未能加载，改用小按钮：`, reason); setStageState('failed'); }}
              />
            </Suspense>
          )}
          {stageState !== 'ready' && <span className={styles.placeholder}><StarLoader size={12} /></span>}
          <button ref={hitRef} type="button" className={styles.hit} onClick={onFigureClick} aria-expanded={open} aria-label={open ? `收起和${NAME}的对话` : `和${NAME}聊天`} />
          <button type="button" className={styles.collapse} onClick={() => { setOpen(false); setBubble(null); setPrefs((p) => ({ ...p, collapsed: true })); }} aria-label={`收起${NAME}`}>
            <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6h7" /></svg>
          </button>
          {unseenError && !open && <span className={styles.alertDot} aria-hidden="true" />}
        </div>
      )}
    </div>
  );
}

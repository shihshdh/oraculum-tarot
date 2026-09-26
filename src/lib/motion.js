// 动效地基：时长 / 缓动 / 降级，全站共用一套（与 Pixel Reconstruction 相同的规矩）
//   · 动效必须有职责：确认操作 / 说清状态 / 保持连续 / 引导注意
//   · 只动 transform 和 opacity；缓动只用自然减速，不回弹
//   · prefers-reduced-motion 是"去掉位移"，不是"关掉一切"

/** 自然减速：所有"到位"的动作都用它 */
export const EASE = [0.16, 1, 0.3, 1];

/** 时长分级（秒，framer-motion 用） */
export const D = { fb: 0.12, state: 0.22, layout: 0.38, hero: 0.64 };

export function prefersReduced() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** 进入/离开：上浮淡入。reduced 时只淡入。 */
export const rise = (reduced, y = 14, delay = 0) => ({
  initial: { opacity: 0, y: reduced ? 0 : y },
  animate: { opacity: 1, y: 0, transition: { duration: D.hero, ease: EASE, delay } },
  exit: { opacity: 0, y: reduced ? 0 : y / 2, transition: { duration: D.state, ease: EASE } },
});

/** 弹出面板：从锚点方向轻微放大。 */
export const pop = (reduced) => ({
  initial: { opacity: 0, scale: reduced ? 1 : 0.97, y: reduced ? 0 : 8 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: D.layout, ease: EASE } },
  exit: { opacity: 0, scale: reduced ? 1 : 0.98, transition: { duration: D.state, ease: EASE } },
});

/**
 * One-Euro Filter
 * 参考论文：Casiez et al., "1€ Filter: A Simple Speed-based Low-pass Filter
 * for Noisy Input in Interactive Systems" (UIST 2012)
 *
 * 核心思想：低通滤波截止频率随运动速度自适应
 * - 静止/慢速：低截止频率 → 强平滑（消抖）
 * - 快速移动：高截止频率 → 弱平滑（跟手）
 *
 * 相比 Lerp 的优势：
 * - Lerp 系数固定时：小即抖，大即卡；必须折中
 * - One-Euro：不需要折中，两端都好
 */

class LowPassFilter {
  constructor(alpha, initValue = 0) {
    this.y = initValue;
    this.s = initValue;
    this.alpha = alpha;
    this.initialized = false;
  }

  filter(value, alpha = this.alpha) {
    if (!this.initialized) {
      this.s = value;
      this.initialized = true;
    } else {
      this.s = alpha * value + (1 - alpha) * this.s;
    }
    this.y = value;
    return this.s;
  }

  lastValue() {
    return this.y;
  }
}

export class OneEuroFilter {
  /**
   * @param {number} minCutoff  最小截止频率（越小越平滑，但慢时迟钝）
   * @param {number} beta       速度影响系数（越大越跟手）
   * @param {number} dCutoff    导数滤波截止频率
   */
  constructor({ minCutoff = 1.0, beta = 0.007, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xFilter = new LowPassFilter(this.alpha(minCutoff));
    this.dxFilter = new LowPassFilter(this.alpha(dCutoff));
    this.lastTime = null;
  }

  alpha(cutoff, dt = 1 / 60) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(value, timestamp) {
    let dt = 1 / 60;
    if (this.lastTime != null) {
      dt = Math.max(0.001, (timestamp - this.lastTime) / 1000);
    }
    this.lastTime = timestamp;

    // 估计导数（变化率）
    const prev = this.xFilter.lastValue();
    const dx = this.xFilter.initialized ? (value - prev) / dt : 0;
    const edx = this.dxFilter.filter(dx, this.alpha(this.dCutoff, dt));

    // 根据速度动态计算截止频率
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.xFilter.filter(value, this.alpha(cutoff, dt));
  }

  reset() {
    this.xFilter = new LowPassFilter(this.alpha(this.minCutoff));
    this.dxFilter = new LowPassFilter(this.alpha(this.dCutoff));
    this.lastTime = null;
  }
}

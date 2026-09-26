import { Component } from 'react';

/**
 * 全局错误边界：渲染出错时不白屏，给一个能恢复的界面。
 * 全部内联样式，保证 CSS 没加载出来也能正常显示。
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, msg: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, msg: error?.message || String(error) };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] 渲染出错:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24, background: 'radial-gradient(ellipse at 50% 40%, #151032, #05040c)', color: '#f4efe3', fontFamily: "'Noto Serif SC', serif", zIndex: 99999 }}>
        <div style={{ fontSize: 26, color: '#e9cb8b', filter: 'drop-shadow(0 0 12px rgba(233,203,139,.6))', marginBottom: 14 }}>✦</div>
        <h2 style={{ fontSize: 20, letterSpacing: '0.16em', margin: '0 0 10px', fontWeight: 600 }}>星象暂时紊乱</h2>
        <p style={{ fontSize: 13, color: 'rgba(244,239,227,.6)', maxWidth: 340, lineHeight: 1.9, margin: '0 0 22px' }}>页面遇到了一点问题。重新加载即可恢复，占卜可以重新开始。</p>
        <button
          onClick={() => window.location.reload()}
          style={{ padding: '12px 36px', fontSize: 14, letterSpacing: '0.14em', color: '#fff9ea', cursor: 'pointer', borderRadius: 999, border: '1px solid rgba(233,203,139,.5)', background: 'linear-gradient(150deg, rgba(246,222,166,.4), rgba(184,145,74,.25))', boxShadow: 'inset 0 1px 1px rgba(255,246,220,.7)' }}
        >
          重新加载
        </button>
        {this.state.msg && (
          <details style={{ marginTop: 22, maxWidth: 420 }}>
            <summary style={{ fontSize: 11, color: 'rgba(244,239,227,.4)', cursor: 'pointer' }}>技术细节</summary>
            <pre style={{ fontSize: 11, color: 'rgba(244,239,227,.5)', whiteSpace: 'pre-wrap', textAlign: 'left', marginTop: 8 }}>{this.state.msg}</pre>
          </details>
        )}
      </div>
    );
  }
}

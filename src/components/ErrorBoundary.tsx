import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { hasError: boolean; message: string }

// 渲染期异常兜底：避免整个应用白屏，提供一键恢复。
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message || String(error) }
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#0b1020', color: '#e5e9f5', fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
        <div>
          <h2 style={{ margin: '0 0 8px' }}>页面出了一点问题</h2>
          <p style={{ margin: '0 0 16px', color: '#8b93a7' }}>遇到暂时性错误：{this.state.message}</p>
          <button onClick={() => location.reload()} style={{ padding: '8px 20px', borderRadius: 8, border: 0, background: '#3b82f6', color: '#fff', cursor: 'pointer' }}>重新加载</button>
        </div>
      </div>
    )
  }
}

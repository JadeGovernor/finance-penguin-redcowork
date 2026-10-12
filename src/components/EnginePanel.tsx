import { useState } from 'react'
import { DEEPSEEK_MODEL, getApiKey, getMode, isLive, setApiKey, setMode, type EngineMode } from '@/lib/engine'

/**
 * 运行模式面板：让评审一眼看懂这个纯前端应用有两种跑法。
 *  - 演示模式：完全离线，展示真实留档的行情与 AI 结论，保证任何网络环境下都能完整复现流程。
 *  - 在线模式：用户填入自己的 DeepSeek API Key（仅保存在本机浏览器），由浏览器直连官方接口实时生成。
 */
export default function EnginePanel() {
  const [open, setOpen] = useState(false)
  const [mode, setModeState] = useState<EngineMode>(getMode())
  const [keyDraft, setKeyDraft] = useState(getApiKey())
  const [notice, setNotice] = useState('')

  const live = isLive()

  const applyLive = () => {
    const key = keyDraft.trim()
    if (!key) {
      setNotice('请先填入 DeepSeek API Key，或继续使用演示模式。')
      return
    }
    setApiKey(key)
    setMode('live')
    setModeState('live')
    setNotice('已切换到在线模式：后续分析由浏览器直连 DeepSeek 实时生成。')
  }

  const applyDemo = () => {
    setMode('demo')
    setModeState('demo')
    setNotice('已切回演示模式：不再发起任何外部 AI 请求。')
  }

  return (
    <>
      <button
        className={`engine-chip ${live ? 'live' : 'demo'}`}
        onClick={() => { setNotice(''); setKeyDraft(getApiKey()); setModeState(getMode()); setOpen(true) }}
        title="查看 / 切换运行模式"
      >
        <span className="dot" />
        {live ? '在线模式' : '演示模式'}
      </button>

      {open && (
        <div className="engine-layer" onClick={() => setOpen(false)}>
          <div className="engine-modal" onClick={(event) => event.stopPropagation()}>
            <h2>运行模式</h2>
            <p className="engine-sub">
              这是一个<strong>纯前端</strong>作品，没有服务端。为了让评审在任何网络环境下都能完整跑通流程，
              它提供两种运行模式。
            </p>

            <div className={`engine-card ${mode === 'demo' ? 'active' : ''}`}>
              <div className="engine-card-head">
                <strong>演示模式（默认）</strong>
                <span className="engine-tag">离线可用</span>
              </div>
              <p>
                页面内置的行情快照与全部 AI 结论，都是<strong>真实产生后留档</strong>的结果（行情来自公开行情接口，
                分析由 {DEEPSEEK_MODEL} 生成）。行情与结论互相对应、互相自洽，不联网也能完整演示五步分析流程。
              </p>
              {mode !== 'demo' && <button className="btn secondary" onClick={applyDemo}>切回演示模式</button>}
            </div>

            <div className={`engine-card ${mode === 'live' ? 'active' : ''}`}>
              <div className="engine-card-head">
                <strong>在线模式</strong>
                <span className="engine-tag warn">需自备 Key</span>
              </div>
              <p>
                填入你自己的 DeepSeek API Key，由浏览器<strong>直连官方接口</strong>实时生成分析。
                Key 只写入本机浏览器的 localStorage，不会上传、不会写进代码或仓库，清空输入框即可移除。
              </p>
              <input
                className="engine-input"
                type="password"
                autoComplete="off"
                placeholder="sk-...（DeepSeek API Key）"
                value={keyDraft}
                onChange={(event) => { setKeyDraft(event.target.value); setNotice('') }}
              />
              <div className="engine-actions">
                <button className="btn primary" onClick={applyLive}>保存并启用在线模式</button>
                {getApiKey() && <button className="btn ghost" onClick={() => { setApiKey(''); setKeyDraft(''); setMode('demo'); setModeState('demo'); setNotice('已清除本机保存的 Key。') }}>清除 Key</button>}
              </div>
            </div>

            {notice && <p className="engine-notice">{notice}</p>}
            <p className="engine-foot">
              作品边界：所有输出仅为假设验证与学习训练用途，不构成投资建议；模型被要求如实声明信息缺口，禁止编造价格与公告。
            </p>
            <button className="btn ghost engine-close" onClick={() => setOpen(false)}>关闭</button>
          </div>
        </div>
      )}
    </>
  )
}

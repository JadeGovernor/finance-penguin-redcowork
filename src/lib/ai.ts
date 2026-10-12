import type { Quote } from './quotes'
import { apiPost } from './engine'

export type AnalysisMember = {
  key: 'bull' | 'bear' | 'risk' | 'judge' | 'system'
  label: string
  tone: string
  score: number
  summary: string
  conclusion: string
  analysis: string[]
  basis: string[]
  evidence: { id: string; name: string; date: string; url: string }[]
  gap: string
}

export type AnalysisCandidate = {
  code: string
  name: string
  role: string
  tags: string[]
  reason: string
  difference: string
  doubt: string
  price: number
  change: number
  score: number
}

export type AnalysisPlan = {
  entryPrice: number
  stopPrice: number
  takeRange: string
  initialPosition: string
  maxPosition: string
  focus: string[]
  satisfy: string[]
  reduce: string[]
  cancel: string[]
  pending: string[]
}

export type AnalysisResult = {
  interpretation: { subject: string; direction: string; horizon: string; catalyst: string; unknown: string }
  strategy: string
  candidates: AnalysisCandidate[]
  members: AnalysisMember[]
  scores: { label: string; value: number; help: string }[]
  verdict: { title: string; conclusion: string; score: number; deduction: string }
  plan: AnalysisPlan
  marketNote: string
}

export type AnalyzeOptions = {
  input: string
  mode: 'thesis' | 'stock'
  tradingSystem?: string
  quotes: Quote[]
  degraded?: boolean
  targetStock?: { code: string; name: string; price?: number; changePct?: number }
  unresolved?: boolean
  guide?: string
}

export async function runAnalysis(opts: AnalyzeOptions): Promise<AnalysisResult> {
  // 纯前端版本：由本地 AI 引擎处理（演示模式读留档结果 / 在线模式浏览器直连 DeepSeek）
  const res = await apiPost('/api/analyze', opts)
  let data: { result?: AnalysisResult; error?: string } = {}
  try { data = await res.json() } catch { /* ignore */ }
  if (!res.ok || data.error) throw new Error(data.error || `AI 服务返回异常（HTTP ${res.status}）`)
  if (!data.result) throw new Error('AI 服务返回内容为空，请重试。')
  return data.result
}

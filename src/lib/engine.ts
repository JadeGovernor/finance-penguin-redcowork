/* eslint-disable @typescript-eslint/no-explicit-any -- 本文件处理的输入包含模型返回的不可信 JSON，类型需在运行时逐字段校验，此处显式放宽 any 限制 */
// 纯前端 AI 引擎：把原服务端 server/proxy.mjs 的能力整体搬进浏览器。
//
// 两种模式：
//  - demo（默认）：完全离线。行情与 AI 输出都是真实产生后留档的快照，互相自洽，不依赖任何外部接口。
//  - live：用户在前端填入自己的 DeepSeek API Key，浏览器直连官方接口实时生成（key 只存在本机 localStorage）。
//
// 对外暴露 apiPost()，返回结构与 fetch Response 兼容（ok / status / json()），
// 使原有调用点的错误处理逻辑可以原样保留。
import {
  PORTFOLIO_SYSTEM_PROMPT,
  RESOLVE_BATCH_SYSTEM_PROMPT,
  RESOLVE_SYSTEM_PROMPT,
  REVIEW_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
} from './prompts'
import { DEMO_FIXTURES, DEMO_STOCK_NAMES, lookupDemoStock, parseDirectCode, pickDemoThesis } from './demo'
import { storageGet, storageRemove, storageSet } from './storage'

export const DEEPSEEK_MODEL = 'deepseek-v4-flash'
const ENDPOINT = 'https://api.deepseek.com/chat/completions'
const KEY_STORE = 'fp_ds_key'
const MODE_STORE = 'fp_mode'

export type EngineMode = 'demo' | 'live'

export function getApiKey(): string {
  return (storageGet(KEY_STORE) || '').trim()
}

export function setApiKey(value: string): void {
  const key = (value || '').trim()
  if (key) storageSet(KEY_STORE, key)
  else storageRemove(KEY_STORE)
}

export function getMode(): EngineMode {
  return storageGet(MODE_STORE) === 'live' ? 'live' : 'demo'
}

export function setMode(mode: EngineMode): void {
  storageSet(MODE_STORE, mode)
}

/** 在线模式可用的条件：用户显式切到 live 且填了 key */
export function isLive(): boolean {
  return getMode() === 'live' && !!getApiKey()
}

export type EngineResponse = { ok: boolean; status: number; json: () => Promise<any> }

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

type ChatOptions = {
  degraded?: boolean
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
}

// ---------------------------------------------------------------- 底层调用

type ChatResult =
  | { ok: true; content: string; model: string }
  | { ok: false; status: number; error: string }

async function chat(key: string, messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
  const payload: Record<string, unknown> = {
    model: DEEPSEEK_MODEL,
    messages,
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.maxTokens ?? (opts.degraded ? 3000 : 10000),
    response_format: { type: 'json_object' },
  }
  const timeoutMs = opts.timeoutMs ?? 180_000
  const send = () =>
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    })

  let res: Response
  try {
    res = await send()
    if (res.status === 400) {
      // 个别模型不支持 response_format：去掉后重试一次
      delete payload.response_format
      res = await send()
    }
  } catch (err) {
    const name = err instanceof DOMException ? err.name : ''
    if (name === 'TimeoutError') return { ok: false, status: 504, error: 'DeepSeek 响应超时（超过 3 分钟），请重试。' }
    if (name === 'AbortError') return { ok: false, status: 504, error: '请求已取消。' }
    return {
      ok: false,
      status: 502,
      error: '无法连接 DeepSeek 接口（可能是网络或浏览器跨域限制）。可切回演示模式，或在设置中确认 Key 是否有效。',
    }
  }

  let data: any = null
  try {
    data = await res.json()
  } catch {
    return { ok: false, status: res.status, error: `DeepSeek 返回内容不是合法 JSON（HTTP ${res.status}）。` }
  }
  if (!res.ok) {
    return { ok: false, status: res.status, error: `DeepSeek 接口错误（${res.status}）：${data?.error?.message || '未知错误'}` }
  }
  const content: string = data?.choices?.[0]?.message?.content || ''
  if (!content) return { ok: false, status: 502, error: 'DeepSeek 返回内容为空，请重试。' }
  return { ok: true, content, model: data?.model || DEEPSEEK_MODEL }
}

/** 容错解析：去掉代码围栏、注释与尾逗号（模型偶尔会输出"漂亮的" JSON） */
function extractJson<T = any>(content: string): T | null {
  let cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  cleaned = cleaned.slice(start, end + 1)
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1')
  try {
    return JSON.parse(cleaned) as T
  } catch {
    return null
  }
}

/** 调用模型并解析为 JSON；解析失败自动重试一次（模型偶发格式异常） */
async function chatJson<T = any>(key: string, messages: ChatMessage[], opts: ChatOptions = {}): Promise<
  { ok: true; parsed: T; model: string } | { ok: false; status: number; error: string }
> {
  let lastError = 'AI 返回内容无法解析为 JSON，请重试。'
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await chat(key, messages, opts)
    if (!out.ok) return out
    const parsed = extractJson<T>(out.content)
    if (parsed) return { ok: true, parsed, model: out.model }
    lastError = 'AI 返回内容无法解析为 JSON，请重试。'
  }
  return { ok: false, status: 502, error: lastError }
}

// ---------------------------------------------------------------- 提示词组装

function nowCN(): string {
  return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
}

function currentYearMonth(): string {
  const d = new Date()
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`
}

function buildUserPrompt(body: any): string {
  const { input, mode, tradingSystem, quotes, degraded, targetStock, unresolved, guide } = body || {}
  const lines = [`用户输入（${mode === 'stock' ? '指定个股' : '市场观点'}）：${input}`]
  if (guide) lines.push(`用户引导确认（用户点选的判断与关注点，分析需围绕这些展开）：${guide}`)
  if (tradingSystem) lines.push(`用户保存的交易系统原文：${tradingSystem}`)
  if (targetStock?.code) {
    lines.push(
      unresolved
        ? `已解析目标个股（但未能获取其实时行情）：${targetStock.name}（${targetStock.code}）`
        : `指定个股（已解析，其行情已含于下方快照）：${targetStock.name}（${targetStock.code}）`,
    )
  }
  if (unresolved) {
    lines.push(
      '⚠️ AI 直判模式：未能获取目标股票的实时行情（名称无法识别或行情源无数据）。本模式覆盖系统规则 3：请根据你的知识自行判断用户输入最可能指代的 A 股（允许纠正明显错别字、模糊简称），直接给出结构化分析；候选列表可基于你的知识生成，把最可能的一只放首位，再配 1~2 只对照；若完全无法确定对应标的，请在第一只候选 name 中写明「待确认标的」并在 analysis/unknown 中说明原因，不要硬编造股票代码。',
    )
    lines.push(
      `注意：当前是 ${currentYearMonth()}，A 股常有新上市公司。不要凭你的旧知识断言某公司「未上市」；无法确认时写「无法确认对应标的」并说明可能是错别字、简称或新上市，而不是断言其不存在。`,
    )
    lines.push(
      '实时价格约束：你没有实时行情时，candidates 的 price/change 一律填 0，plan 的 entryPrice/stopPrice 填 0、takeRange 写「待行情确认」，并在 reason 或 marketNote 中注明「未获取实时行情，价格未验证」；禁止虚构任何价格与涨跌幅。',
    )
  }
  lines.push(`实时行情快照（JSON）：${JSON.stringify(quotes || [])}`)
  lines.push(`当前时间：${nowCN()}`)
  if (degraded) lines.push('当前处于轻量模式：请使用更精炼的语言，每条结论不超过 2 句话，减少篇幅。')
  return lines.join('\n')
}

function buildPortfolioPrompt(body: any): string {
  const { items, quotes, tradingSystem } = body || {}
  return [
    `用户组合名单（JSON）：${JSON.stringify(items || [])}`,
    `实时行情快照（JSON）：${JSON.stringify(quotes || [])}`,
    `用户交易系统：${tradingSystem || '未提供'}`,
    `当前时间：${nowCN()}`,
  ].join('\n')
}

function buildReviewPrompt(body: any): string {
  const { mode, targetName, archive, items, quotes, tradingSystem, operation, reason, result, pnl, question, guide } = body || {}
  const plan = archive
    ? { entryPrice: archive.entryPrice, stopPrice: archive.stopPrice, takeRange: archive.takeRange, initialPosition: archive.initialPosition, maxPosition: archive.maxPosition }
    : null
  const lines = [
    `复盘对象：${mode === 'stock' ? `个股「${targetName}」` : `组合（${items?.length || 0} 只）`}`,
    `原观察计划（JSON）：${plan ? JSON.stringify(plan) : '未提供'}`,
    `用户实际操作：${operation || '未填写'}`,
    `当时判断：${reason || '未填写'}`,
    `盈亏结果：${result || ''}${pnl ? `（${pnl}）` : ''}`,
    `用户问题：${question || '未填写'}`,
    `实时行情快照（JSON）：${JSON.stringify(quotes || [])}`,
    `用户交易系统：${tradingSystem || '未提供'}`,
    `当前时间：${nowCN()}`,
  ]
  // 与线上一致：引导确认插在「原观察计划」之后
  if (guide) lines.splice(2, 0, `用户引导确认（用户点选的分类与自定义说明，复盘需围绕这些确认展开）：${guide}`)
  return lines.join('\n')
}

// ---------------------------------------------------------------- 股票识别（在线模式）

type Suggestion = { code: string; name: string }

/** 腾讯 smartbox 名称联想：跨域无 CORS 头，用 JSONP（该接口返回 v_hint="..." 变量赋值） */
function jsonpLookup(keyword: string, timeoutMs = 8000): Promise<Suggestion[]> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve([])
    const varName = `v_hint_${Math.random().toString(36).slice(2)}`
    const script = document.createElement('script')
    let done = false
    const finish = (list: Suggestion[]) => {
      if (done) return
      done = true
      try { delete (window as any)[varName] } catch { /* ignore */ }
      script.remove()
      resolve(list)
    }
    const timer = window.setTimeout(() => finish([]), timeoutMs)
    // 该接口固定写全局变量名 v_hint：包一层同名变量接收后转存
    ;(window as any).v_hint = ''
    script.onload = () => {
      window.clearTimeout(timer)
      const raw = String((window as any).v_hint || '')
      const list: Suggestion[] = []
      try {
        const unescaped = raw.replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
        for (const chunk of unescaped.split('^')) {
          const f = chunk.split('~')
          if (f.length < 3) continue
          const market = f[0].toLowerCase()
          const code6 = f[1]
          const name = f[2]
          if (!/^\d{6}$/.test(code6)) continue
          if (!['sz', 'sh', 'bj'].includes(market)) continue
          list.push({ code: `${code6}.${market.toUpperCase()}`, name })
        }
      } catch { /* ignore */ }
      finish(list)
    }
    script.onerror = () => { window.clearTimeout(timer); finish([]) }
    script.src = `https://smartbox.gtimg.cn/s3/?q=${encodeURIComponent(keyword)}&t=all&_=${Date.now()}`
    document.head.appendChild(script)
  })
}

type ResolveGuess = { name?: string; code?: string }

async function aiResolveSingle(key: string, text: string): Promise<ResolveGuess | null> {
  const out = await chatJson<ResolveGuess>(
    key,
    [
      { role: 'system', content: RESOLVE_SYSTEM_PROMPT },
      { role: 'user', content: `用户输入：${text}` },
    ],
    { temperature: 0, maxTokens: 300, timeoutMs: 30_000 },
  )
  return out.ok ? out.parsed || null : null
}

async function aiResolveBatch(key: string, inputs: string[]): Promise<Array<ResolveGuess & { input?: string }>> {
  const out = await chatJson<{ results?: Array<ResolveGuess & { input?: string }> }>(
    key,
    [
      { role: 'system', content: RESOLVE_BATCH_SYSTEM_PROMPT },
      { role: 'user', content: `待识别输入（每行一个）：\n${inputs.join('\n')}` },
    ],
    { temperature: 0.2, maxTokens: 1200, timeoutMs: 45_000 },
  )
  return out.ok && Array.isArray(out.parsed?.results) ? out.parsed!.results : []
}

/**
 * 名称 → 代码只认公开联想接口的结果，不采信模型直接给出的代码，避免编造代码/错配标的。
 * 模型在这里只承担一件事：把错别字、谐音、简称纠正成一个能查到的规范名称。
 */
async function confirmByName(candidates: string[]): Promise<Suggestion | null> {
  for (const candidate of candidates) {
    const name = String(candidate || '').trim()
    if (!name) continue
    const list = await jsonpLookup(name)
    if (list.length) return list[0]
  }
  return null
}

function namedCandidates(guess: ResolveGuess | undefined, input: string): string[] {
  const corrected = String(guess?.name || '').trim()
  return corrected && corrected !== input.trim() ? [corrected, input.trim()] : [input.trim()]
}

// ---------------------------------------------------------------- 演示模式

function demoResponse(path: string, body: any): { status: number; payload: any } {
  if (path === '/api/analyze') {
    const fixture = body?.mode === 'stock' ? DEMO_FIXTURES.stock : pickDemoThesis(String(body?.input || ''))
    return { status: 200, payload: { result: fixture, model: `${DEEPSEEK_MODEL}（演示留档）` } }
  }
  if (path === '/api/portfolio') {
    return { status: 200, payload: { result: DEMO_FIXTURES.portfolio, model: `${DEEPSEEK_MODEL}（演示留档）` } }
  }
  if (path === '/api/review') {
    return { status: 200, payload: { result: DEMO_FIXTURES.review, model: `${DEEPSEEK_MODEL}（演示留档）` } }
  }
  if (path === '/api/resolve') {
    const hit = lookupDemoStock(String(body?.input || ''))
    if (hit) return { status: 200, payload: { ...hit, source: 'demo' } }
    return { status: 404, payload: { error: `演示模式为离线运行，只内置了 ${DEMO_STOCK_NAMES.slice(0, 6).join('、')} 等示例标的；请直接输入 6 位代码，或切换到在线模式。` } }
  }
  if (path === '/api/resolve-batch') {
    const inputs = Array.isArray(body?.inputs) ? body.inputs : []
    const results = inputs.map((input: string) => {
      const hit = lookupDemoStock(String(input || ''))
      return hit
        ? { input, ok: true, code: hit.code, name: hit.name, source: 'demo' }
        : { input, ok: false }
    })
    return { status: 200, payload: { results } }
  }
  return { status: 404, payload: { error: `未知接口：${path}` } }
}

// ---------------------------------------------------------------- 对外入口

export type ApiPath = '/api/analyze' | '/api/resolve' | '/api/resolve-batch' | '/api/portfolio' | '/api/review'

function respond(status: number, payload: any): EngineResponse {
  return { ok: status >= 200 && status < 300, status, json: async () => payload }
}

/**
 * 统一入口：把原来指向服务端 /api/* 的请求改为前端处理。
 * 返回结构与 Response 兼容，调用点无需改动错误处理。
 */
export async function apiPost(path: ApiPath, body: any): Promise<EngineResponse> {
  if (!isLive()) {
    const { status, payload } = demoResponse(path, body)
    return respond(status, payload)
  }
  const key = getApiKey()

  if (path === '/api/resolve') {
    const input = String(body?.input || '').trim()
    if (!input) return respond(400, { error: '缺少输入内容' })
    const direct = parseDirectCode(input)
    if (direct) return respond(200, { ...direct, source: 'direct' })
    const hit = await confirmByName(namedCandidates((await aiResolveSingle(key, input)) || undefined, input))
    if (hit) return respond(200, { ...hit, source: 'deepseek' })
    return respond(404, { error: `未能识别「${input}」对应的股票。请直接输入 6 位代码（如 688017）重试，或换个更常见的名称。` })
  }

  if (path === '/api/resolve-batch') {
    const inputs: string[] = (Array.isArray(body?.inputs) ? body.inputs : []).map((i: unknown) => String(i || '').trim()).filter(Boolean)
    if (!inputs.length) return respond(400, { error: '缺少输入内容' })
    const results: any[] = []
    const pending: string[] = []
    for (const input of inputs) {
      const direct = parseDirectCode(input)
      if (direct) {
        results.push({ input, ok: true, code: direct.code, name: direct.name, source: 'direct' })
      } else {
        pending.push(input)
      }
    }
    // 待识别的批量项只用一次模型调用纠正名称，降低在线模式的 token 消耗
    const guesses = pending.length ? await aiResolveBatch(key, pending) : []
    for (const input of pending) {
      const guess = guesses.find((g) => String(g?.input || '').trim() === input)
      const hit = await confirmByName(namedCandidates(guess, input))
      results.push(hit ? { input, ok: true, code: hit.code, name: hit.name, source: 'deepseek' } : { input, ok: false })
    }
    return respond(200, { results })
  }

  if (path === '/api/analyze') {
    if (!body?.input || String(body.input).trim().length < 2) return respond(400, { error: '缺少输入内容' })
    const out = await chatJson(
      key,
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(body) },
      ],
      { degraded: Boolean(body?.degraded) },
    )
    if (!out.ok) return respond(out.status, { error: out.error })
    return respond(200, { result: out.parsed, model: out.model })
  }

  if (path === '/api/portfolio') {
    if (!Array.isArray(body?.items) || body.items.length < 2) return respond(400, { error: '至少需要 2 只股票才能做组合体检。' })
    const out = await chatJson(
      key,
      [
        { role: 'system', content: PORTFOLIO_SYSTEM_PROMPT },
        { role: 'user', content: buildPortfolioPrompt(body) },
      ],
      { degraded: Boolean(body?.degraded) },
    )
    if (!out.ok) return respond(out.status, { error: out.error })
    return respond(200, { result: out.parsed, model: out.model })
  }

  if (path === '/api/review') {
    const out = await chatJson(
      key,
      [
        { role: 'system', content: REVIEW_SYSTEM_PROMPT },
        { role: 'user', content: buildReviewPrompt(body) },
      ],
      { degraded: Boolean(body?.degraded) },
    )
    if (!out.ok) return respond(out.status, { error: out.error })
    return respond(200, { result: out.parsed, model: out.model })
  }

  return respond(404, { error: `未知接口：${path}` })
}

/** 演示模式下前端展示用的模式说明 */
export function engineStatusText(): string {
  return isLive() ? `在线模式 · ${DEEPSEEK_MODEL} 实时生成` : '演示模式 · 真实留档结果（离线可用）'
}

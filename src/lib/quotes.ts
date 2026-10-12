// 免费实时行情（纯前端版）
//
// 主源：腾讯 qt.gtimg.cn（返回 GBK 文本，浏览器可直接跨域读取，已实测带 access-control-allow-origin: *）
// 备源：东方财富 push2（历史可用，但依赖网络环境，失败即跳过）
// 兜底：演示行情快照——任何外部行情源都不可用时，页面仍然可用，并如实标注数据时间。
import { DEMO_QUOTES } from './demo'
import { isLive } from './engine'

export type Quote = {
  code: string // 600519.SH
  name: string
  price: number // 最新价（元）
  changePct: number // 涨跌幅 %
  updatedAt: number // 抓取时间戳
}

export function normalizeCode(code: string): string {
  const m = code.toUpperCase().match(/^(\d{6})\.(SH|SZ|BJ)$/)
  if (m) return `${m[2].toLowerCase()}${m[1]}`
  const m2 = code.toUpperCase().match(/^(\d{6})$/)
  if (m2) return `${code.startsWith('6') ? 'sh' : 'sz'}${m2[1]}`
  return code.toLowerCase()
}

// 名称模糊匹配：忽略空格与 -W/-U/-N 等后缀（如「宇树科技」≈「宇树科技-W」）
export function stockNameMatch(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, '').replace(/-[A-Za-z0-9]+$/g, '').toLowerCase()
  const x = norm(a)
  const y = norm(b)
  if (!x || !y) return false
  return x === y || x.includes(y) || y.includes(x)
}

export function toEastmoneySecid(code: string): string {
  const m = code.toUpperCase().match(/^(\d{6})\.(SH|SZ|BJ)$/)
  if (!m) return ''
  return `${m[2] === 'SH' ? 1 : 0}.${m[1]}`
}

/** 腾讯行情：一次请求多只，GBK 解码 */
async function fetchQuotesTencent(codes: string[]): Promise<Record<string, Quote>> {
  const result: Record<string, Quote> = {}
  const normalized = codes.map(normalizeCode).filter((c) => /^(sh|sz|bj)\d{6}$/.test(c))
  if (!normalized.length) return result
  const res = await fetch(`https://qt.gtimg.cn/q=${normalized.join(',')}&_=${Date.now()}`, {
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) return result
  const buf = new Uint8Array(await res.arrayBuffer())
  let text = ''
  try {
    text = new TextDecoder('gbk').decode(buf)
  } catch {
    text = new TextDecoder('utf-8').decode(buf)
  }
  const now = Date.now()
  for (const line of text.split(';')) {
    const m = line.match(/v_([a-z]{2}\d{6})="([^"]*)"/)
    if (!m) continue
    const f = m[2].split('~')
    const price = Number(f[3])
    if (!price) continue
    const market = m[1].startsWith('sh') ? 'SH' : m[1].startsWith('bj') ? 'BJ' : 'SZ'
    const code = `${m[1].slice(2)}.${market}`
    // 涨跌幅取接口自带的第 33 个字段（避免用昨收自算的误差）
    const changePct = f[32] !== undefined && f[32] !== '' ? Number(f[32]) : 0
    result[code] = { code, name: f[1] || code, price, changePct: Number.isFinite(changePct) ? changePct : 0, updatedAt: now }
  }
  return result
}

/** 东方财富行情（备源） */
async function fetchQuotesEastmoney(codes: string[]): Promise<Record<string, Quote>> {
  const result: Record<string, Quote> = {}
  const secids = codes.map(toEastmoneySecid).filter(Boolean)
  if (!secids.length) return result
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?secids=${secids.join(',')}&fields=f2,f3,f4,f12,f13,f14&fltt=2`
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) })
  if (!res.ok) return result
  const json = await res.json()
  const diff: Array<{ f2?: number; f3?: number; f12?: string; f13?: number; f14?: string }> = json?.data?.diff ?? []
  const now = Date.now()
  for (const item of diff) {
    if (!item.f12) continue
    const market = item.f13 === 1 ? 'SH' : item.f13 === 0 ? 'SZ' : 'BJ'
    const code = `${item.f12}.${market}`
    if (!codes.includes(code)) continue
    result[code] = { code, name: item.f14 || code, price: Number(item.f2) || 0, changePct: Number(item.f3) || 0, updatedAt: now }
  }
  return result
}

/** 全部外部行情源都不可用时，用演示快照兜底，保证页面可用 */
function snapshotQuotes(codes: string[]): Record<string, Quote> {
  const result: Record<string, Quote> = {}
  for (const code of codes) {
    const hit = DEMO_QUOTES.find((q) => q.code === code)
    if (hit) result[code] = hit
  }
  return result
}

export async function fetchQuotes(codes: string[]): Promise<Record<string, Quote>> {
  const list = codes.filter(Boolean)
  if (!list.length) return {}

  const result: Record<string, Quote> = {}
  const missing: string[] = []

  // 演示模式下优先用留档快照，保证行情与内置 AI 结论处在同一次快照上，互相自洽。
  if (!isLive()) {
    for (const code of list) {
      const hit = DEMO_QUOTES.find((q) => q.code === code)
      if (hit) result[code] = hit
      else missing.push(code)
    }
  } else {
    missing.push(...list)
  }
  if (!missing.length) return result

  let fetched: Record<string, Quote> = {}
  try {
    fetched = await fetchQuotesTencent(missing)
  } catch { /* 继续备源 */ }
  if (!Object.keys(fetched).length) {
    try {
      fetched = await fetchQuotesEastmoney(missing)
    } catch { /* 继续兜底 */ }
  }
  if (!Object.keys(fetched).length) fetched = snapshotQuotes(missing)
  return { ...result, ...fetched }
}

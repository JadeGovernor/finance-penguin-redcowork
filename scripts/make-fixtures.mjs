// 生成「演示模式」内置结果：调用原服务端的真实 DeepSeek 接口，把结果留档成 fixture。
// 前提：原项目服务端已在 http://127.0.0.1:8787 运行（cd "finance penguin" && node server/proxy.mjs）
import fs from 'node:fs'

const BASE = 'http://127.0.0.1:8787'
const OUT = 'src/lib/fixtures'
fs.mkdirSync(OUT, { recursive: true })

const CODES = ['000977.SZ', '300308.SZ', '002837.SZ', '600519.SH', '688836.SH', '688017.SH']

async function fetchQuotes(codes) {
  const q = codes.map((c) => `${c.slice(-2).toLowerCase()}${c.slice(0, 6)}`).join(',')
  const res = await fetch(`https://qt.gtimg.cn/q=${q}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  const text = new TextDecoder('gbk').decode(buf)
  const now = Date.now()
  const out = []
  for (const line of text.split('\n')) {
    const m = line.match(/v_[a-z]{2}(\d{6})="([^"]*)"/)
    if (!m) continue
    const f = m[2].split('~')
    if (!f[1] || !f[3]) continue
    const code = codes.find((c) => c.startsWith(m[1]))
    out.push({ code, name: f[1], price: Number(f[3]), changePct: Number(f[32] || 0), updatedAt: now })
  }
  return out
}

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(240_000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error) throw new Error(`${path} 失败: ${data.error || res.status}`)
  return data.result
}

const quotes = await fetchQuotes(CODES)
console.log('行情快照:', quotes.map((q) => `${q.name} ${q.price}`).join(' | '))
if (quotes.length < 4) throw new Error('行情抓取不足，终止')

const jobs = JSON.parse(process.argv[2] || '[]')
for (const job of jobs) {
  console.log('→ 生成', job.file, '...')
  const t0 = Date.now()
  const result = await post(job.path, { ...job.body, quotes, guide: job.body.guide })
  fs.writeFileSync(`${OUT}/${job.file}`, JSON.stringify(result, null, 1))
  console.log('   ok', ((Date.now() - t0) / 1000).toFixed(1) + 's ->', `${OUT}/${job.file}`)
}
console.log('done')

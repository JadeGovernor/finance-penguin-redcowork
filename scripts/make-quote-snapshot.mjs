// 抓取演示行情池快照并固化到 src/lib/fixtures/quotes.json，
// 供「演示模式」离线使用（与 fixture 生成时的行情保持一致）。
import fs from 'node:fs'
const CODES = ['000977.SZ', '300308.SZ', '002837.SZ', '600519.SH', '688836.SH', '688017.SH']
const q = CODES.map((c) => `${c.slice(-2).toLowerCase()}${c.slice(0, 6)}`).join(',')
const res = await fetch(`https://qt.gtimg.cn/q=${q}`)
const text = new TextDecoder('gbk').decode(new Uint8Array(await res.arrayBuffer()))
const now = Date.now()
const out = []
for (const line of text.split('\n')) {
  const m = line.match(/v_[a-z]{2}(\d{6})="([^"]*)"/)
  if (!m) continue
  const f = m[2].split('~')
  if (!f[1] || !f[3]) continue
  out.push({ code: CODES.find((c) => c.startsWith(m[1])), name: f[1], price: Number(f[3]), changePct: Number(f[32] || 0), updatedAt: now })
}
fs.mkdirSync('src/lib/fixtures', { recursive: true })
fs.writeFileSync('src/lib/fixtures/quotes.json', JSON.stringify(out, null, 1))
console.log(out.map((x) => `${x.name} ${x.price} (${x.changePct}%)`).join(' | '))

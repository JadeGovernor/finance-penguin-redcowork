import fs from 'node:fs'

const src = fs.readFileSync('../finance penguin/server/proxy.mjs', 'utf8')

function grab(name) {
  const re = new RegExp('const ' + name + ' = `([\\s\\S]*?)`\\n', 'm')
  const m = src.match(re)
  if (!m) throw new Error('missing ' + name)
  return m[1]
}

const quoted = src.match(/content: '([^']*)'/g) || []
const inner = (s) => s.replace(/^content: '/, '').replace(/'$/, '').trim()
const resolved = quoted.map(inner)
const single = resolved.find((s) => s.includes('你是 A 股股票识别器') && !s.includes('results'))
const batch = resolved.find((s) => s.includes('你是 A 股股票识别器') && s.includes('results'))
if (!single || !batch) throw new Error('resolve prompts not found')

const out = `// 本文件由 scripts/extract-prompts.mjs 从原服务端 server/proxy.mjs 自动提取，
// 保证提示词与已验证版本逐字一致。纯前端版本：字符串直接打进 bundle，不含任何密钥。

export const SYSTEM_PROMPT = \`${grab('SYSTEM_PROMPT')}\`

export const PORTFOLIO_SYSTEM_PROMPT = \`${grab('PORTFOLIO_SYSTEM_PROMPT')}\`

export const REVIEW_SYSTEM_PROMPT = \`${grab('REVIEW_SYSTEM_PROMPT')}\`

export const RESOLVE_SYSTEM_PROMPT = ${JSON.stringify(single)}

export const RESOLVE_BATCH_SYSTEM_PROMPT = ${JSON.stringify(batch)}
`
fs.writeFileSync('src/lib/prompts.ts', out)
console.log('written bytes:', out.length)
console.log('exports:', (out.match(/export const \w+/g) || []).join(', '))

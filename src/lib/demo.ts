// 演示模式（Demo Mode）内置数据。
//
// 这里的行情快照与 AI 输出**都是真实产生的**：行情来自公开行情接口的真实快照，
// 分析结果由 DeepSeek 真实生成后留档（见 scripts/make-fixtures.mjs）。
// 因此演示模式完全离线自洽：行情与结论互相对应，不依赖任何外部接口，也不会编造数字。
import demoQuotesRaw from './fixtures/quotes.json'
import analyzeThesis from './fixtures/analyze-thesis.json'
import analyzeThesisConsumer from './fixtures/analyze-thesis-consumer.json'
import analyzeThesisRobot from './fixtures/analyze-thesis-robot.json'
import analyzeStock from './fixtures/analyze-stock.json'
import portfolioFixture from './fixtures/portfolio.json'
import reviewFixture from './fixtures/review.json'
import type { Quote } from './quotes'

/** 演示模式使用的真实行情快照（与下方 AI 结论为同一次生成，互相自洽） */
export const DEMO_QUOTES: Quote[] = demoQuotesRaw as Quote[]

/** 演示模式的生成时间（用于页面明确标注数据时间） */
export const DEMO_SNAPSHOT_AT = new Date(DEMO_QUOTES[0]?.updatedAt ?? Date.now())

export const DEMO_FIXTURES = {
  thesis: analyzeThesis,
  stock: analyzeStock,
  portfolio: portfolioFixture,
  review: reviewFixture,
}

/**
 * 演示模式的三个「市场观点」留档场景。
 * 三者都是真实调用 DeepSeek 生成后留档的结果，主题不同、候选不同，
 * 离线时按用户输入的关键词匹配，避免"输入什么都是同一个答案"。
 */
export const DEMO_THESIS_SCENARIOS: Array<{
  key: string
  label: string
  input: string
  keywords: string[]
  fixture: typeof analyzeThesis
}> = [
  {
    key: 'ai',
    label: 'AI 基础设施资本开支',
    input: '我认为未来一年 AI 基础设施资本开支仍会增长，想寻找真正受益、但市场定价存在差异的 A 股公司。',
    keywords: ['ai', '算力', '资本开支', '光模块', '液冷', '服务器', '数据中心', 'gpu', '英伟达', '云计算', '互联', '温控'],
    fixture: analyzeThesis,
  },
  {
    key: 'consumer',
    label: '白酒板块估值修复',
    input: '我认为白酒板块经历长时间调整后，龙头公司估值回到历史低位，想验证消费复苏带来的估值修复机会。',
    keywords: ['白酒', '消费', '食品', '饮料', '茅台', '五粮液', '估值修复', '复苏', '低估', '防御', '红利', '蓝筹'],
    fixture: analyzeThesisConsumer,
  },
  {
    key: 'robot',
    label: '人形机器人零部件',
    input: '人形机器人量产在即，我想验证减速器与核心零部件国产替代链条上真正受益的 A 股公司。',
    keywords: ['机器人', '人形', '减速器', '谐波', '零部件', '国产替代', '自动化', '特斯拉', '智能制造', '丝杠', '电机'],
    fixture: analyzeThesisRobot,
  },
]

/** 按关键词命中数量挑选最接近的留档场景，都不命中时回落到第一个 */
export function pickDemoThesis(input: string): typeof analyzeThesis {
  const text = String(input || '').toLowerCase()
  let best = DEMO_THESIS_SCENARIOS[0]
  let bestScore = 0
  for (const scenario of DEMO_THESIS_SCENARIOS) {
    const score = scenario.keywords.reduce((n, word) => n + (text.includes(word) ? 1 : 0), 0)
    if (score > bestScore) { best = scenario; bestScore = score }
  }
  return best.fixture
}

/** 演示模式内置的股票词典：模式为离线，无法调用识别模型，只覆盖示例标的与常见 A 股。 */
const DEMO_STOCK_TABLE: Array<[string, string, string]> = [
  ['中际旭创', '300308.SZ', 'SZ'],
  ['浪潮信息', '000977.SZ', 'SZ'],
  ['英维克', '002837.SZ', 'SZ'],
  ['贵州茅台', '600519.SH', 'SH'],
  ['宇树科技', '688836.SH', 'SH'],
  ['绿的谐波', '688017.SH', 'SH'],
  ['宁德时代', '300750.SZ', 'SZ'],
  ['比亚迪', '002594.SZ', 'SZ'],
  ['招商银行', '600036.SH', 'SH'],
  ['中国平安', '601318.SH', 'SH'],
  ['五粮液', '000858.SZ', 'SZ'],
  ['美的集团', '000333.SZ', 'SZ'],
  ['立讯精密', '002475.SZ', 'SZ'],
  ['工业富联', '601138.SH', 'SH'],
  ['科大讯飞', '002230.SZ', 'SZ'],
  ['中芯国际', '688981.SH', 'SH'],
  ['寒武纪', '688256.SH', 'SH'],
  ['紫金矿业', '601899.SH', 'SH'],
  ['长江电力', '600900.SH', 'SH'],
  ['恒瑞医药', '600276.SH', 'SH'],
]

function normalizeName(s: string): string {
  return String(s || '').replace(/\s+/g, '').replace(/-[A-Za-z0-9]+$/, '').toLowerCase()
}

function marketSuffix(code: string): string {
  if (/^[68]/.test(code)) return 'SH'
  if (/^[49]/.test(code)) return 'BJ'
  return 'SZ'
}

/** 6 位代码 → 带市场后缀（如 300308 → 300308.SZ） */
export function normalizeSix(code: string): string {
  return `${code}.${marketSuffix(code)}`
}

/** 纯 6 位代码或带后缀代码 */
export function parseDirectCode(text: string): { code: string; name: string } | null {
  const clean = String(text || '').trim().toUpperCase()
  const m = clean.match(/^(\d{6})(?:\.(SH|SZ|BJ))?$/)
  if (!m) return null
  return { code: m[2] ? `${m[1]}.${m[2]}` : normalizeSix(m[1]), name: clean }
}

/** 演示模式的离线股票识别（先精确匹配，再包含匹配） */
export function lookupDemoStock(text: string): { code: string; name: string } | null {
  const direct = parseDirectCode(text)
  if (direct) return direct
  const needle = normalizeName(text)
  if (!needle) return null
  let fuzzy: { code: string; name: string } | null = null
  for (const [name, code] of DEMO_STOCK_TABLE) {
    const norm = normalizeName(name)
    if (norm === needle) return { code, name }
    if (!fuzzy && (norm.includes(needle) || needle.includes(norm))) fuzzy = { code, name }
  }
  return fuzzy
}

/** 演示模式可识别的标的名字，用于给用户提示 */
export const DEMO_STOCK_NAMES = DEMO_STOCK_TABLE.map(([name]) => name)

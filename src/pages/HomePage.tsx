import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, Archive, BadgeCheck, BrainCircuit, CalendarClock,
  Check, CheckCircle2, ChevronDown, ChevronRight, CircleDot, ClipboardCheck, Clock3, Database, FileSearch, FileText,
  FolderOpen, Gavel, Info, Layers3, Menu, Pencil, PieChart, Plus, RefreshCw, Scale, Search, ShieldCheck,
  ShieldQuestion, Star, Target, Trash2, TrendingDown, TrendingUp, X,
} from 'lucide-react'

import { fetchQuotes, stockNameMatch, type Quote } from '@/lib/quotes'
import { runAnalysis, type AnalysisResult, type AnalysisMember } from '@/lib/ai'
import { resolveStock } from '@/lib/resolve'
import { getPlan, trackAnalysis, tryUsePremium, upgradePlan, premiumRemaining, FREE_PREMIUM_QUOTA, PLUS_PREMIUM_QUOTA, type PlanState } from '@/lib/plan'
import { storageGet, storageSet, storageRemove } from '@/lib/storage'
import { apiPost, engineStatusText } from '@/lib/engine'
import { DEMO_THESIS_SCENARIOS } from '@/lib/demo'
import EnginePanel from '@/components/EnginePanel'

type EntryMode = 'thesis' | 'stock'
type Stage = 'input' | 'candidates' | 'committee' | 'verdict'
type View = 'assistant' | 'portfolio' | 'review' | 'archives'
type ArchiveRecord = {
  id: string; taskTitle?: string; code: string; name: string; query: string; subject: string; verdict: string;
  score: number; price: number; createdAt: string; updatedAt: string; expiresAt: string;
  entryPrice?: number; stopPrice?: number; takeRange: string; initialPosition?: string; maxPosition?: string;
  tradingSystemText?: string; tradingSystemUpdatedAt?: string; systemVerdict?: string;
  stopRange?: string; members?: AnalysisMember[]; marketNote?: string; status: '有效' | '即将过期' | '已过期';
}
type TradingSystem = { text: string; updatedAt: string }
type PortfolioItem = {
  code: string; name: string; weight: number; source: '档案' | '手动'; addedAt: string;
}
type ReviewMode = 'stock' | 'portfolio'
type ReviewRecord = {
  id: string; mode: ReviewMode; title: string; result: string; pnl: string; source?: string; createdAt: string;
  operation?: string; reason?: string; question?: string; archiveId?: string; pinned?: boolean; customTitle?: string;
}
type Candidate = {
  code: string; name: string; role: string; tags: string[]; reason: string;
  difference: string; doubt: string; price: number; change: number; score: number;
}

type Scenario = {
  input: string
  interpretation: { subject: string; direction: string; horizon: string; catalyst: string; unknown: string }
  strategy: string
  candidates: Candidate[]
}

const themeScenario: Scenario = {
  input: '我认为未来一年 AI 基础设施资本开支仍会增长，想寻找真正受益、但市场定价存在差异的 A 股公司。',
  interpretation: { subject: 'AI 基础设施资本开支', direction: '未来一年继续增长', horizon: '中期逻辑，拆解为一周观察', catalyst: '云厂商资本开支、订单与业绩披露', unknown: '基本面受益是否已被价格充分反映' },
  strategy: '本次用三个不同传导环节验证观点：服务器观察需求兑现，光模块观察高敏感环节，液冷观察功率密度提升的配套增量。它们不是固定类型，而是本次假设下的信息互补角色。',
  candidates: [
    { code: '000977.SZ', name: '浪潮信息', role: '验证服务器需求兑现', tags: ['传导直接', '已有经营证据'], reason: '服务器位于算力资本开支的设备层，可直接检验需求是否转化为采购与收入。', difference: '相比另外两家，更接近算力设备总需求，但利润仍受产品结构影响。', doubt: '收入增长能否同步转化为利润改善。', price: 52.36, change: 1.82, score: 84 },
    { code: '300308.SZ', name: '中际旭创', role: '验证高速互联景气度', tags: ['主题敏感', '市场反映较高'], reason: 'AI 集群扩张会提高高速互联需求，光模块是需求弹性较高的关键环节。', difference: '相对服务器与液冷，海外算力需求暴露更高，价格敏感度也更强。', doubt: '阶段涨幅较大，景气预期可能已被部分计价。', price: 168.20, change: -0.74, score: 81 },
    { code: '002837.SZ', name: '英维克', role: '验证液冷配套增量', tags: ['间接受益', '兑现待跟踪'], reason: '机柜功率密度提升会增加温控与液冷需求，可验证资本开支是否向配套环节扩散。', difference: '受益路径更靠后，但可提供不同于算力设备和互联环节的交叉验证。', doubt: '液冷业务收入占比与订单兑现速度仍需补证。', price: 38.91, change: 2.15, score: 73 },
  ],
}

const stockScenario: Scenario = {
  input: '我认为贵州茅台当前估值已经较充分消化悲观预期，未来一周可能出现修复。',
  interpretation: { subject: '贵州茅台估值修复', direction: '未来一周偏强', horizon: '7 个自然日', catalyst: '消费数据、批价与市场风险偏好', unknown: '修复来自公司特异性还是板块共振' },
  strategy: '你指定了贵州茅台。本次固定保留目标股票，再加入一个经营韧性同行和一个弹性更高的板块对照，用来判断修复是否具有公司特异性，而不是重新给出一组三只股票。',
  candidates: [
    { code: '600519.SH', name: '贵州茅台', role: '目标标的：验证估值修复', tags: ['用户指定', '高流动性'], reason: '直接验证用户观点，重点观察估值、批价和板块相对强弱。', difference: '唯一的目标股票，其他候选只承担对照作用。', doubt: '一周修复缺少明确公司级催化剂。', price: 1428.00, change: 0.68, score: 76 },
    { code: '000858.SZ', name: '五粮液', role: '支持性同行：验证板块共振', tags: ['同行对照', '经营验证'], reason: '同属高端白酒，可判断上涨是行业风险偏好修复还是茅台独立变化。', difference: '如果两者同步走强，更可能是板块因素，而非茅台特有逻辑。', doubt: '行业共同压力可能削弱其支持性。', price: 126.40, change: 1.12, score: 71 },
    { code: '000568.SZ', name: '泸州老窖', role: '反向对照：验证修复弹性', tags: ['弹性对照', '波动较高'], reason: '提供不同估值与波动特征，帮助比较修复行情中的相对弹性。', difference: '弹性通常更高；若其强而茅台弱，目标股修复逻辑需重新审视。', doubt: '更高波动可能放大短期噪声。', price: 118.76, change: -0.35, score: 67 },
  ],
}

const baseCommittee = [
  {
    key: 'bull', label: '乐观研究员', icon: TrendingUp, tone: 'positive', score: 82,
    summary: '高速互联是 AI 集群扩容中需求传导较直接的环节，公司主营与云计算数据中心高度相关，中期景气逻辑有业务基础。',
    conclusion: '偏乐观：需求逻辑成立，但需要订单与盈利数据继续确认。',
    analysis: [
      '需求端：AI 训练与推理集群扩大后，服务器节点之间的数据交换量同步提升，高速光模块是网络侧扩容的重要组成部分，资本开支向互联环节传导的链条相对较短。',
      '公司端：公开报告显示公司主营高端光通信收发模块，产品服务于云计算数据中心等场景，因此并非只有概念关联；产品速率升级还可能带来收入结构改善。',
      '催化端：后续云厂商资本开支、800G/1.6T 产品进展及季度收入变化，均可能成为验证景气度是否延续的关键节点。',
    ],
    basis: ['主营业务与云计算数据中心直接相关', 'AI 集群扩容提高高速互联需求', '产品代际升级可能改善收入结构'],
    evidence: [{ id: 'E-01', name: '中际旭创 2025 年半年度报告', date: '2025-08-27', url: 'https://vip.stock.finance.sina.com.cn/corp/view/vCB_AllBulletinDetail.php?stockid=300308&id=11379776' }, { id: 'E-02', name: '最新行情快照', date: '2026-08-21', url: 'https://data.eastmoney.com/stockdata/300308.html' }],
    gap: '仍缺少最新订单结构、不同速率产品收入占比与未来两个季度的客户需求指引。',
  },
  {
    key: 'bear', label: '悲观研究员', icon: TrendingDown, tone: 'negative', score: 58,
    summary: '产业景气并不等于股票仍有足够空间。阶段价格表现较强、客户集中与技术迭代，可能让当前估值对利好更敏感。',
    conclusion: '偏谨慎：基本面可能继续改善，但赔率未必与确定性同步。',
    analysis: [
      '定价端：行情快照显示该股近 60 日已有明显上涨，说明市场可能提前交易 AI 资本开支与高速产品放量；此时新增利好需要超出已有预期才能继续驱动价格。',
      '经营端：高速光模块行业具有产品快速迭代、客户认证周期和客户集中度较高等特征，任何订单节奏变化都可能放大单季收入和利润波动。',
      '估值端：如果后续资本开支只是符合预期而非上修，较高关注度可能导致估值先于基本面回落，因此不能把行业景气直接等同于短期买入理由。',
    ],
    basis: ['阶段涨幅反映部分乐观预期', '客户与产品迭代带来业绩波动', '缺少一致预期上修幅度数据'],
    evidence: [{ id: 'E-02', name: '最新行情快照', date: '2026-08-21', url: 'https://data.eastmoney.com/stockdata/300308.html' }, { id: 'E-01', name: '中际旭创 2025 年半年度报告', date: '2025-08-27', url: 'https://vip.stock.finance.sina.com.cn/corp/view/vCB_AllBulletinDetail.php?stockid=300308&id=11379776' }],
    gap: '缺少分析师一致盈利预期的最近三个月变化，也无法确认当前估值已计入多高的增长假设。',
  },
  {
    key: 'risk', label: '风控委员', icon: ShieldCheck, tone: 'warning', score: 64,
    summary: '一周观察窗口内，价格波动、海外资本开支消息和公司公告都可能造成跳空，风险控制应优先于方向判断。',
    conclusion: '中等风险：可以观察，但必须设置失效条件并限制单次风险暴露。',
    analysis: [
      '波动风险：光模块板块通常对产业消息反应较快，一周窗口里方向判断容易被市场风险偏好和主题交易放大，盘中触及价格不应直接视为趋势确认。',
      '事件风险：海外云厂商资本开支、客户订单、产品认证或供应链变化，可能在非交易时段发生并造成跳空，普通止损区间无法覆盖全部事件风险。',
      '执行风险：当前行情为实时快照，若次日开盘价格已经显著偏离参考价，原有风险收益比失效，必须重新计算而不是机械处理。',
    ],
    basis: ['20 日波动处于中高区间', '海外需求消息可能引发跳空', '盘后参考价存在时效边界'],
    evidence: [{ id: 'E-03', name: '20 日波动与成交指标', date: '2026-08-21', url: 'https://quote.eastmoney.com/sz300308.html' }, { id: 'R-02', name: '内部事件风险检查规则', date: '2026-08-25', url: 'https://www.sac.net.cn/sjb/flfg_949/zlgz/201012/t20101220_14236.html' }],
    gap: '缺少盘中流动性、最新公告事件和真实持仓风险信息，因此不能生成个性化仓位建议。',
  },
  {
    key: 'judge', label: '裁决官', icon: Gavel, tone: 'accent', score: 72,
    summary: '业务逻辑与中期需求方向获得支持，但市场定价和订单证据仍有缺口。综合判断为暂不行动，等待价格和新增证据形成一致信号。',
    conclusion: '综合判断：暂不行动，等待价格与新增证据共同确认。',
    analysis: [
      '综合三方意见，行业需求向高速互联传导的逻辑最为明确，公开主营资料也支持公司与主题的直接关联，因此逻辑强度得分较高。',
      '主要矛盾在于“好公司”与“好价格”并不等价。阶段涨幅和较高市场关注度降低了短期赔率，而最新订单、盈利预测变化仍未纳入证据池。',
      '因此综合评分为 72 分：它代表值得跟踪的程度，不等于买入信号。行动前必须同时看到价格确认、行业对照同步和新证据出现；核心客户需求下修将直接推翻本次判断。',
    ],
    basis: ['逻辑强度 84', '证据完整度 68', '市场拥挤度仅 43', '风险可控度 62'],
    evidence: [{ id: 'S-01', name: '四方证据综合评分', date: '2026-08-25', url: 'https://vip.stock.finance.sina.com.cn/corp/view/vCB_AllBulletinDetail.php?stockid=300308&id=11379776' }, { id: 'S-02', name: '评分规则 v0.2', date: '2026-08-25', url: 'https://data.eastmoney.com/stockdata/300308.html' }],
    gap: '综合结论基于最新行情与公开信息生成，后续应随最新财报与盘面变化持续复核。',
  },
]

const fallbackScores = [
  { label: '逻辑强度', value: 84, help: '传导链完整，业务相关度较高' },
  { label: '证据完整度', value: 68, help: '缺少最新订单与一致预期' },
  { label: '兑现程度', value: 74, help: '业务成立，利润兑现仍需验证' },
  { label: '市场拥挤度', value: 43, help: '分数越高代表越不拥挤' },
  { label: '风险可控度', value: 62, help: '一周波动与事件风险中等' },
]


// 首页行情演示池：进入页面时抓取这些标的的实时行情作为行情底池
const DEMO_QUOTE_CODES = ['000977.SZ', '300308.SZ', '002837.SZ', '600519.SH', '688836.SH', '688017.SH']

type PortfolioReport = {
  score: number
  totalWeight: number
  maxTheme: [string, { weight: number; names: string[] }] | null
  themes: Record<string, { weight: number; names: string[] }>
  aiWeight: number
  defensiveWeight: number
  items: { code: string; name: string; profile: { role: string; opportunity: string; risk: string; theme: string } }[]
  management: string[]
  combinations: { names: string[]; reason: string; score: number }[]
  note: string
  marketNote: string
}

type ReviewReport = {
  targetName: string
  conclusion: string
  positives: string[]
  issues: string[]
  unavoidable: string[]
  nextActions: string[]
  comparisons: string[][]
  marketNote: string
}

const EMPTY_PORTFOLIO: PortfolioReport = { score: 0, totalWeight: 0, maxTheme: null, themes: {}, aiWeight: 0, defensiveWeight: 0, items: [], management: [], combinations: [], note: '', marketNote: '' }
const EMPTY_REVIEW: ReviewReport = { targetName: '', conclusion: '', positives: [], issues: [], unavoidable: [], nextActions: [], comparisons: [], marketNote: '' }

// 复盘引导：每步 A/B/C 分类 + D 自定义，多轮确认后再交给 AI
const REVIEW_GUIDE_STEPS = [
  { key: 'operation', question: '这次操作属于哪种情况？', options: [
    { label: '按原计划执行', desc: '触发价、仓位、止盈止损都按计划来' },
    { label: '部分偏离原计划', desc: '仓位、价格或处理时机有一项没按计划' },
    { label: '没有计划，凭感觉操作', desc: '下单前没有明确的入场、仓位或止损规则' },
  ] },
  { key: 'reason', question: '当时判断主要依据什么？', options: [
    { label: '基本面', desc: '业绩、行业景气、估值等' },
    { label: '技术面', desc: '价格、量能、形态、均线等' },
    { label: '消息或情绪', desc: '新闻、题材热度、跟风交易' },
  ] },
  { key: 'question', question: '你最想搞清楚什么问题？', options: [
    { label: '是行情问题还是我的问题', desc: '区分不可控因素与可优化动作' },
    { label: '下次遇到同样情况怎么办', desc: '给出可执行的应对动作' },
    { label: '原计划本身是否有效', desc: '检验触发价、仓位与止盈止损的设置' },
  ] },
]

// 个股分析引导：输入只有股票名/方向模糊时，多轮确认方向、周期与关注点
const STOCK_GUIDE_STEPS = [
  { key: 'direction', question: '你对这只股票的短期方向判断？', options: [
    { label: '看多 / 偏强', desc: '认为未来一段时间偏强或有望修复' },
    { label: '看空 / 偏弱', desc: '认为短期有回调或下跌压力' },
    { label: '中性 / 不确定', desc: '没有明确方向，想了解多空逻辑' },
  ] },
  { key: 'horizon', question: '你更关注多长的周期？', options: [
    { label: '1-3 天', desc: '短线博弈，关注盘中与次日表现' },
    { label: '一周左右', desc: '中短期观察，适合一周观察计划' },
    { label: '一个月以上', desc: '偏中期逻辑，关注基本面兑现' },
  ] },
  { key: 'focus', question: '你主要关注它的哪方面？', options: [
    { label: '技术面 / 价格位置', desc: '均线、量能、支撑压力、趋势形态' },
    { label: '基本面 / 业绩', desc: '业绩、行业景气、估值、订单' },
    { label: '消息 / 题材催化', desc: '新闻、政策、题材热度、资金关注' },
  ] },
]

// 市场观点引导：输入模糊（如只给了股票名）时，多轮确认对象、方向、周期与关注点
const THESIS_GUIDE_STEPS = [
  { key: 'object', question: '你想分析什么？', options: [
    { label: '某只股票', desc: '具体个股的走势、风险与机会' },
    { label: '板块 / 题材', desc: '行业、热点方向与资金逻辑' },
    { label: '大盘 / 指数', desc: '上证、深证、创业板等整体走势' },
  ] },
  { key: 'direction', question: '你对它的方向判断？', options: [
    { label: '看多 / 偏强', desc: '认为未来一段时间偏强或有望修复' },
    { label: '看空 / 偏弱', desc: '认为短期有回调或下跌压力' },
    { label: '中性 / 不确定', desc: '没有明确方向，想了解多空逻辑' },
  ] },
  { key: 'horizon', question: '你更关注多长的周期？', options: [
    { label: '1-3 天', desc: '短线博弈，关注盘中与次日表现' },
    { label: '一周左右', desc: '中短期观察，适合一周观察计划' },
    { label: '一个月以上', desc: '偏中期逻辑，关注基本面兑现' },
  ] },
  { key: 'focus', question: '你主要关注它的哪方面？', options: [
    { label: '技术面 / 价格位置', desc: '均线、量能、支撑压力、趋势形态' },
    { label: '基本面 / 业绩', desc: '业绩、行业景气、估值、订单' },
    { label: '消息 / 题材催化', desc: '新闻、政策、题材热度、资金关注' },
  ] },
]

function getScoreTone(score: number) {
  return score >= 75 ? 'high' : score >= 60 ? 'medium' : 'low'
}

function memberIcon(key: string) {
  return key === 'bull' ? TrendingUp : key === 'bear' ? TrendingDown : key === 'risk' ? ShieldCheck : key === 'judge' ? Gavel : FileText
}

function displayTitle(record: ReviewRecord) {
  return record.customTitle || record.title || (record.mode === 'stock' ? '个股复盘' : '组合复盘')
}

function getArchiveFileName(archive: ArchiveRecord) {
  const basis = archive.taskTitle || archive.subject || archive.name
  return basis === archive.name ? archive.name : `${basis} / ${archive.name}`
}

function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: string }) {
  return <span className={`pill ${tone}`}>{children}</span>
}

function ActionBlock({ title, icon: Icon, items, tone = '' }: { title: string; icon: typeof CircleDot; items: string[]; tone?: string }) {
  return <section className={`action-section ${tone}`}><h3><Icon size={16}/>{title}</h3><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></section>
}

export default function HomePage() {
  const [mode, setMode] = useState<EntryMode>('thesis')
  const [query, setQuery] = useState(themeScenario.input)
  const [extraNote, setExtraNote] = useState('')
  const [stage, setStage] = useState<Stage>('input')
  const [loading, setLoading] = useState(false)
  const [loadingLabel, setLoadingLabel] = useState('分析中')
  const [loadingElapsed, setLoadingElapsed] = useState(0)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Candidate | null>(null)
  const [committeeTick, setCommitteeTick] = useState(-1)
  const [expandedMember, setExpandedMember] = useState<string | null>(null)
  const [riskModal, setRiskModal] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [cardOpen, setCardOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [view, setView] = useState<View>('assistant')
  const [toast, setToast] = useState('')
  const [justArchived, setJustArchived] = useState(false)
  const [activeArchive, setActiveArchive] = useState<ArchiveRecord | null>(null)
  const [tradingSystem, setTradingSystem] = useState<TradingSystem | null>(() => {
    try { return JSON.parse(storageGet('thesis-ai-trading-system') || 'null') as TradingSystem | null } catch { return null }
  })
  const [systemModalOpen, setSystemModalOpen] = useState(false)
  const [systemDraft, setSystemDraft] = useState('')
  const [systemError, setSystemError] = useState('')
  const [archives, setArchives] = useState<ArchiveRecord[]>(() => {
    try { return JSON.parse(storageGet('thesis-ai-archives') || '[]') as ArchiveRecord[] } catch { return [] }
  })
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>(() => {
    try { return JSON.parse(storageGet('thesis-ai-portfolio') || '[]') as PortfolioItem[] } catch { return [] }
  })
  const [portfolioDraft, setPortfolioDraft] = useState('中际旭创 5%\n浪潮信息 4%\n贵州茅台 8%\n宁德时代 6%\n招商银行 10%')
  const [portfolioError, setPortfolioError] = useState('')
  const [portfolioReportReady, setPortfolioReportReady] = useState(false)
  const [portfolioLoading, setPortfolioLoading] = useState(false)
  const [portfolioAdding, setPortfolioAdding] = useState(false)
  const [portfolioLive, setPortfolioLive] = useState<PortfolioReport | null>(null)
  const [reviewMode, setReviewMode] = useState<ReviewMode>('stock')
  const [reviewArchive, setReviewArchive] = useState<ArchiveRecord | null>(null)
  const [reviewOperation, setReviewOperation] = useState('我在 168 元买入中际旭创，仓位 10%。后来跌到 156 元没有止损，反弹到 162 元卖出。')
  const [reviewReason, setReviewReason] = useState('当时觉得 AI 算力还是强主线，盘中反弹说明资金可能回来，所以没有按原计划复核。')
  const [reviewResult, setReviewResult] = useState<'盈利' | '亏损' | '持平'>('亏损')
  const [reviewPnl, setReviewPnl] = useState('-3.6%')
  const [reviewQuestion, setReviewQuestion] = useState('这次亏损是行情问题，还是我没有遵守原计划？')
  const [reviewError, setReviewError] = useState('')
  const [reviewReportReady, setReviewReportReady] = useState(false)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewLive, setReviewLive] = useState<ReviewReport | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [guideStep, setGuideStep] = useState(0)
  const [guideAnswers, setGuideAnswers] = useState<Record<string, { option: string; custom: string }>>({})
  const [stockGuideOpen, setStockGuideOpen] = useState(false)
  const [stockGuideStep, setStockGuideStep] = useState(0)
  const [stockGuideAnswers, setStockGuideAnswers] = useState<Record<string, { option: string; custom: string }>>({})
  const [proBilling, setProBilling] = useState<'month' | 'year'>('month')
  const [reviewRecords, setReviewRecords] = useState<ReviewRecord[]>(() => {
    try { return JSON.parse(storageGet('thesis-ai-reviews') || '[]') as ReviewRecord[] } catch { return [] }
  })
  const [marketUpdatedAt, setMarketUpdatedAt] = useState(() => new Date().toISOString())
  const [marketRefreshing, setMarketRefreshing] = useState(false)
  const [live, setLive] = useState<AnalysisResult | null>(null)
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})
  const [quotesAt, setQuotesAt] = useState<number | null>(null)
  const [plan, setPlan] = useState<PlanState>(() => getPlan())
  const [pricingOpen, setPricingOpen] = useState(false)
  const [directNote, setDirectNote] = useState('')
  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>({})
  const [renameTarget, setRenameTarget] = useState<ReviewRecord | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  const scenario = live
    ? { input: query, interpretation: live.interpretation, strategy: live.strategy, candidates: live.candidates }
    : (mode === 'thesis' ? themeScenario : stockScenario)
  const scores = live?.scores ?? fallbackScores
  const activeMembers = useMemo(() => live?.members ?? [], [live])
  const committeeStep = Math.floor(committeeTick / 2)
  const committeePhase = committeeTick < 0 ? 'waiting' : committeeTick % 2 === 0 ? 'thinking' : 'generating'
  const isStockMode = mode === 'stock'
  const stageIndex = isStockMode && (stage === 'committee' || stage === 'verdict') ? { committee: 1, verdict: 2 }[stage] : { input: 0, candidates: 1, committee: 2, verdict: 3 }[stage]
  const candidateSectionTitle = `匹配 ${scenario.candidates.length} 个观察标的`
  const candidateSectionDescription = '匹配度代表验证价值，不代表上涨概率。'
  const candidatePoolLabel = quotesAt ? '实时行情' : '行情获取中…'
  const committeeDescription = isStockMode
    ? `围绕 ${selected?.name || '目标股票'} 验证用户判断，对照同行只作参考。`
    : `多视角生成判断${tradingSystem ? '，并核对您的交易系统' : ''}。`
  const verdictDescription = isStockMode
    ? `只对目标股票给出结论；评分代表跟踪价值，不等于买入信号。${tradingSystem ? '用户系统结论会单独保留。' : ''}`
    : `汇总多方观点后的跟踪结论；评分不等于买入信号。${tradingSystem ? '用户系统结论会单独保留。' : ''}`
  const marketTimeLabel = new Date(marketUpdatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const planWindow = (() => {
    const f = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return `${f(new Date())} — ${f(new Date(Date.now() + 7 * 86400000))}`
  })()

  useEffect(() => {
    if (stage !== 'committee' || committeeTick >= activeMembers.length * 2 - 1) return
    const delay = committeeTick % 2 === 0 ? 1400 : 1800
    const timer = window.setTimeout(() => setCommitteeTick((tick) => tick + 1), delay)
    return () => window.clearTimeout(timer)
  }, [activeMembers.length, stage, committeeTick])

  useEffect(() => {
    if (stage === 'committee' && committeeTick === activeMembers.length * 2 - 1) {
      const timer = window.setTimeout(() => setStage('verdict'), 700)
      return () => window.clearTimeout(timer)
    }
  }, [activeMembers.length, stage, committeeTick])

  useEffect(() => {
    storageSet('thesis-ai-archives', JSON.stringify(archives))
  }, [archives])

  useEffect(() => {
    storageSet('thesis-ai-portfolio', JSON.stringify(portfolioItems))
  }, [portfolioItems])

  useEffect(() => {
    storageSet('thesis-ai-reviews', JSON.stringify(reviewRecords))
  }, [reviewRecords])

  useEffect(() => {
    if (tradingSystem) storageSet('thesis-ai-trading-system', JSON.stringify(tradingSystem))
    else storageRemove('thesis-ai-trading-system')
  }, [tradingSystem])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2600)
    return () => window.clearTimeout(timer)
  }, [toast])

  const portfolioAnalysis = useMemo(() => {
    if (!portfolioLive) return EMPTY_PORTFOLIO
    return portfolioLive
  }, [portfolioLive])

  const reviewAnalysis = useMemo(() => {
    if (!reviewLive) return EMPTY_REVIEW
    return reviewLive
  }, [reviewLive])

  const activeCommittee = useMemo(() => {
    const completedCount = stage === 'verdict' ? activeMembers.length : Math.max(0, Math.floor(committeeTick / 2))
    return activeMembers.slice(0, completedCount)
  }, [activeMembers, committeeTick, stage])

  const switchMode = (nextMode: EntryMode) => {
    setMode(nextMode)
    setQuery(nextMode === 'thesis' ? themeScenario.input : stockScenario.input)
    setExtraNote('')
    setStage('input'); setSelected(null); setCommitteeTick(-1); setError(''); setCardOpen(false); setJustArchived(false); setLive(null); setDirectNote(''); setStockGuideOpen(false)
  }

  // 一键体验：切到市场观点模式，用留档示例直接跑完整流程，并自动进入多方分析
  const autoPlayRef = useRef(false)
  const applyExample = (nextMode: EntryMode, text: string) => {
    switchMode(nextMode)
    setQuery(text)
  }
  const runOneClickDemo = () => {
    if (loading) return
    const sample = DEMO_THESIS_SCENARIOS[0]
    switchMode('thesis')
    setQuery(sample.input)
    autoPlayRef.current = true
    void runAnalysisFlow(sample.input, '', undefined, 'thesis')
  }

  const loadQuotes = async (codes?: string[]) => {
    const list = codes?.length ? codes : DEMO_QUOTE_CODES
    setMarketRefreshing(true)
    try {
      const result = await fetchQuotes(list)
      if (Object.keys(result).length) {
        setQuotes((prev) => ({ ...prev, ...result }))
        setQuotesAt(Date.now())
        setMarketUpdatedAt(new Date().toISOString())
      }
    } catch { /* 保留旧数据 */ } finally {
      setMarketRefreshing(false)
    }
  }

  useEffect(() => { void loadQuotes() }, [])

  useEffect(() => {
    if (!loading) { setLoadingElapsed(0); return }
    const start = Date.now()
    const timer = window.setInterval(() => setLoadingElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [loading])

  const refreshMarket = () => {
    reset()
    loadQuotes()
    window.setTimeout(() => setToast('已抓取最新行情并重置'), 300)
  }

  const openAnalysisGuide = () => { setStockGuideStep(0); setStockGuideAnswers({}); setStockGuideOpen(true) }
  const guideSteps = isStockMode ? STOCK_GUIDE_STEPS : THESIS_GUIDE_STEPS
  const discover = async () => {
    const text = query.trim()
    if (isStockMode) {
      if (text.length < 2) { setError('请输入股票名称或 6 位代码。'); return }
      // 只输入了股票名或补充方向很模糊 → 先引导确认方向/周期/关注点（可跳过直接分析）
      if (extraNote.trim().length < 8) { openAnalysisGuide(); return }
    } else if (text.length < 8) {
      // 市场观点只输入了一句话（如股票名）→ 不再报错，弹交互式引导补充方向与关注点
      openAnalysisGuide(); return
    }
    void runAnalysisFlow(text, extraNote.trim())
  }
  const startGuidedStockAnalysis = (skip: boolean) => {
    setStockGuideOpen(false)
    const note = skip
      ? undefined
      : guideSteps.map((step) => {
          const answer = stockGuideAnswers[step.key]
          if (!answer) return `${step.question}→未选择`
          return `${step.question}→${answer.option}${answer.custom ? `（自定义：${answer.custom}）` : ''}`
        }).join('；')
    void runAnalysisFlow(query.trim(), extraNote.trim(), note)
  }
  const runAnalysisFlow = async (text: string, note: string, guide?: string, entryMode?: EntryMode) => {
    const activeMode = entryMode ?? mode
    const stockMode = activeMode === 'stock'
    setError(''); setLoading(true)
    try {
      const tracked = trackAnalysis(plan)
      setPlan(tracked.plan)

      let targetStock: { code: string; name: string; price?: number; changePct?: number } | undefined
      let analyzeInput = text
      let snapshotQuotes: Quote[] = Object.values(quotes)
      let unresolved = false
      if (stockMode) {
        setLoadingLabel('正在识别股票…')
        let resolved: { code: string; name: string } | null = null
        try { resolved = await resolveStock(text) } catch { /* 识别失败 → AI 直判兜底 */ }
        if (resolved?.code) {
          targetStock = { code: resolved.code, name: resolved.name }
          setLoadingLabel('正在获取实时行情…')
          try {
            const quoteResult = await fetchQuotes([resolved.code])
            const quote = quoteResult[resolved.code]
            if (quote && stockNameMatch(quote.name, resolved.name)) {
              setQuotes((prev) => ({ ...prev, ...quoteResult }))
              setQuotesAt(Date.now())
              snapshotQuotes = [...Object.values(quotes), quote]
              targetStock = { code: resolved.code, name: resolved.name, price: quote.price, changePct: quote.changePct }
            } else {
              unresolved = true
            }
          } catch { unresolved = true }
        } else {
          unresolved = true
        }
        analyzeInput = note ? `个股：${text}。补充判断：${note}` : `个股：${text}`
        if (unresolved) setLoadingLabel('未能识别代码或未取到行情，AI 直判中…')
      }

      setLoadingLabel('AI 分析中…')
      const result = await runAnalysis({ input: analyzeInput, mode: activeMode, tradingSystem: tradingSystem?.text, quotes: snapshotQuotes, degraded: tracked.degraded, targetStock, unresolved, guide })
      setLive(result)
      if (result.candidates.length) loadQuotes(result.candidates.map((c) => c.code))
      if (stockMode) {
        const target = unresolved ? result.candidates[0] : result.candidates.find((c) => c.code === targetStock?.code)
        if (target) {
          if (unresolved) setDirectNote('AI 直判模式：未能识别该股票代码或未获取到实时行情，以下结论基于 AI 知识与公开信息生成，价格未经实时行情验证。')
          startCommittee(target)
          return
        }
        if (unresolved) {
          const placeholder: Candidate = {
            code: targetStock?.code || '',
            name: result.interpretation.subject || '待确认标的',
            role: 'AI 直判',
            tags: ['未获取实时行情'],
            reason: result.verdict.conclusion || '由 AI 基于公开信息直接研判，未获取实时行情。',
            difference: '',
            doubt: '标的识别与行情数据未验证，请以官方公开信息和实时行情为准。',
            price: 0, change: 0, score: result.verdict.score ?? 0,
          }
          setDirectNote('AI 直判模式：未能识别该股票代码或未获取到实时行情，以下结论基于 AI 知识与公开信息生成，价格未经实时行情验证。')
          startCommittee(placeholder)
          return
        }
        setError('本次未生成有效候选标的，请重试。')
        return
      }
      setStage('candidates')
      window.setTimeout(() => document.querySelector('#candidates')?.scrollIntoView({ behavior: 'smooth' }), 30)
      // 一键体验：自动进入多方分析，让评审不用再找按钮
      if (autoPlayRef.current) {
        autoPlayRef.current = false
        const first = result.candidates[0]
        if (first) window.setTimeout(() => startCommittee(first), 900)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析失败，请重试。')
    } finally {
      setLoading(false)
    }
  }

  const startCommittee = (candidate: Candidate) => {
    setSelected(candidate); setCommitteeTick(0); setExpandedMember(null); setStage('committee'); setJustArchived(false)
    window.setTimeout(() => document.querySelector('#committee')?.scrollIntoView({ behavior: 'smooth' }), 40)
  }

  const openRisk = () => { setAcknowledged(false); setRiskModal(true) }
  const createCard = () => { if (!acknowledged) return; setRiskModal(false); setJustArchived(false); setCardOpen(true) }
  const reset = () => { setView('assistant'); setStage('input'); setSelected(null); setCommitteeTick(-1); setCardOpen(false); setError(''); setDirectNote(''); setStockGuideOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const saveArchive = () => {
    if (!selected) return
    const now = new Date().toISOString()
    const id = `${mode}-${scenario.interpretation.subject}-${selected.code}`
    const existing = archives.find((item) => item.id === id)
    const sys = live?.members.find((m) => m.key === 'system')
    const record: ArchiveRecord = {
      id, taskTitle: scenario.interpretation.subject, code: selected.code, name: selected.name, query, subject: scenario.interpretation.subject,
      verdict: live?.verdict.title ?? '暂不行动', score: live?.verdict.score ?? 72, price: selected.price,
      createdAt: existing?.createdAt || now, updatedAt: now,
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      entryPrice: live?.plan.entryPrice ?? 162, stopPrice: live?.plan.stopPrice ?? 157,
      takeRange: live?.plan.takeRange ?? '¥175 — ¥178', initialPosition: live?.plan.initialPosition ?? '5%', maxPosition: live?.plan.maxPosition ?? '10%',
      tradingSystemText: tradingSystem?.text, tradingSystemUpdatedAt: tradingSystem?.updatedAt,
      systemVerdict: sys?.conclusion ?? (tradingSystem ? '依据不足，保持观察，不触发首次 5% 观察仓位。' : undefined),
      members: live?.members, marketNote: live?.marketNote,
      status: '有效',
    }
    setArchives((items) => [record, ...items.filter((item) => item.id !== id)])
    setJustArchived(true)
    setToast('已成功留档，可继续加入组合体检或一周后复盘')
  }
  const openSystemEditor = () => { setSystemDraft(tradingSystem?.text || ''); setSystemError(''); setSystemModalOpen(true) }
  const saveTradingSystem = () => {
    const text = systemDraft.trim()
    if (text.length < 20) { setSystemError('请至少输入 20 个字，说明入场、仓位或风险规则。'); return }
    setTradingSystem({ text, updatedAt: new Date().toISOString() })
    setSystemModalOpen(false); setSystemError(''); setToast('交易系统已保存并启用')
  }
  const clearTradingSystem = () => {
    setTradingSystem(null); setSystemDraft(''); setSystemModalOpen(false); setSystemError(''); setToast('交易系统已清除')
  }
  const closeCard = () => {
    if (document.activeElement instanceof HTMLElement && document.activeElement.closest('.action-drawer')) document.activeElement.blur()
    setCardOpen(false)
  }
  const showReview = () => { closeCard(); setView('review'); setActiveArchive(null); setNavOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const showPortfolio = () => { closeCard(); setView('portfolio'); setActiveArchive(null); setNavOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const showArchives = () => { closeCard(); setView('archives'); setNavOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const showAssistant = () => { setView('assistant'); setActiveArchive(null); setNavOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const addPortfolioItem = (item: PortfolioItem) => {
    setPortfolioItems((items) => [item, ...items.filter((existing) => existing.code !== item.code)])
    setPortfolioReportReady(false)
    setToast(`已将 ${item.name} 添加入组合名单`)
  }
  const addArchiveToPortfolio = (archive: ArchiveRecord) => addPortfolioItem({ code: archive.code, name: archive.name, weight: 5, source: '档案', addedAt: new Date().toISOString() })
  const addManualPortfolioItems = async () => {
    const lines = portfolioDraft.split(/[\n,，;；]+/).map((raw) => raw.trim()).filter(Boolean)
    if (!lines.length) { setPortfolioError('请输入至少一个股票名称或 6 位代码。'); return }
    setPortfolioError(''); setPortfolioAdding(true)
    const entries = lines.map((raw) => {
      const weightMatch = raw.match(/(\d+(?:\.\d+)?)\s*%/)
      return { raw, name: raw.replace(/(\d+(?:\.\d+)?)\s*%/, '').trim(), weight: weightMatch ? Number(weightMatch[1]) : 5 }
    })
    try {
      const resp = await apiPost('/api/resolve-batch', { inputs: entries.map((entry) => entry.name) })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || data.error) throw new Error(data.error || '股票识别服务异常，请重试。')
      const ok: PortfolioItem[] = []
      const failed: string[] = []
      for (const entry of entries) {
        const r = (data.results || []).find((x: { input: string; code?: string; name?: string }) => x.input === entry.name)
        if (r?.ok && r.code) ok.push({ code: r.code, name: r.name || entry.name, weight: entry.weight, source: '手动', addedAt: new Date().toISOString() })
        else failed.push(entry.raw)
      }
      if (ok.length) {
        setPortfolioItems((items) => [...ok, ...items.filter((existing) => !ok.some((item) => item.code === existing.code))])
        setPortfolioReportReady(false)
        setPortfolioLive(null)
        setToast(`已添加 ${ok.length} 只股票到组合名单`)
        void fetchQuotes(ok.map((item) => item.code)).then((quoteResult) => {
          if (Object.keys(quoteResult).length) { setQuotes((prev) => ({ ...prev, ...quoteResult })); setQuotesAt(Math.max(...Object.values(quoteResult).map((q) => q.updatedAt || 0)) || Date.now()) }
        }).catch(() => {})
      }
      if (failed.length) setPortfolioError(`以下未能识别，请确认名称或直接输入 6 位代码：${failed.join('、')}`)
    } catch (err) {
      setPortfolioError(err instanceof Error ? err.message : '股票识别失败，请重试。')
    } finally {
      setPortfolioAdding(false)
    }
  }
  const removePortfolioItem = (code: string) => { setPortfolioItems((items) => items.filter((item) => item.code !== code)); setPortfolioReportReady(false); setPortfolioLive(null) }
  const runPortfolioAnalysis = async () => {
    if (portfolioItems.length < 2) { setPortfolioError('至少添加 2 只股票后才能生成组合综合分析。'); return }
    const gate = tryUsePremium(plan)
    setPlan(gate.plan)
    if (!gate.ok) { setPortfolioError(`${plan.tier === 'plus' ? `Plus 版组合体检与复盘 ${PLUS_PREMIUM_QUOTA} 次已用完` : `免费版组合体检与复盘 ${FREE_PREMIUM_QUOTA} 次已用完`}；升级 Plus（9.9 元/月 50 次）或专业版（29 元/月不限次）。`); setPricingOpen(true); return }
    setPortfolioError(''); setPortfolioLoading(true); setPortfolioReportReady(false)
    try {
      const codes = portfolioItems.map((item) => item.code)
      const quoteResult = await fetchQuotes(codes)
      const quotes = codes.map((code) => quoteResult[code]).filter(Boolean)
      const tracked = trackAnalysis(plan)
      setPlan(tracked.plan)
      const resp = await apiPost('/api/portfolio', { items: portfolioItems, quotes, tradingSystem: tradingSystem?.text, degraded: tracked.degraded })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || data.error) throw new Error(data.error || `组合体检失败（HTTP ${resp.status}）`)
      const raw = data.result || {}
      const themes: Record<string, { weight: number; names: string[] }> = {}
      for (const t of raw.themes || []) themes[String(t.theme)] = { weight: Number(t.weight) || 0, names: Array.isArray(t.names) ? t.names : [] }
      const totalWeight = portfolioItems.reduce((sum, item) => sum + item.weight, 0)
      const live: PortfolioReport = {
        score: Number(raw.score) || 0,
        totalWeight,
        maxTheme: raw.maxTheme ? [String(raw.maxTheme.theme), { weight: Number(raw.maxTheme.weight) || 0, names: Array.isArray(raw.maxTheme.names) ? raw.maxTheme.names : [] }] : null,
        themes,
        aiWeight: Number(raw.aiWeight) || 0,
        defensiveWeight: Number(raw.defensiveWeight) || 0,
        items: (raw.items || []).map((i: { code?: string; name?: string; role?: string; opportunity?: string; risk?: string }) => ({ code: String(i.code || ''), name: String(i.name || ''), profile: { role: String(i.role || ''), opportunity: String(i.opportunity || ''), risk: String(i.risk || ''), theme: '' } })),
        management: Array.isArray(raw.management) ? raw.management : [],
        combinations: Array.isArray(raw.combinations) ? raw.combinations : [],
        note: String(raw.note || ''),
        marketNote: String(raw.marketNote || ''),
      }
      setPortfolioLive(live)
      if (Object.keys(quoteResult).length) { setQuotes((prev) => ({ ...prev, ...quoteResult })); setQuotesAt(Math.max(...Object.values(quoteResult).map((q) => q.updatedAt || 0)) || Date.now()) }
      setPortfolioReportReady(true)
      window.setTimeout(() => document.querySelector('#portfolio-report')?.scrollIntoView({ behavior: 'smooth' }), 30)
    } catch (err) {
      setPortfolioError(err instanceof Error ? err.message : '组合体检失败，请重试。')
    } finally {
      setPortfolioLoading(false)
    }
  }
  const deepAnalyzePortfolioItem = (item: { code: string; name: string }) => {
    setMode('stock'); setQuery(`我当前组合中关注 ${item.name}（${item.code}），请分析它在当前组合中的风险与机会。`)
    setStage('input'); setSelected(null); setCommitteeTick(-1); setView('assistant'); setNavOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const startReviewFromArchive = (archive: ArchiveRecord) => {
    setReviewMode('stock'); setReviewArchive(archive); setReviewOperation(`我围绕 ${archive.name} 做了一次观察后的操作：价格、仓位和处理过程如下……`); setReviewReason(`当时参考了「${getArchiveFileName(archive)}」这次分析，但实际处理中有一些犹豫。`); setReviewResult('亏损'); setReviewPnl('-3.6%'); setReviewQuestion('这次结果主要是行情问题，还是我可以主动规避？'); setReviewError(''); setReviewReportReady(false); setActiveArchive(null); showReview()
  }
  const generateReview = async (opts: { operation: string; reason: string; result: '盈利' | '亏损' | '持平'; pnl: string; question: string; mode: ReviewMode; archive: ArchiveRecord | null; saveRecord: boolean; guide?: string }) => {
    const gate = tryUsePremium(plan)
    setPlan(gate.plan)
    if (!gate.ok) { setReviewError(`${plan.tier === 'plus' ? `Plus 版组合体检与复盘 ${PLUS_PREMIUM_QUOTA} 次已用完` : `免费版组合体检与复盘 ${FREE_PREMIUM_QUOTA} 次已用完`}；升级 Plus（9.9 元/月 50 次）或专业版（29 元/月不限次）。`); setPricingOpen(true); return }
    setReviewError(''); setReviewLoading(true); setReviewReportReady(false)
    try {
      const targetName = opts.mode === 'stock' ? (opts.archive?.name || '当前个股') : '当前组合'
      const codes = opts.mode === 'stock' ? (opts.archive?.code ? [opts.archive.code] : []) : portfolioItems.map((item) => item.code)
      const quoteResult = await fetchQuotes(codes)
      const quotes = codes.map((code) => quoteResult[code]).filter(Boolean)
      const tracked = trackAnalysis(plan)
      setPlan(tracked.plan)
      const resp = await apiPost('/api/review', { mode: opts.mode, targetName, archive: opts.archive, items: portfolioItems, quotes, tradingSystem: tradingSystem?.text, degraded: tracked.degraded, operation: opts.operation, reason: opts.reason, result: opts.result, pnl: opts.pnl, question: opts.question, guide: opts.guide })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || data.error) throw new Error(data.error || `复盘失败（HTTP ${resp.status}）`)
      const raw = data.result || {}
      const live: ReviewReport = {
        targetName: String(raw.targetName || targetName),
        conclusion: String(raw.conclusion || ''),
        positives: Array.isArray(raw.positives) ? raw.positives : [],
        issues: Array.isArray(raw.issues) ? raw.issues : [],
        unavoidable: Array.isArray(raw.unavoidable) ? raw.unavoidable : [],
        nextActions: Array.isArray(raw.nextActions) ? raw.nextActions : [],
        comparisons: Array.isArray(raw.comparisons) ? raw.comparisons : [],
        marketNote: String(raw.marketNote || ''),
      }
      setReviewLive(live)
      if (opts.saveRecord) {
        const sourceTitle = opts.mode === 'stock' ? (opts.archive ? getArchiveFileName(opts.archive) : '未选择档案') : `${portfolioItems.length} 只组合名单`
        const record: ReviewRecord = { id: `${Date.now()}`, mode: opts.mode, title: opts.archive ? getArchiveFileName(opts.archive) : (opts.mode === 'stock' ? '个股复盘' : '组合复盘'), result: opts.result, pnl: opts.pnl, source: sourceTitle, createdAt: new Date().toISOString(), operation: opts.operation, reason: opts.reason, question: opts.question, archiveId: opts.archive?.id }
        setReviewRecords((items) => [record, ...items].slice(0, 12))
      }
      setReviewReportReady(true)
      window.setTimeout(() => document.querySelector('#review-report')?.scrollIntoView({ behavior: 'smooth' }), 30)
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : '复盘失败，请重试。')
    } finally {
      setReviewLoading(false)
    }
  }
  const closeGuide = () => setGuideOpen(false)
  const openGuide = () => { setGuideStep(0); setGuideAnswers({}); setGuideOpen(true) }
  const runReview = () => { openGuide() }
  const startGuidedReview = (skip: boolean) => {
    setGuideOpen(false)
    const guide = skip
      ? undefined
      : REVIEW_GUIDE_STEPS.map((step, index) => {
          const answer = guideAnswers[step.key]
          if (!answer) return `${index + 1}. ${step.question} → 未选择`
          return `${index + 1}. ${step.question} → ${answer.option}${answer.custom ? `（自定义：${answer.custom}）` : ''}`
        }).join('；')
    void generateReview({ operation: reviewOperation, reason: reviewReason, result: reviewResult, pnl: reviewPnl, question: reviewQuestion, mode: reviewMode, archive: reviewArchive, saveRecord: true, guide })
  }
  const openReviewRecord = (record: ReviewRecord) => {
    setReviewMode(record.mode)
    const archive = record.archiveId ? archives.find((item) => item.id === record.archiveId) || null : null
    setReviewArchive(archive)
    setReviewOperation(record.operation || (record.mode === 'stock' ? '这是一条旧复盘记录，原始操作未保存。' : '这是一条旧组合复盘记录，原始组合操作未保存。'))
    setReviewReason(record.reason || '这是一条旧复盘记录，原始判断原因未保存。')
    const result = record.result === '盈利' || record.result === '持平' ? record.result : '亏损'
    setReviewResult(result)
    setReviewPnl(record.pnl)
    setReviewQuestion(record.question || '查看历史复盘报告')
    setReviewError(''); setReviewReportReady(false); setReviewLive(null)
    void generateReview({ operation: record.operation || '这是一条旧复盘记录，原始操作未保存。', reason: record.reason || '这是一条旧复盘记录，原始判断原因未保存。', result, pnl: record.pnl || '-0%', question: record.question || '', mode: record.mode, archive, saveRecord: false })
  }
  const deleteArchive = (id: string) => { setArchives((items) => items.filter((item) => item.id !== id)); setActiveArchive(null); setToast('留档已删除') }
  const handleUpgrade = (tier: 'plus' | 'pro', billing?: 'month' | 'year') => {
    const next = upgradePlan(tier, billing)
    setPlan(next); setPricingOpen(false)
    setToast(tier === 'pro' ? (billing === 'year' ? '已开通专业版年付（299 元/年）' : '已开通专业版（29 元/月）') : '已开通 Plus（9.9 元/月 · 50 次）')
  }
  const deleteReview = (id: string) => {
    setReviewRecords((items) => items.filter((item) => item.id !== id))
    if (renameTarget?.id === id) setRenameTarget(null)
    setToast('复盘记录已删除')
  }
  const togglePinReview = (id: string) => {
    setReviewRecords((items) => items.map((item) => item.id === id ? { ...item, pinned: !item.pinned } : item))
    setToast('已更新收藏')
  }
  const openRename = (record: ReviewRecord) => { setRenameTarget(record); setRenameDraft(displayTitle(record)) }
  const saveRename = () => {
    const title = renameDraft.trim()
    if (!title || !renameTarget) return
    setReviewRecords((items) => items.map((item) => item.id === renameTarget.id ? { ...item, customTitle: title } : item))
    setRenameTarget(null)
    setToast('复盘名称已更新')
  }
  const toggleMonth = (month: string) => setCollapsedMonths((prev) => ({ ...prev, [month]: !prev[month] }))
  const monthLabel = (month: string) => { const [y, m] = month.split('-'); return `${y} 年 ${Number(m)} 月` }
  const dateLabel = (date: string) => { const [, m, d] = date.split('-'); return `${Number(m)} 月 ${Number(d)} 日` }
  const reviewGroups = useMemo(() => {
    const pinned: ReviewRecord[] = []
    const byMonth = new Map<string, ReviewRecord[]>()
    for (const record of [...reviewRecords].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))) {
      if (record.pinned) { pinned.push(record); continue }
      const month = (record.createdAt || '').slice(0, 7) || '未知月份'
      byMonth.set(month, [...(byMonth.get(month) || []), record])
    }
    const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, records]) => {
      const byDate = new Map<string, ReviewRecord[]>()
      for (const record of records) {
        const date = (record.createdAt || '').slice(0, 10) || month
        byDate.set(date, [...(byDate.get(date) || []), record])
      }
      return { month, records, dates: [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0])) }
    })
    return { pinned, months }
  }, [reviewRecords])
  const reviewRecordCard = (record: ReviewRecord) => (
    <div className="review-record" key={record.id}>
      <button className="review-record-main" onClick={() => openReviewRecord(record)}>
        <div><strong>{displayTitle(record)}</strong><span>{record.mode === 'stock' ? '个股复盘' : '组合复盘'}{record.source ? ` · ${record.source}` : ''}</span></div>
        <b className={record.result === '亏损' ? 'loss' : 'gain'}>{record.result} {record.pnl}</b>
        <small>{new Date(record.createdAt).toLocaleString('zh-CN')} · 点击查看报告</small>
      </button>
      <div className="review-record-actions">
        <button className={`icon-btn ${record.pinned ? 'pinned' : ''}`} onClick={() => togglePinReview(record.id)} aria-label={record.pinned ? '取消收藏' : '收藏置顶'} title={record.pinned ? '取消收藏' : '收藏置顶'}><Star size={13} fill={record.pinned ? 'currentColor' : 'none'}/></button>
        <button className="icon-btn" onClick={() => openRename(record)} aria-label="重命名" title="重命名"><Pencil size={13}/></button>
        <button className="icon-btn danger-icon" onClick={() => deleteReview(record.id)} aria-label="删除" title="删除"><Trash2 size={13}/></button>
      </div>
    </div>
  )

  return <div className="app">
    <header className="topbar">
      <div className="brand"><button className="icon-btn menu-btn" aria-label="打开流程导航" onClick={() => setNavOpen(!navOpen)}><Menu size={18}/></button><div className="logo penguin-logo" aria-hidden="true"><svg viewBox="0 0 40 40" role="img"><ellipse cx="20" cy="20" rx="12" ry="15" fill="#111827"/><ellipse cx="20" cy="23" rx="8" ry="10" fill="#f8fafc"/><circle cx="16" cy="15" r="2.1" fill="#f8fafc"/><circle cx="24" cy="15" r="2.1" fill="#f8fafc"/><path d="M12 14h7v4h-7zM21 14h7v4h-7z" fill="#020617"/><path d="M19 16h2" stroke="#020617" strokeWidth="1.5"/><path d="M18 20h4l-2 2.5z" fill="#f59e0b"/><path d="M13 31c2 2 12 2 14 0" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/></svg></div><div><strong>finance penguin</strong><span>A 股假设验证台</span></div></div>
      <EnginePanel />
      <div className="top-actions"><button className="plan-chip" onClick={() => setPricingOpen(true)} aria-label="查看会员方案"><BadgeCheck size={13}/><span>{plan.tier === 'pro' ? '专业版 · 已开通' : plan.tier === 'plus' ? `Plus · 高级功能剩余 ${premiumRemaining(plan)} 次` : `免费版 · 高级功能剩余 ${premiumRemaining(plan)} 次`}</span><strong>{plan.tier === 'pro' ? (plan.billing === 'year' ? '299 元/年' : '29 元/月') : plan.tier === 'plus' ? '9.9 元/月' : '升级会员'}</strong></button><button className="market-refresh" onClick={refreshMarket} disabled={marketRefreshing} aria-label="刷新最新行情并重置"><Database size={13}/><span>最新行情 · 重置</span><strong>{marketTimeLabel}</strong>{marketRefreshing && <RefreshCw className="spin" size={13}/>}</button></div>
    </header>

    <aside className={`rail ${navOpen ? 'open' : ''}`}>
      <div className="rail-label">WORKSPACE</div>
      <button className={`module-nav ${view === 'assistant' ? 'active' : ''}`} onClick={showAssistant}><BrainCircuit size={17}/><div><strong>分析助手</strong><span>验证新的投资假设</span></div></button>
      <button className={`module-nav ${view === 'portfolio' ? 'active' : ''}`} onClick={showPortfolio}><PieChart size={17}/><div><strong>组合体检</strong><span>{portfolioItems.length} 只组合名单</span></div></button>
      <button className={`module-nav ${view === 'review' ? 'active' : ''}`} onClick={showReview}><ClipboardCheck size={17}/><div><strong>复盘教练</strong><span>{reviewRecords.length} 条复盘记录</span></div></button>
      <button className={`module-nav ${view === 'archives' ? 'active' : ''}`} onClick={showArchives}><Archive size={17}/><div><strong>留档</strong><span>{archives.length} 份完整分析</span></div></button>
      {view === 'assistant' && <><div className="rail-label flow-label">分析进度</div>{(isStockMode ? ['输入观点', '多方分析', '综合判断', '观察计划'] : ['输入观点', '验证标的', '多方分析', '综合判断', '观察计划']).map((label, index) => <div className={`rail-item ${index === stageIndex ? 'active' : ''} ${index < stageIndex ? 'done' : ''}`} key={label}><span>{index < stageIndex ? <Check size={13}/> : index + 1}</span>{label}</div>)}</>}
      <div className="rail-warning"><AlertTriangle size={16}/><p>{engineStatusText()}；仅供学习验证，不构成投资建议。</p></div>
    </aside>

    <main className="workspace">
      {view === 'assistant' ? <>
        <section className="hero compact-hero"><div><h1>验证你的投资判断</h1></div><div className="coverage"><div><strong>5,000+</strong><span>A 股</span></div></div></section>

      <section id="trading-system" className={`trading-system-card ${tradingSystem ? 'enabled' : ''}`}>
        <div className="trading-system-icon"><FileText size={20}/></div>
        <div className="trading-system-copy"><div className="trading-system-title"><span>我的交易系统</span>{tradingSystem && <Pill tone="success"><CheckCircle2 size={11}/>已启用</Pill>}</div>{tradingSystem ? <><p>{tradingSystem.text}</p><small>更新于 {new Date(tradingSystem.updatedAt).toLocaleString('zh-CN')}</small></> : <p>可选填写交易规则。</p>}</div>
        <div className="trading-system-actions"><button className="btn secondary" onClick={openSystemEditor}>{tradingSystem ? '查看与修改' : '添加交易系统'}</button>{tradingSystem && <button className="btn text-danger" onClick={clearTradingSystem}>清除</button>}</div>
      </section>

      <section className="panel input-panel">
        <div className="section-head"><div><span className="section-no">01 / 输入观点</span><h2>您想了解什么？</h2></div><Pill tone="success">沪深京 A 股</Pill></div>
        <div className="mode-tabs" role="tablist"><button className={mode === 'thesis' ? 'active' : ''} onClick={() => switchMode('thesis')}><BrainCircuit size={16}/>市场观点</button><button className={mode === 'stock' ? 'active' : ''} onClick={() => switchMode('stock')}><Search size={16}/>指定个股</button></div>
        <label htmlFor="query">{mode === 'thesis' ? '输入行业、主题、政策或事件判断' : '输入股票名称或 6 位代码（如：绿的谐波 / 688017）'}</label>
        <textarea id="query" value={query} onChange={(event) => setQuery(event.target.value)} aria-invalid={Boolean(error)} />
        {isStockMode && <details className="stock-extra"><summary>补充你的判断 / 方向 / 时间（可选）</summary><textarea id="stock-extra-note" value={extraNote} onChange={(event) => setExtraNote(event.target.value)} placeholder="例如：关注机器人减速器赛道，未来一周观察回踩支撑后的承接力度" rows={2}/></details>}
        {error && <div className="error"><AlertTriangle size={16}/><span>{error}</span></div>}
        <div className="input-examples"><span>试试这些观点</span>{DEMO_THESIS_SCENARIOS.map((item) => <button key={item.key} onClick={() => applyExample('thesis', item.input)}>{item.label}</button>)}<button onClick={() => applyExample('stock', stockScenario.input)}>贵州茅台一周修复</button></div>
        <div className="input-footer"><span><Info size={14}/>实时行情 + AI 分析 · 演示模式离线可完整跑通</span><button className="btn secondary demo-run-btn" disabled={loading} onClick={runOneClickDemo}><CircleDot size={16}/>一键跑通完整示例</button><button className="btn primary discover-btn" disabled={loading} onClick={discover}>{loading ? <><RefreshCw className="spin" size={16}/>{loadingLabel}{loadingElapsed >= 5 ? <em className="elapsed"> {loadingElapsed}s</em> : null}</> : <><Search size={16}/>{isStockMode ? '开始分析' : '发现标的'}</>}</button></div>
      </section>

      {directNote && <div className="direct-note"><AlertTriangle size={16}/><span>{directNote}</span></div>}
      {stage !== 'input' && <section className="interpretation"><div className="interpret-title"><BadgeCheck size={17}/>您的观点概览</div><div className="interpret-grid">{Object.entries(scenario.interpretation).map(([key, value]) => <div key={key}><span>{{ subject: '关注方向', direction: '您的判断', horizon: '关注周期', catalyst: '潜在催化', unknown: '待确认信息' }[key]}</span><strong>{value}</strong></div>)}</div></section>}

      {stage !== 'input' && !isStockMode && <section id="candidates" className="block">
        <div className="section-head"><div><span className="section-no">02 / 验证标的</span><h2>{candidateSectionTitle}</h2><p>{candidateSectionDescription}</p></div><Pill>{candidatePoolLabel}</Pill></div>
        <div className="strategy-note"><Target size={18}/><div><strong>筛选思路</strong><p>{scenario.strategy}</p></div></div>
        <div className="candidate-grid">{scenario.candidates.map((candidate, index) => {
          const scoreTone = candidate.score >= 75 ? 'high' : candidate.score >= 60 ? 'medium' : 'low'
          const isTargetStock = isStockMode && index === 0
          const isComparison = isStockMode && index > 0
          const rankLabel = isStockMode ? (isTargetStock ? '目标股票' : `对照参照 ${index}`) : `验证 ${index + 1}`
          const scoreLabel = isComparison ? '参照度' : '匹配度'
          const roleLabel = isStockMode ? (isTargetStock ? '本轮验证对象' : '对照用途') : '验证作用'
          const quote = quotes[candidate.code]
          const price = quote?.price ?? candidate.price
          const change = quote?.changePct ?? candidate.change
          return <article className={`candidate ${selected?.code === candidate.code ? 'selected' : ''}`} key={candidate.code}>
          <div className="candidate-top"><span className="rank">{rankLabel}</span><div className={`match-score ${scoreTone}`}><strong>{candidate.score}</strong><span>{scoreLabel}</span></div></div>
          <div className="company"><div><h3>{candidate.name}</h3><span>{candidate.code}</span></div><div><strong>¥{price.toFixed(2)}</strong><span className={change >= 0 ? 'up' : 'down'}>{change >= 0 ? '+' : ''}{change}%</span></div></div>
          <div className="role"><Target size={15}/><div><span>{roleLabel}</span><strong>{candidate.role}</strong></div></div>
          <div className="tags">{candidate.tags.map((tag) => <Pill key={tag} tone="accent">{tag}</Pill>)}</div>
          <dl><div><dt>{isComparison ? '参照依据' : '匹配依据'}</dt><dd>{candidate.reason}</dd></div><div><dt>{isComparison ? '如何辅助判断' : '为什么值得关注'}</dt><dd>{candidate.difference}</dd></div><div className="doubt"><dt>主要风险</dt><dd>{candidate.doubt}</dd></div></dl>
          <div className="candidate-foot"><span><Clock3 size={12}/>{quotesAt ? `实时行情 · ${new Date(quotesAt).toLocaleTimeString('zh-CN')} 抓取` : '行情获取中…'}</span>{isComparison ? <span className="btn ghost small" aria-disabled="true">仅作对照，不进入分析</span> : <button className="btn secondary choose-btn" onClick={() => startCommittee(candidate)}>{isTargetStock ? `开始验证${candidate.name}` : '选择并开始分析'}<ChevronRight size={15}/></button>}</div>
        </article>})}</div>
      </section>}

      {(stage === 'committee' || stage === 'verdict') && selected && <section id="committee" className="block">
        <div className="section-head"><div><span className="section-no">03 / 多方分析</span><h2>{selected.name} · 多方分析</h2><p>{committeeDescription}</p></div><Pill tone="accent">{activeMembers.length} 个视角</Pill></div>
        <div className="committee-track">{activeMembers.map((member, index) => { const current = stage === 'committee' && index === committeeStep; const complete = stage === 'verdict' || index < committeeStep; const status = complete ? '已完成' : current ? committeePhase === 'thinking' ? '思考中' : '正在生成' : '等待中'; return <div className={`track-item ${complete ? 'complete' : ''} ${current ? 'active' : ''}`} key={member.key}><span>{complete ? <Check size={14}/> : current ? <RefreshCw className="spin" size={14}/> : index + 1}</span><div><strong>{member.label}</strong><small>{status}</small></div></div>})}</div>
        {stage === 'committee' && committeeStep >= 0 && activeMembers[committeeStep] && <div className={`speaker-status ${activeMembers[committeeStep].tone}`}><span className="speaker-pulse"><RefreshCw className="spin" size={17}/></span><div><strong>{activeMembers[committeeStep].label}{committeePhase === 'thinking' ? '正在思考…' : '正在整理分析…'}</strong><p>{activeMembers[committeeStep].key === 'system' ? '正在逐条读取您保存的规则，仅按原文核对条件与冲突。' : committeePhase === 'thinking' ? '正在阅读业务、行情与风险依据，形成独立判断。' : '已形成核心观点，正在生成详细分析与证据索引。'}</p></div></div>}
        <div className="committee-list">{activeCommittee.map((member) => { const Icon = memberIcon(member.key); const open = expandedMember === member.key; return <article className={`member ${member.tone}`} key={member.key}><button className="member-head" onClick={() => setExpandedMember(open ? null : member.key)}><span className="member-icon"><Icon size={18}/></span><div><span>{member.label} · 已完成</span><strong>{member.summary}</strong><small>{open ? '收起完整分析' : '展开完整分析与依据'}</small></div><b>{member.score}</b><ChevronDown className={open ? 'rotate' : ''} size={17}/></button>{open && <div className="member-detail"><div className="member-conclusion"><span>核心结论</span><strong>{member.conclusion}</strong></div><div className="analysis-copy">{member.analysis.map((paragraph, index) => <p key={paragraph}><b>{index + 1}</b>{paragraph}</p>)}</div><div className="basis-grid"><div><h4>分析依据</h4><ul>{member.basis.map((item) => <li key={item}>{item}</li>)}</ul></div><div className="evidence-gap"><h4>待补充信息</h4><p>{member.gap}</p></div></div><div className="evidence-list"><h4>证据与来源</h4>{member.evidence.map((item) => <a key={item.id} href={item.url} target="_blank" rel="noreferrer"><span>{item.id}</span><div><strong>{item.name}</strong><small>数据日期：{item.date}</small></div><ChevronRight size={14}/></a>)}</div></div>}</article>})}</div>
        {stage === 'committee' && <div className="committee-footnote">当前视角完成后，将自动进入下一位。综合判断只会在{tradingSystem ? '乐观、悲观、风控和“我的系统”' : '乐观、悲观和风控'}全部完成后生成，约数秒完成。</div>}
      </section>}

      {stage === 'verdict' && selected && <section className="block verdict-section">
        <div className="section-head"><div><span className="section-no">04 / 综合判断</span><h2>{isStockMode ? `${selected.name} · 综合判断` : '综合判断'}</h2><p>{verdictDescription}</p></div><div className="score-total"><span>跟踪评分</span><strong>{live?.verdict.score ?? 72}</strong><em>/ 100</em></div></div>
        <div className="verdict-grid"><div className="score-panel">{scores.map((item) => <div className="score-row" key={item.label}><div><strong>{item.label}</strong><span>{item.help}</span></div><div className="score-meter"><i style={{ width: `${item.value}%` }}/></div><b>{item.value}</b></div>)}</div><aside className="verdict-card"><span className="verdict-label">系统综合判断</span><h3>{live?.verdict.title ?? '暂不行动，继续观察'}</h3><p>{live?.verdict.conclusion ?? '业务关联与中期需求逻辑较强；市场反映程度和订单证据缺口构成主要扣分。建议用一周窗口观察价格确认与新增证据，不将评分理解为上涨概率。'}</p><div className="deduction"><AlertTriangle size={15}/><span>{live?.verdict.deduction || '主要扣分：市场拥挤、最新订单缺失、短期事件风险'}</span></div>{live?.marketNote && <div className="ai-disclaimer"><Database size={14}/><p>{live.marketNote}</p></div>}<button className="btn primary full" onClick={openRisk}><CalendarClock size={16}/>生成一周观察计划</button></aside></div>
      </section>}
      </> : view === 'portfolio' ? <section className="portfolio-page">
        <div className="portfolio-hero"><div><h1>组合体检</h1></div><div className={`portfolio-total ${getScoreTone(portfolioAnalysis.score)}`}><span>组合评分</span><strong>{portfolioLive ? portfolioAnalysis.score : '--'}</strong></div></div>
        <div className="portfolio-layout">
          <section className="panel portfolio-input-panel"><div className="section-head"><div><span className="section-no">01 / 添加组合</span><h2>录入股票</h2></div><Pill tone="success">我的组合</Pill></div><textarea className="portfolio-textarea" value={portfolioDraft} onChange={(event) => { setPortfolioDraft(event.target.value); setPortfolioError('') }} aria-invalid={Boolean(portfolioError)}/>{portfolioError && <div className="error"><AlertTriangle size={16}/><span>{portfolioError}</span></div>}<div className="portfolio-input-actions"><button className="btn secondary" onClick={() => setPortfolioDraft('中际旭创 5%\n浪潮信息 4%\n贵州茅台 8%\n宁德时代 6%\n招商银行 10%')}>填入示例</button><button className="btn primary" disabled={portfolioAdding} onClick={addManualPortfolioItems}>{portfolioAdding ? <><RefreshCw className="spin" size={15}/>AI 识别中…</> : <><Plus size={15}/>添加到组合</>}</button></div></section>
          <section className="panel portfolio-list-panel"><div className="section-head"><div><span className="section-no">02 / 组合名单</span><h2>当前组合</h2></div><button className="btn primary" disabled={portfolioLoading} onClick={runPortfolioAnalysis}>{portfolioLoading ? <><RefreshCw className="spin" size={15}/>AI 分析中…</> : <><PieChart size={15}/>综合分析</>}</button></div>{portfolioItems.length === 0 ? <div className="portfolio-empty"><Layers3 size={28}/><h3>还没有组合名单</h3><p>先完成一次分析并留档，再点击“加入组合”；也可以从左侧示例直接添加。</p></div> : <div className="portfolio-holdings">{portfolioItems.map((item) => <article className="holding-card" key={item.code}><div><strong>{item.name}</strong><span>{item.code} · 来源：{item.source}</span></div><div className="holding-weight"><b>{item.weight}%</b><small>模拟仓位</small></div><button className="icon-btn danger-icon" aria-label={`移除 ${item.name}`} onClick={() => removePortfolioItem(item.code)}><Trash2 size={15}/></button></article>)}</div>}</section>
        </div>
        {portfolioReportReady && <section id="portfolio-report" className="portfolio-report block"><div className="section-head"><div><span className="section-no">03 / 综合分析报告</span><h2>组合评分与优化建议</h2><p>围绕当前名单给出基础判断、组合管理、交易系统冲突和绿色高分组合建议。</p></div><div className={`score-total portfolio-score ${getScoreTone(portfolioAnalysis.score)}`}><span>组合总分</span><strong>{portfolioAnalysis.score}</strong><em>/ 100</em></div></div>
          <div className="portfolio-summary-grid"><div><span>组合数量</span><strong>{portfolioItems.length} 只</strong><small>当前名单</small></div><div><span>模拟仓位合计</span><strong>{portfolioAnalysis.totalWeight}%</strong><small>不代表账户真实仓位</small></div><div><span>最大主题暴露</span><strong>{portfolioAnalysis.maxTheme ? `${portfolioAnalysis.maxTheme[0]} ${portfolioAnalysis.maxTheme[1].weight}%` : '--'}</strong><small>{portfolioAnalysis.maxTheme ? portfolioAnalysis.maxTheme[1].names.join('、') : '暂无'}</small></div><div><span>防御资产占比</span><strong>{portfolioAnalysis.defensiveWeight}%</strong><small>白酒与银行金融</small></div></div>
          <div className="portfolio-report-grid"><section className="report-card"><h3><FileSearch size={16}/>基础判断</h3>{portfolioAnalysis.items.map((item) => <div className="judgement-row" key={item.code}><div><strong>{item.name}</strong><span>{item.profile.role}</span></div><p>{item.profile.opportunity}</p><small>主要风险：{item.profile.risk}</small><button className="btn ghost" onClick={() => deepAnalyzePortfolioItem(item)}>深入分析</button></div>)}</section><section className="report-card"><h3><Layers3 size={16}/>主题暴露与风险重叠</h3>{Object.entries(portfolioAnalysis.themes).map(([theme, info]) => <div className="theme-row" key={theme}><div><strong>{theme}</strong><span>{info.names.join('、')}</span></div><b>{info.weight}%</b></div>)}<p className="report-note">{portfolioAnalysis.note}</p></section></div>
          <div className="portfolio-report-grid"><section className="report-card"><h3><Scale size={16}/>组合管理</h3><ul className="report-list">{portfolioAnalysis.management.map((item) => <li key={item}>{item}</li>)}</ul></section><section className="report-card"><h3><Target size={16}/>优化组合建议</h3><div className={`combo-current ${getScoreTone(portfolioAnalysis.score)}`}><span>当前完整组合</span><strong>{portfolioItems.map((item) => item.name).join(' + ')}</strong><b>{portfolioAnalysis.score} 分</b></div>{portfolioAnalysis.score >= 75 ? <p className="report-note">当前组合已进入绿色区间，优先维持结构并定期复核高波动标的。</p> : portfolioAnalysis.combinations.length === 0 ? <p className="report-note">暂未找到高于当前组合且达到绿色区间的子组合，建议先补充防御资产或降低主题重复暴露。</p> : <div className="combo-list">{portfolioAnalysis.combinations.map((combo) => <div className="combo-card" key={combo.names.join('-')}><div><strong>{combo.names.join(' + ')}</strong><span>{combo.reason}</span></div><b>{combo.score}</b></div>)}</div>}</section></div>
          <p className="report-note portfolio-market-note">{portfolioAnalysis.marketNote}</p><div className="ai-disclaimer"><ShieldCheck size={17}/><p>组合体检基于你录入的标的与实时行情快照生成，只用于结构诊断与复核优先级排序，不构成投资建议，也不代表收益预测或上涨概率。</p></div></section>}
      </section> : view === 'review' ? <section className="review-page">
        <div className="portfolio-hero review-hero"><div><h1>复盘教练</h1></div><div className="portfolio-total high"><span>历史复盘</span><strong>{reviewRecords.length}</strong></div></div>
        <div className="review-layout"><section className="panel review-input-panel"><div className="section-head"><div><span className="section-no">01 / 选择复盘类型</span><h2>个股复盘或组合复盘</h2><p>复盘对照留档的观察计划与实际操作记录，区分不可控行情和可优化动作；不自动读取券商成交数据。</p></div><Pill tone="success">复盘教练</Pill></div><div className="mode-tabs review-tabs"><button className={reviewMode === 'stock' ? 'active' : ''} onClick={() => { setReviewMode('stock'); setReviewReportReady(false) }}><FileSearch size={16}/>个股复盘</button><button className={reviewMode === 'portfolio' ? 'active' : ''} onClick={() => { setReviewMode('portfolio'); setReviewReportReady(false) }}><PieChart size={16}/>组合复盘</button></div>{reviewMode === 'stock' && <div className="review-source"><span>复盘对象</span><strong>{reviewArchive ? getArchiveFileName(reviewArchive) : '未从留档选择，使用通用个股复盘'}</strong><small>建议从留档卡片点击“开始复盘”，可自动带入原观察计划。</small></div>}{reviewMode === 'portfolio' && <div className="review-source"><span>复盘对象</span><strong>{portfolioItems.length} 只组合名单</strong><small>{portfolioItems.length ? portfolioItems.map((item) => item.name).join('、') : '可先在组合体检中添加股票'}</small></div>}<label htmlFor="review-operation">实际操作过程</label><textarea id="review-operation" value={reviewOperation} onChange={(event) => { setReviewOperation(event.target.value); setReviewError('') }} aria-invalid={Boolean(reviewError)}/><label htmlFor="review-reason">当时判断或心理原因</label><textarea id="review-reason" className="review-small-textarea" value={reviewReason} onChange={(event) => { setReviewReason(event.target.value); setReviewError('') }} aria-invalid={Boolean(reviewError)}/><div className="review-result-row"><div><label>最终结果</label><select value={reviewResult} onChange={(event) => setReviewResult(event.target.value as '盈利' | '亏损' | '持平')}><option>盈利</option><option>亏损</option><option>持平</option></select></div><div><label htmlFor="review-pnl">盈亏幅度</label><input id="review-pnl" value={reviewPnl} onChange={(event) => setReviewPnl(event.target.value)} placeholder="例如 -3.6%"/></div></div><label htmlFor="review-question">想复盘的问题，可选</label><input id="review-question" value={reviewQuestion} onChange={(event) => setReviewQuestion(event.target.value)} placeholder="例如：这是行情问题还是纪律问题？"/>{reviewError && <div className="error"><AlertTriangle size={16}/><span>{reviewError}</span></div>}<button className="btn primary full" disabled={reviewLoading} onClick={runReview}>{reviewLoading ? <><RefreshCw className="spin" size={16}/>AI 复盘生成中…</> : <><ClipboardCheck size={16}/>生成复盘报告</>}</button></section><aside className="panel review-history"><div className="section-head"><div><span className="section-no">历史复盘</span><h2>最近记录</h2><p>按月收纳、可收起；支持收藏置顶、重命名与删除。</p></div></div>{reviewRecords.length === 0 ? <div className="portfolio-empty"><ClipboardCheck size={28}/><h3>暂无复盘记录</h3><p>生成一次复盘后会保存在当前浏览器。</p></div> : <div className="review-records">{reviewGroups.pinned.length > 0 && <section className="review-group pinned"><div className="review-group-head"><Star size={13}/><strong>收藏置顶</strong><span>{reviewGroups.pinned.length} 条</span></div><div className="review-group-body">{reviewGroups.pinned.map(reviewRecordCard)}</div></section>}{reviewGroups.months.map(({ month, records, dates }) => { const collapsed = collapsedMonths[month]; return <section className="review-group" key={month}><button className="review-group-head" onClick={() => toggleMonth(month)} aria-expanded={!collapsed}><ChevronRight size={14} className={collapsed ? '' : 'rotate'}/><strong>{monthLabel(month)}</strong><span>{records.length} 条</span></button>{!collapsed && <div className="review-group-body">{dates.map(([date, items]) => <div className="review-date-block" key={date}><div className="review-date-label">{dateLabel(date)}</div>{items.map(reviewRecordCard)}</div>)}</div>}</section>})}</div>}</aside></div>
        {reviewReportReady && <section id="review-report" className="review-report block"><div className="section-head"><div><span className="section-no">02 / 复盘报告</span><h2>{reviewAnalysis.targetName} · 结论</h2></div><Pill tone={reviewResult === '亏损' ? 'warning' : 'success'}>{reviewResult} {reviewPnl}</Pill></div><div className="review-conclusion"><h3>核心结论</h3><p>{reviewAnalysis.conclusion}</p></div><div className="review-grid review-insight-grid"><section className="report-card review-insight good"><h3><CheckCircle2 size={22}/>做得好的地方</h3><ul>{reviewAnalysis.positives.map((item) => <li key={item}>{item}</li>)}</ul></section><section className="report-card review-insight bad"><h3><AlertTriangle size={22}/>做得不好的地方</h3><ul>{reviewAnalysis.issues.map((item) => <li key={item}>{item}</li>)}</ul></section></div><div className="review-grid review-insight-grid"><section className="report-card review-insight unavoidable"><h3><ShieldQuestion size={22}/>无法提前控制</h3><ul>{reviewAnalysis.unavoidable.map((item) => <li key={item}>{item}</li>)}</ul></section><section className="report-card review-insight action"><h3><Target size={22}/>下次怎么做</h3><ul>{reviewAnalysis.nextActions.map((item) => <li key={item}>{item}</li>)}</ul></section></div><section className="report-card review-compare"><h3><FileText size={18}/>计划 vs 实际</h3><div className="compare-table">{reviewAnalysis.comparisons.map(([step, plan, actual, judgement]) => <div className="compare-row" key={step}><strong>{step}</strong><span>{plan}</span><span>{actual}</span><b className={judgement === '不可控' ? 'neutral' : 'warn'}>{judgement}</b></div>)}</div></section><p className="report-note review-market-note">{reviewAnalysis.marketNote}</p></section>}
      </section> : <section className="archive-page">
        <div className="archive-hero"><div><h1>留档</h1></div><div className="archive-count"><strong>{archives.length}</strong><span>份留档</span></div></div>
        <div className="archive-toolbar"><div><h2>全部留档</h2><p>按最近更新时间排序</p></div><button className="btn primary" onClick={showAssistant}><BrainCircuit size={15}/>开始新的分析</button></div>
        {archives.length === 0 ? <div className="archive-empty"><span><FolderOpen size={27}/></span><h3>还没有留档</h3><p>完成一次分析并生成观察计划后，点击“留档”即可保存本次观点、验证标的、综合判断和观察计划。</p><button className="btn primary" onClick={showAssistant}>开始第一次分析<ChevronRight size={15}/></button></div> : <div className="archive-grid">{archives.map((item) => <article className="archive-card" key={item.id}>
          <div className="archive-card-top"><Pill tone="success">{item.status}</Pill><span>更新于 {new Date(item.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></div>
          <div className="archive-company"><div><h3>{getArchiveFileName(item)}</h3><span>{item.code}</span></div><div className="archive-score"><strong>{item.score}</strong><span>综合评分</span></div></div>
          <p className="archive-query">{item.query}</p>
          <div className="archive-verdict"><span>综合判断</span><strong>{item.verdict}</strong></div>
          <div className="archive-docs"><div><FileSearch size={16}/><span><strong>研究分析</strong><small>假设、验证标的与多方审查</small></span></div><div><FileText size={16}/><span><strong>观察计划</strong><small>触发价、失效价与待补证据</small></span></div>{item.tradingSystemText && <div className="archive-system-doc"><ShieldCheck size={16}/><span><strong>我的系统</strong><small>保存当次规则与推导结论</small></span></div>}</div>
          <div className="archive-meta"><span><CalendarClock size={13}/>有效至 2026-09-01</span><span>观察参考价 ¥{item.price.toFixed(2)}</span></div>
          <div className="archive-actions"><button className="btn secondary" onClick={() => setActiveArchive(item)}>查看完整档案</button><button className="btn ghost" onClick={() => addArchiveToPortfolio(item)}><Plus size={14}/>加入组合</button><button className="btn ghost" onClick={() => startReviewFromArchive(item)}><ClipboardCheck size={14}/>开始复盘</button><button className="icon-btn danger-icon" aria-label={`删除 ${getArchiveFileName(item)} 留档`} onClick={() => deleteArchive(item.id)}><Trash2 size={16}/></button></div>
        </article>)}</div>}
      </section>}
    </main>

    {systemModalOpen && <div className="modal-layer"><div className="modal system-modal"><button className="icon-btn close" onClick={() => setSystemModalOpen(false)} aria-label="关闭交易系统编辑"><X size={18}/></button><div className="modal-icon system"><FileText size={25}/></div><h2>{tradingSystem ? '查看与修改交易系统' : '添加我的交易系统'}</h2><p>请使用自然语言写清入场、仓位、加减仓和退出规则。分析时只按您提供的原文推导；缺少的规则会标记为“依据不足”。</p><label htmlFor="system-rules">交易规则</label><textarea id="system-rules" className="system-textarea" value={systemDraft} onChange={(event) => { setSystemDraft(event.target.value); setSystemError('') }} aria-invalid={Boolean(systemError)} placeholder="例如：仅在收盘价站上 20 日均线且行业指数同步走强时建仓；首次仓位 5%，确认后最高 10%；跌破关键支撑则退出……"/>{systemError && <div className="error"><AlertTriangle size={16}/><span>{systemError}</span></div>}<div className="system-helper"><span>{systemDraft.trim().length} 字</span><span>规则将仅保存在当前浏览器</span></div><div className="modal-actions">{tradingSystem ? <button className="btn text-danger" onClick={clearTradingSystem}>清除规则</button> : <button className="btn ghost" onClick={() => setSystemModalOpen(false)}>取消</button>}<button className="btn primary" onClick={saveTradingSystem}>保存并启用</button></div></div></div>}

    {riskModal && <div className="modal-layer"><div className="modal"><button className="icon-btn close" onClick={() => setRiskModal(false)} aria-label="关闭"><X size={18}/></button><div className="modal-icon"><ShieldQuestion size={25}/></div><h2>生成前确认风险边界</h2><p>以下观察计划由 AI 基于实时行情与公开信息自动生成，仅供研究参考，不构成投资建议，也不作任何收益保证。</p><label className="check"><input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)}/><span>我已确认：分析内容由 AI 生成，可能遗漏、延迟或出错；投资决策由我独立做出，风险与损益由我自己承担。</span></label><div className="legal-note">AI 生成内容不构成投资建议，不保证准确性、完整性或收益；请独立判断、自负盈亏。</div><div className="modal-actions"><button className="btn ghost" onClick={() => setRiskModal(false)}>返回综合判断</button><button className="btn primary" disabled={!acknowledged} onClick={createCard}>确认并生成观察计划</button></div></div></div>}

    {cardOpen && <div className={`drawer-overlay ${cardOpen ? 'show' : ''}`} onClick={closeCard}/>}
    {cardOpen && <aside className="action-drawer open" aria-hidden={false}>
      <div className="drawer-head"><div><span className="section-no">05 / 一周观察计划</span><h2>{selected?.name}</h2></div><button className="icon-btn" onClick={closeCard} aria-label="关闭观察计划"><X size={18}/></button></div>
      <div className="drawer-body"><div className="expiry"><CalendarClock size={19}/><div><span>观察窗口</span><strong>{planWindow}</strong><small>{quotesAt ? `基于 ${new Date(quotesAt).toLocaleString('zh-CN')} 实时行情 · 到期需重新分析` : '到期需重新分析'}</small></div></div>
        <div className="price-anchor action-overview"><div><span>综合判断</span><strong className="watch">{live?.verdict.title ?? '暂不行动'}</strong><small>等待价格与证据确认</small></div><div><span>若条件触发</span><strong>首次上限 {live?.plan.initialPosition ?? '5%'}</strong><small>确认后最高 {live?.plan.maxPosition ?? '10%'}</small></div></div>
        <section className="trade-levels"><h3><Scale size={16}/>观察触发与失效规则</h3><div className="trade-level-grid"><div><span>观察触发价</span><strong>¥{live?.plan.entryPrice ?? '—'}</strong><small>高于参考价不追价</small></div><div className="stop"><span>失效复核价</span><strong>¥{live?.plan.stopPrice ?? '—'}</strong><small>收盘确认后重新判断</small></div><div className="take"><span>兑现观察区间</span><strong>{live?.plan.takeRange || '—'}</strong><small>只作跟踪，不自动成交</small></div></div></section>
        <ActionBlock title="本周观察重点" icon={CircleDot} items={live?.plan.focus ?? []}/>
        <ActionBlock title="满足条件后再考虑" icon={TrendingUp} items={live?.plan.satisfy ?? []}/>
        <ActionBlock title="降低关注条件" icon={TrendingDown} tone="warning" items={live?.plan.reduce ?? []}/>
        <ActionBlock title="取消观察条件" icon={AlertTriangle} tone="danger" items={live?.plan.cancel ?? []}/>
        {tradingSystem && <section className="system-snapshot"><div><ShieldCheck size={17}/><h3>本次使用的交易系统</h3></div><p>{tradingSystem.text}</p><strong>{live?.members.find((m) => m.key === 'system')?.conclusion || '系统结论：依据不足，保持观察，不触发首次 5% 观察仓位。'}</strong></section>}
        <ActionBlock title="本周待补证据" icon={FileSearch} tone="warning" items={live?.plan.pending ?? []}/>
        <div className="ai-disclaimer"><ShieldCheck size={17}/><p>{live?.marketNote || '本观察计划基于实时行情与 AI 分析生成，只用于记录触发条件、失效条件和待补证据，不构成持牌证券投资建议。'}</p></div>
      </div><div className="drawer-actions archive-drawer-actions"><button className={`btn archive-primary ${justArchived ? 'archived' : ''}`} onClick={saveArchive}>{justArchived ? <CheckCircle2 size={17}/> : <Archive size={17}/>} {justArchived ? '已留档' : archives.some((item) => item.id === `${mode}-${scenario.interpretation.subject}-${selected?.code}`) ? '更新留档' : '保存为留档'}</button><button className="btn ghost" onClick={() => window.print()}>打印</button><button className="btn ghost" onClick={closeCard}>关闭观察计划</button></div>
    </aside>}
    {activeArchive && <div className="modal-layer"><div className="archive-detail-modal"><div className="archive-detail-head"><div><span className="section-no">完整留档</span><h2>{getArchiveFileName(activeArchive)}</h2><p>{activeArchive.code}</p><p>{activeArchive.query}</p></div><button className="icon-btn" onClick={() => setActiveArchive(null)} aria-label="关闭留档详情"><X size={18}/></button></div><div className="archive-detail-body"><section><div className="doc-title"><FileSearch size={18}/><div><span>文档 01</span><h3>研究分析</h3></div></div><div className="detail-summary"><div><span>分析任务</span><strong>{activeArchive.taskTitle || activeArchive.subject}</strong></div><div><span>综合判断</span><strong>{activeArchive.verdict}</strong></div><div><span>跟踪评分</span><strong>{activeArchive.score} / 100</strong></div></div><div className="detail-opinions">{(activeArchive.members?.length ? activeArchive.members : baseCommittee).map((member) => <div key={member.key}><span>{member.label}</span><p>{member.summary}</p></div>)}</div></section>{activeArchive.tradingSystemText && <section><div className="doc-title"><ShieldCheck size={18}/><div><span>规则快照</span><h3>我的交易系统</h3></div></div><p className="archived-system-text">{activeArchive.tradingSystemText}</p><div className="detail-summary"><div><span>规则更新时间</span><strong>{activeArchive.tradingSystemUpdatedAt ? new Date(activeArchive.tradingSystemUpdatedAt).toLocaleString('zh-CN') : '未记录'}</strong></div><div><span>系统原始结论</span><strong>{activeArchive.systemVerdict || '依据不足'}</strong></div></div></section>}<section><div className="doc-title"><FileText size={18}/><div><span>文档 02</span><h3>观察计划</h3></div></div><div className="detail-summary"><div><span>若条件触发</span><strong>首次 {activeArchive.initialPosition || '5%'} · 最高 {activeArchive.maxPosition || '10%'}</strong></div><div><span>触发 / 失效</span><strong>¥{activeArchive.entryPrice || 162} / ¥{activeArchive.stopPrice || 157}</strong></div><div><span>兑现观察区间</span><strong>{activeArchive.takeRange || '¥175 — ¥178'}</strong></div></div><p className="detail-note">{activeArchive.marketNote || '基于生成时的实时行情快照，价格触及不代表自动交易；请随最新行情持续复核。'}</p></section></div><div className="archive-detail-actions"><button className="btn ghost" onClick={() => deleteArchive(activeArchive.id)}><Trash2 size={14}/>删除留档</button><button className="btn secondary" onClick={() => addArchiveToPortfolio(activeArchive)}><Plus size={14}/>加入组合</button><button className="btn secondary" onClick={() => startReviewFromArchive(activeArchive)}><ClipboardCheck size={14}/>开始复盘</button><button className="btn primary" onClick={() => { setActiveArchive(null); showAssistant(); setToast('已返回分析助手，可基于最新数据重新复核') }}><RefreshCw size={14}/>继续复核</button></div></div></div>}

    {guideOpen && <div className="modal-layer"><div className="modal guide-modal"><button className="icon-btn close" onClick={closeGuide} aria-label="关闭"><X size={18}/></button><div className="modal-icon"><ClipboardCheck size={25}/></div><h2>复盘前，先确认几个关键点</h2><p>填什么都行，不确定的步骤可以直接跳过；AI 会结合你的选择和已有描述生成复盘。</p><div className="guide-progress"><span>第 {guideStep + 1} / {REVIEW_GUIDE_STEPS.length} 步</span><div className="guide-progress-bar"><i style={{ width: `${((guideStep + 1) / REVIEW_GUIDE_STEPS.length) * 100}%` }}/></div></div>{(() => { const step = REVIEW_GUIDE_STEPS[guideStep]; const answer = guideAnswers[step.key]; return <div className="guide-step" key={step.key}><h3>{step.question}</h3><div className="guide-options">{step.options.map((opt, index) => { const letter = 'ABC'[index]; const selected = answer?.option === opt.label; return <button key={opt.label} className={`guide-option ${selected ? 'selected' : ''}`} onClick={() => setGuideAnswers((prev) => ({ ...prev, [step.key]: { option: opt.label, custom: '' } }))}><b>{letter}</b><span><strong>{opt.label}</strong><small>{opt.desc}</small></span></button> })}<button className={`guide-option ${answer?.option === '其他' ? 'selected' : ''}`} onClick={() => setGuideAnswers((prev) => ({ ...prev, [step.key]: { option: '其他', custom: prev[step.key]?.custom || '' } }))}><b>D</b><span><strong>其他情况（自己描述）</strong><small>选择后可输入你想表达的情况或问题</small></span></button></div>{answer?.option === '其他' && <input className="guide-custom" value={answer.custom} onChange={(e) => setGuideAnswers((prev) => ({ ...prev, [step.key]: { option: '其他', custom: e.target.value } }))} placeholder="在这里描述你的情况…" maxLength={200}/>}</div> })()}<div className="modal-actions guide-actions"><button className="btn ghost" onClick={() => startGuidedReview(true)}>跳过引导，直接复盘</button><button className="btn primary" onClick={() => { if (guideStep >= REVIEW_GUIDE_STEPS.length - 1) { startGuidedReview(false) } else { setGuideStep((s) => s + 1) } }}>{guideStep >= REVIEW_GUIDE_STEPS.length - 1 ? '开始 AI 复盘' : '下一步'}</button></div></div></div>}
    {stockGuideOpen && <div className="modal-layer"><div className="modal guide-modal"><button className="icon-btn close" onClick={() => setStockGuideOpen(false)} aria-label="关闭"><X size={18}/></button><div className="modal-icon"><Target size={25}/></div><h2>{isStockMode ? '分析前，先确认你的判断' : '补充一下，AI 才能更懂你的观点'}</h2><p>{isStockMode ? '只填股票名也可以直接分析；多花几步确认方向与关注点，AI 的分析会更贴合你的想法。不确定就跳过。' : '只输入一句话也可以直接分析；多花几步补充方向与关注点，AI 的分析会更贴合你的想法。不确定就跳过。'}</p><div className="guide-progress"><span>第 {stockGuideStep + 1} / {guideSteps.length} 步</span><div className="guide-progress-bar"><i style={{ width: `${((stockGuideStep + 1) / guideSteps.length) * 100}%` }}/></div></div>{(() => { const step = guideSteps[stockGuideStep]; const answer = stockGuideAnswers[step.key]; return <div className="guide-step" key={step.key}><h3>{step.question}</h3><div className="guide-options">{step.options.map((opt, index) => { const letter = 'ABC'[index]; const selected = answer?.option === opt.label; return <button key={opt.label} className={`guide-option ${selected ? 'selected' : ''}`} onClick={() => setStockGuideAnswers((prev) => ({ ...prev, [step.key]: { option: opt.label, custom: '' } }))}><b>{letter}</b><span><strong>{opt.label}</strong><small>{opt.desc}</small></span></button> })}<button className={`guide-option ${answer?.option === '其他' ? 'selected' : ''}`} onClick={() => setStockGuideAnswers((prev) => ({ ...prev, [step.key]: { option: '其他', custom: prev[step.key]?.custom || '' } }))}><b>D</b><span><strong>其他（自己描述）</strong><small>选择后可输入你想表达的方向或关注点</small></span></button></div>{answer?.option === '其他' && <input className="guide-custom" value={answer.custom} onChange={(e) => setStockGuideAnswers((prev) => ({ ...prev, [step.key]: { option: '其他', custom: e.target.value } }))} placeholder="在这里描述你的判断…" maxLength={200}/>}</div> })()}<div className="modal-actions guide-actions"><button className="btn ghost" onClick={() => startGuidedStockAnalysis(true)}>跳过引导，直接分析</button><button className="btn primary" onClick={() => { if (stockGuideStep >= guideSteps.length - 1) { startGuidedStockAnalysis(false) } else { setStockGuideStep((s) => s + 1) } }}>{stockGuideStep >= guideSteps.length - 1 ? '开始 AI 分析' : '下一步'}</button></div></div></div>}
    {pricingOpen && <div className="modal-layer"><div className="modal pricing-modal"><button className="icon-btn close" onClick={() => setPricingOpen(false)} aria-label="关闭"><X size={18}/></button><div className="modal-icon"><BadgeCheck size={25}/></div><h2>Finance Penguin 会员方案</h2><p>当前账户：{plan.name}。基础行情分析永久免费不限次数；组合体检与复盘按档位分配次数。</p><div className="pricing-grid wide"><div className={`pricing-card ${plan.tier === 'free' ? 'current' : ''}`}><h3>免费版</h3><div className="price">¥0<small>/月</small></div><ul><li>基础行情分析：不限次数</li><li>组合体检 + 复盘：共 {FREE_PREMIUM_QUOTA} 次</li></ul>{plan.tier === 'free' ? <button className="btn secondary" disabled>当前方案</button> : <button className="btn secondary" onClick={() => { setPricingOpen(false); setToast('已切回免费版') }}>切回免费版</button>}</div><div className={`pricing-card ${plan.tier === 'plus' ? 'current' : ''}`}><h3>Plus</h3><div className="price">¥9.9<small>/月</small></div><ul><li>基础行情分析：不限次数</li><li>组合体检 + 复盘：共 {PLUS_PREMIUM_QUOTA} 次</li></ul>{plan.tier === 'plus' ? <button className="btn secondary" disabled>当前方案</button> : <button className="btn primary" onClick={() => handleUpgrade('plus')}>升级 Plus</button>}</div><div className={`pricing-card pro ${plan.tier === 'pro' ? 'current' : ''}`}><h3>专业版</h3><div className="billing-toggle"><button className={proBilling === 'month' ? 'active' : ''} onClick={() => setProBilling('month')}>¥29/月</button><button className={proBilling === 'year' ? 'active' : ''} onClick={() => setProBilling('year')}>¥299/年</button></div><ul><li>基础行情分析：不限次数</li><li>组合体检 + 复盘：不限次数</li><li>优先使用深度分析模型</li></ul>{plan.tier === 'pro' ? <button className="btn primary" disabled>已开通</button> : <button className="btn primary" onClick={() => handleUpgrade('pro', proBilling)}>{proBilling === 'year' ? '开通年付 299 元' : '开通月付 29 元'}</button>}</div></div><div className="legal-note">会员方案与配额当前保存在本地，正式账号体系上线后将随账号云端同步；年付对标月付 29 元专业版。</div></div></div>}
    {renameTarget && <div className="modal-layer"><div className="modal"><button className="icon-btn close" onClick={() => setRenameTarget(null)} aria-label="关闭"><X size={18}/></button><div className="modal-icon"><Pencil size={25}/></div><h2>重命名复盘</h2><p>修改后的名称会显示在历史复盘列表中。</p><label htmlFor="rename-title">复盘名称</label><input id="rename-title" className="rename-input" value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} maxLength={40} placeholder="输入新的复盘名称"/><div className="modal-actions"><button className="btn ghost" onClick={() => setRenameTarget(null)}>取消</button><button className="btn primary" disabled={!renameDraft.trim()} onClick={saveRename}>保存</button></div></div></div>}
    {toast && <div className="toast" role="status" aria-live="assertive"><CheckCircle2 size={20}/><div><strong>{toast}</strong><span>本次观点、验证标的、综合判断和观察计划已保存</span><button onClick={showArchives}>前往留档查看</button></div><button className="toast-close" onClick={() => setToast('')} aria-label="关闭提示"><X size={15}/></button></div>}
  </div>
}

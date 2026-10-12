// 会员方案与付费分层：免费版 / Plus（9.9 元/月，50 次）/ 专业版（29 元/月或 299 元/年，不限次数）。
import { storageGet, storageSet } from './storage'

const STORAGE_KEY = 'fp-user'

export type PlanTier = 'free' | 'plus' | 'pro'

export type PlanState = {
  name: string
  tier: PlanTier
  billing?: 'month' | 'year'   // 专业版计费方式：月付 29 / 年付 299
  createdAt: string
  premiumUsed: number          // 免费/Plus：组合体检 + 复盘 共用次数
  analysisDate: string         // YYYY-MM-DD
  analysisCount: number        // 当日分析请求数
}

export const FREE_PREMIUM_QUOTA = 10
export const PLUS_PREMIUM_QUOTA = 50
export const FREE_DEGRADE_AFTER = 100

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function defaultPlan(): PlanState {
  return { name: '本地用户', tier: 'free', billing: undefined, createdAt: new Date().toISOString(), premiumUsed: 0, analysisDate: today(), analysisCount: 0 }
}

function save(plan: PlanState) {
  storageSet(STORAGE_KEY, JSON.stringify(plan))
}

export function getPlan(): PlanState {
  try {
    const raw = storageGet(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PlanState>
      return { ...defaultPlan(), ...parsed }
    }
  } catch { /* ignore */ }
  const plan = defaultPlan()
  save(plan)
  return plan
}

/** 高级功能（组合体检 + 复盘）本档位配额：专业版不限（-1），Plus 50，免费 10。 */
export function premiumQuota(plan: PlanState): number {
  return plan.tier === 'pro' ? -1 : plan.tier === 'plus' ? PLUS_PREMIUM_QUOTA : FREE_PREMIUM_QUOTA
}

/** 免费版组合体检与复盘共用 10 次、Plus 50 次；专业版不限。返回是否放行及剩余次数。 */
export function tryUsePremium(plan: PlanState): { ok: boolean; plan: PlanState; remaining: number } {
  if (plan.tier === 'pro') return { ok: true, plan, remaining: -1 }
  const quota = plan.tier === 'plus' ? PLUS_PREMIUM_QUOTA : FREE_PREMIUM_QUOTA
  const remaining = quota - plan.premiumUsed
  if (remaining <= 0) return { ok: false, plan, remaining: 0 }
  const next = { ...plan, premiumUsed: plan.premiumUsed + 1 }
  save(next)
  return { ok: true, plan: next, remaining: remaining - 1 }
}

/** 记录一次分析请求，并判断本次是否以轻量模式运行。 */
export function trackAnalysis(plan: PlanState): { plan: PlanState; count: number; degraded: boolean } {
  const date = today()
  const base = plan.analysisDate === date ? plan : { ...plan, analysisDate: date, analysisCount: 0 }
  const count = base.analysisCount + 1
  const next = { ...base, analysisCount: count }
  save(next)
  return { plan: next, count, degraded: next.tier === 'free' && count > FREE_DEGRADE_AFTER }
}

export function upgradePlan(tier: 'plus' | 'pro', billing?: 'month' | 'year'): PlanState {
  const plan = { ...getPlan(), tier, ...(billing ? { billing } : {}) }
  save(plan)
  return plan
}

export function premiumRemaining(plan: PlanState): number {
  if (plan.tier === 'pro') return -1
  const quota = plan.tier === 'plus' ? PLUS_PREMIUM_QUOTA : FREE_PREMIUM_QUOTA
  return Math.max(0, quota - plan.premiumUsed)
}

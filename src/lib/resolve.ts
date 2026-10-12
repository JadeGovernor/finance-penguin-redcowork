import { apiPost } from './engine'

export type ResolvedStock = {
  code: string
  name: string
  market?: string
  source: 'direct' | 'eastmoney' | 'deepseek' | 'demo'
}

export async function resolveStock(text: string): Promise<ResolvedStock | null> {
  const res = await apiPost('/api/resolve', { input: text })
  if (res.status === 404) return null
  const data: { error?: string } = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || '股票识别失败，请重试或直接输入 6 位代码。')
  return data as ResolvedStock
}

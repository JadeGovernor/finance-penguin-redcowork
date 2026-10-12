// 安全存储封装：localStorage 不可用（隐私模式/沙箱内嵌浏览器）时静默降级，避免应用崩溃。
export function storageGet(key: string): string | null {
  try { return window.localStorage.getItem(key) } catch { return null }
}
export function storageSet(key: string, value: string): void {
  try { window.localStorage.setItem(key, value) } catch { /* 静默降级 */ }
}
export function storageRemove(key: string): void {
  try { window.localStorage.removeItem(key) } catch { /* 静默降级 */ }
}

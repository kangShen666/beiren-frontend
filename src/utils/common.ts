// utils.ts  过滤空参
export function filterEmptyParams<T extends Record<string, any>>(obj: T): Partial<T> {
  const result: Partial<T> = {}
  for (const key in obj) {
    const value = obj[key]
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      result[key] = value
    }
  }
  return result
}
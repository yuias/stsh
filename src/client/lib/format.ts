import { locale } from './i18n.svelte'

const encoder = new TextEncoder()

export function byteLength(text: string): number {
  return encoder.encode(text).byteLength
}

/**
 * `Intl` constructors are expensive enough to be worth reusing, and the set of
 * locales is bounded by what the app ships.
 */
function memoizeByLocale<T>(create: (tag: string) => T): () => T {
  const cache = new Map<string, T>()

  return () => {
    const tag = locale()
    let instance = cache.get(tag)
    if (!instance) {
      instance = create(tag)
      cache.set(tag, instance)
    }
    return instance
  }
}

const decimalFormatter = memoizeByLocale((tag) => new Intl.NumberFormat(tag, { maximumFractionDigits: 1 }))
const integerFormatter = memoizeByLocale((tag) => new Intl.NumberFormat(tag))

const dateFormatter = memoizeByLocale(
  (tag) =>
    new Intl.DateTimeFormat(tag, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }),
)

const relativeFormatter = memoizeByLocale((tag) => new Intl.RelativeTimeFormat(tag, { numeric: 'auto' }))

export function formatNumber(value: number): string {
  return integerFormatter().format(value)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${integerFormatter().format(bytes)} B`
  if (bytes < 1024 * 1024) return `${decimalFormatter().format(bytes / 1024)} KB`
  return `${decimalFormatter().format(bytes / (1024 * 1024))} MB`
}

export function formatTimestamp(epochMillis: number): string {
  return dateFormatter().format(new Date(epochMillis))
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
]

export function formatRelative(epochMillis: number): string {
  const delta = epochMillis - Date.now()

  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(delta) >= size) return relativeFormatter().format(Math.round(delta / size), unit)
  }
  return relativeFormatter().format(0, 'minute')
}

export function countLines(text: string): number {
  if (!text) return 0
  let lines = 1
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) lines += 1
  }
  return lines
}

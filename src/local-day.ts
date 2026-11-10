export type DayKey = `${number}-${number}-${number}`

export type DateStatus = 'future' | 'content' | 'empty'

const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u

export interface DayKeyParts {
  year: number
  month: number
  day: number
}

function localNoon({ year, month, day }: DayKeyParts) {
  const date = new Date(0)
  date.setHours(12, 0, 0, 0)
  date.setFullYear(year, month - 1, day)
  return date
}

export function dayKeyFromParts(parts: DayKeyParts): DayKey {
  const date = localNoon(parts)
  if (
    date.getFullYear() !== parts.year ||
    date.getMonth() !== parts.month - 1 ||
    date.getDate() !== parts.day
  ) {
    throw new RangeError('Invalid local calendar date')
  }
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}` as DayKey
}

export function parseDayKey(dayKey: string): DayKeyParts {
  const match = DAY_KEY_PATTERN.exec(dayKey)
  if (!match) throw new RangeError(`Invalid day key: ${dayKey}`)
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  }
  dayKeyFromParts(parts)
  return parts
}

export function isDayKey(value: unknown): value is DayKey {
  if (typeof value !== 'string') return false
  try {
    parseDayKey(value)
    return true
  } catch {
    return false
  }
}

export function toLocalDayKey(date = new Date()): DayKey {
  return dayKeyFromParts({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  })
}

/**
 * Converts a day key to local noon. Noon avoids DST transitions that can make
 * local midnight ambiguous or nonexistent in a small number of timezones.
 */
export function fromLocalDayKey(dayKey: DayKey) {
  return localNoon(parseDayKey(dayKey))
}

export function compareDayKeys(first: DayKey, second: DayKey) {
  return first < second ? -1 : first > second ? 1 : 0
}

export function addLocalDays(dayKey: DayKey, amount: number): DayKey {
  const date = fromLocalDayKey(dayKey)
  date.setDate(date.getDate() + amount)
  return toLocalDayKey(date)
}

export function addLocalMonths(dayKey: DayKey, amount: number): DayKey {
  const { year, month, day } = parseDayKey(dayKey)
  const target = new Date(0)
  target.setHours(12, 0, 0, 0)
  target.setFullYear(year, month - 1 + amount, 1)
  const finalDay = Math.min(day, daysInLocalMonth(target.getFullYear(), target.getMonth() + 1))
  target.setDate(finalDay)
  return toLocalDayKey(target)
}

export function daysInLocalMonth(year: number, month: number) {
  const date = new Date(0)
  date.setHours(12, 0, 0, 0)
  date.setFullYear(year, month, 0)
  return date.getDate()
}

export function startOfLocalMonth(dayKey: DayKey): DayKey {
  const { year, month } = parseDayKey(dayKey)
  return dayKeyFromParts({ year, month, day: 1 })
}

export function startOfLocalWeek(dayKey: DayKey, weekStartsOn = 1): DayKey {
  if (!Number.isInteger(weekStartsOn) || weekStartsOn < 0 || weekStartsOn > 6) {
    throw new RangeError('weekStartsOn must be an integer from 0 through 6')
  }
  const weekday = fromLocalDayKey(dayKey).getDay()
  return addLocalDays(dayKey, -((weekday - weekStartsOn + 7) % 7))
}

export function getMonthGridDayKeys(monthDayKey: DayKey, weekStartsOn = 1) {
  const first = startOfLocalMonth(monthDayKey)
  const gridStart = startOfLocalWeek(first, weekStartsOn)
  return Array.from({ length: 42 }, (_, index) => addLocalDays(gridStart, index))
}

export function isDayInMonth(dayKey: DayKey, monthDayKey: DayKey) {
  const day = parseDayKey(dayKey)
  const month = parseDayKey(monthDayKey)
  return day.year === month.year && day.month === month.month
}

export function getDateStatus(
  dayKey: DayKey,
  todayDayKey: DayKey,
  hasContent: boolean,
): DateStatus {
  if (compareDayKeys(dayKey, todayDayKey) > 0) return 'future'
  return hasContent ? 'content' : 'empty'
}

export function isSelectableDay(dayKey: DayKey, todayDayKey: DayKey) {
  return compareDayKeys(dayKey, todayDayKey) <= 0
}

export function dateStatusOpacity(status: DateStatus) {
  if (status === 'future') return 0.4
  if (status === 'empty') return 0.6
  return 1
}

export function formatDayKey(
  dayKey: DayKey,
  options: Intl.DateTimeFormatOptions,
  locale?: string | string[],
) {
  return new Intl.DateTimeFormat(locale, options).format(fromLocalDayKey(dayKey))
}

import { describe, expect, it } from 'vitest'
import {
  addLocalDays,
  addLocalMonths,
  dateStatusOpacity,
  fromLocalDayKey,
  getDateStatus,
  getMonthGridDayKeys,
  isDayKey,
  isSelectableDay,
  parseDayKey,
  toLocalDayKey,
} from './local-day'

describe('local day keys', () => {
  it('uses local calendar fields instead of UTC serialization', () => {
    const localLateNight = new Date(2026, 10, 10, 23, 59, 59)
    const key = toLocalDayKey(localLateNight)
    const restored = fromLocalDayKey(key)

    expect(key).toBe('2026-11-10')
    expect(restored.getFullYear()).toBe(2026)
    expect(restored.getMonth()).toBe(10)
    expect(restored.getDate()).toBe(10)
    expect(restored.getHours()).toBe(12)
  })

  it('derives the day from the active timezone around UTC boundaries', () => {
    const environment = (
      globalThis as typeof globalThis & {
        process?: { env: Record<string, string | undefined> }
      }
    ).process?.env
    if (!environment) return
    const originalTimezone = environment.TZ
    try {
      environment.TZ = 'Pacific/Kiritimati'
      expect(toLocalDayKey(new Date('2026-11-10T00:30:00.000Z'))).toBe('2026-11-10')
      environment.TZ = 'America/Los_Angeles'
      expect(toLocalDayKey(new Date('2026-11-10T00:30:00.000Z'))).toBe('2026-11-09')
    } finally {
      if (originalTimezone === undefined) delete environment.TZ
      else environment.TZ = originalTimezone
    }
  })

  it('validates impossible dates and adds days across calendar boundaries', () => {
    expect(isDayKey('2028-02-29')).toBe(true)
    expect(isDayKey('2027-02-29')).toBe(false)
    expect(() => parseDayKey('2026-13-01')).toThrow(/Invalid local calendar date/)
    expect(addLocalDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addLocalDays('2028-03-01', -1)).toBe('2028-02-29')
    expect(addLocalMonths('2026-01-31', 1)).toBe('2026-02-28')
  })

  it('builds a complete Monday-first month grid with local day arithmetic', () => {
    const grid = getMonthGridDayKeys('2026-11-10')

    expect(grid).toHaveLength(42)
    expect(grid[0]).toBe('2026-10-26')
    expect(grid[41]).toBe('2026-12-06')
    expect(fromLocalDayKey(grid[0]).getDay()).toBe(1)
  })
})

describe('date status helpers', () => {
  const today = '2026-11-10' as const

  it('marks future dates unavailable regardless of stored content', () => {
    expect(getDateStatus('2026-11-11', today, true)).toBe('future')
    expect(isSelectableDay('2026-11-11', today)).toBe(false)
    expect(dateStatusOpacity('future')).toBe(0.4)
  })

  it('distinguishes content and empty dates through today', () => {
    expect(getDateStatus('2026-11-09', today, true)).toBe('content')
    expect(getDateStatus(today, today, false)).toBe('empty')
    expect(isSelectableDay(today, today)).toBe(true)
    expect(dateStatusOpacity('content')).toBe(1)
    expect(dateStatusOpacity('empty')).toBe(0.6)
  })
})

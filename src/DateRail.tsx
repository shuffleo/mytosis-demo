import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import {
  addLocalDays,
  addLocalMonths,
  compareDayKeys,
  formatDayKey,
  fromLocalDayKey,
  getDateStatus,
  getMonthGridDayKeys,
  isDayInMonth,
  isSelectableDay,
  parseDayKey,
  startOfLocalMonth,
  startOfLocalWeek,
  toLocalDayKey,
  type DayKey,
} from './local-day'
import './DateRail.css'

export interface DateRailProps {
  selectedDayKey?: DayKey
  defaultDayKey?: DayKey
  onSelectDay?: (dayKey: DayKey) => void
  contentDayKeys?: ReadonlySet<DayKey>
  today?: Date
  dayCount?: number
  locale?: string
  theme?: 'microscope' | 'list'
  className?: string
  disabled?: boolean
}

function clampToToday(dayKey: DayKey, todayDayKey: DayKey) {
  return compareDayKeys(dayKey, todayDayKey) > 0 ? todayDayKey : dayKey
}

function dayAriaLabel(
  dayKey: DayKey,
  todayDayKey: DayKey,
  hasContent: boolean,
  locale?: string,
) {
  const date = formatDayKey(
    dayKey,
    { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
    locale,
  )
  const compactDate = `${formatDayKey(dayKey, { weekday: 'short' }, locale)} ${parseDayKey(dayKey).day}`
  const parts = [
    dayKey === todayDayKey
      ? `Today, ${compactDate}, ${date}`
      : `${compactDate}, ${date}`,
    hasContent ? 'has journal content' : 'empty',
  ]
  if (!isSelectableDay(dayKey, todayDayKey)) parts.push('unavailable')
  return parts.join(', ')
}

export function DateRail({
  selectedDayKey,
  defaultDayKey,
  onSelectDay,
  contentDayKeys = new Set<DayKey>(),
  today,
  dayCount = 11,
  locale,
  theme = 'microscope',
  className = '',
  disabled = false,
}: DateRailProps) {
  const [clock, setClock] = useState(() => today ?? new Date())
  const todayDayKey = toLocalDayKey(today ?? clock)
  const [internalDayKey, setInternalDayKey] = useState(
    () => defaultDayKey ?? todayDayKey,
  )
  const activeDayKey = clampToToday(selectedDayKey ?? internalDayKey, todayDayKey)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfLocalMonth(activeDayKey),
  )
  const [focusedDayKey, setFocusedDayKey] = useState(activeDayKey)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const daysRef = useRef<HTMLDivElement>(null)
  const previousActiveDayRef = useRef(activeDayKey)
  const wheelAccumulatorRef = useRef(0)
  const wheelLockedRef = useRef(false)
  const dayButtonRefs = useRef(new Map<DayKey, HTMLButtonElement>())
  const calendarId = useId()
  const headingId = `${calendarId}-heading`
  const normalizedDayCount = Math.max(7, Math.min(21, Math.round(dayCount)))
  const railStart = addLocalDays(activeDayKey, -Math.floor(normalizedDayCount / 2))
  const railDays = useMemo(
    () =>
      Array.from(
        { length: normalizedDayCount },
        (_, index) => addLocalDays(railStart, index),
      ),
    [normalizedDayCount, railStart],
  )
  const calendarDays = useMemo(
    () => getMonthGridDayKeys(visibleMonth),
    [visibleMonth],
  )
  const weekdayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const monday = addLocalDays('2026-01-05', index)
        return {
          short: formatDayKey(monday, { weekday: 'narrow' }, locale),
          long: formatDayKey(monday, { weekday: 'long' }, locale),
        }
      }),
    [locale],
  )

  useEffect(() => {
    if (today) return
    const interval = window.setInterval(() => setClock(new Date()), 60_000)
    return () => window.clearInterval(interval)
  }, [today])

  useEffect(() => {
    if (!calendarOpen) return
    dayButtonRefs.current.get(focusedDayKey)?.focus()
  }, [calendarOpen, focusedDayKey, visibleMonth])

  useEffect(() => {
    if (!calendarOpen) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (dialogRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setCalendarOpen(false)
    }
    const closeOnOutsideFocus = (event: FocusEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (dialogRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setCalendarOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('focusin', closeOnOutsideFocus)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('focusin', closeOnOutsideFocus)
    }
  }, [calendarOpen])

  useEffect(() => {
    const previous = previousActiveDayRef.current
    previousActiveDayRef.current = activeDayKey
    if (
      previous === activeDayKey ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }
    const direction = compareDayKeys(activeDayKey, previous) > 0 ? 1 : -1
    daysRef.current?.animate(
      [
        { transform: `translateX(${direction * 14}px)`, opacity: 0.76 },
        { transform: 'translateX(0)', opacity: 1 },
      ],
      {
        duration: 520,
        easing: 'linear(0, .56 18%, .92 38%, 1.06 56%, .98 76%, 1)',
      },
    )
  }, [activeDayKey])

  const selectDay = (dayKey: DayKey) => {
    if (!isSelectableDay(dayKey, todayDayKey)) return
    if (selectedDayKey === undefined) setInternalDayKey(dayKey)
    onSelectDay?.(dayKey)
  }

  const handleRailWheel = (event: React.WheelEvent<HTMLElement>) => {
    if (disabled || calendarOpen) return
    const dominantDelta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (Math.abs(dominantDelta) < 0.5) return
    event.preventDefault()
    if (wheelLockedRef.current) return
    wheelAccumulatorRef.current += dominantDelta
    if (Math.abs(wheelAccumulatorRef.current) < 18) return
    const direction = wheelAccumulatorRef.current > 0 ? 1 : -1
    wheelAccumulatorRef.current = 0
    const candidate = addLocalDays(activeDayKey, direction)
    if (!isSelectableDay(candidate, todayDayKey)) return
    wheelLockedRef.current = true
    selectDay(candidate)
    window.setTimeout(() => {
      wheelLockedRef.current = false
    }, 420)
  }

  const openCalendar = () => {
    setVisibleMonth(startOfLocalMonth(activeDayKey))
    setFocusedDayKey(activeDayKey)
    setCalendarOpen(true)
  }

  const closeCalendar = (restoreFocus = false) => {
    setCalendarOpen(false)
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const moveCalendarFocus = (candidate: DayKey) => {
    const next = clampToToday(candidate, todayDayKey)
    setFocusedDayKey(next)
    setVisibleMonth(startOfLocalMonth(next))
  }

  const handleCalendarKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let candidate: DayKey | null = null
    if (event.key === 'ArrowLeft') candidate = addLocalDays(focusedDayKey, -1)
    if (event.key === 'ArrowRight') candidate = addLocalDays(focusedDayKey, 1)
    if (event.key === 'ArrowUp') candidate = addLocalDays(focusedDayKey, -7)
    if (event.key === 'ArrowDown') candidate = addLocalDays(focusedDayKey, 7)
    if (event.key === 'Home') candidate = startOfLocalWeek(focusedDayKey)
    if (event.key === 'End') {
      candidate = addLocalDays(startOfLocalWeek(focusedDayKey), 6)
    }
    if (event.key === 'PageUp') {
      candidate = addLocalMonths(focusedDayKey, event.shiftKey ? -12 : -1)
    }
    if (event.key === 'PageDown') {
      candidate = addLocalMonths(focusedDayKey, event.shiftKey ? 12 : 1)
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      closeCalendar(true)
      return
    }
    if (candidate) {
      event.preventDefault()
      moveCalendarFocus(candidate)
    }
  }

  const todayMonth = startOfLocalMonth(todayDayKey)
  const monthLabel = formatDayKey(
    activeDayKey,
    { month: 'short' },
    locale,
  )
  const calendarMonthLabel = formatDayKey(
    visibleMonth,
    { month: 'long', year: 'numeric' },
    locale,
  )
  const todayIsVisible = railDays.includes(todayDayKey)

  return (
    <section
      className={`date-rail date-rail--${theme} ${className}`.trim()}
      data-theme={theme}
      data-testid="date-rail"
      aria-disabled={disabled}
      aria-label="Journal date"
      onWheel={handleRailWheel}
    >
      <div className="date-rail__month-wrap">
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          className="date-rail__month"
          data-testid="date-calendar-trigger"
          aria-haspopup="dialog"
          aria-expanded={calendarOpen && !disabled}
          aria-controls={calendarId}
          onClick={() => (calendarOpen ? closeCalendar() : openCalendar())}
        >
          <span>{monthLabel}</span>
          <strong>{parseDayKey(activeDayKey).year}</strong>
        </button>
        {calendarOpen && !disabled ? (
          <div
            ref={dialogRef}
            id={calendarId}
            className="date-calendar"
            data-testid="date-calendar"
            role="dialog"
            aria-labelledby={headingId}
            onKeyDown={handleCalendarKeyDown}
          >
            <div className="date-calendar__header">
              <button
                type="button"
                className="date-calendar__nav"
                aria-label="Previous month"
                onClick={() => {
                  const previous = addLocalMonths(visibleMonth, -1)
                  setVisibleMonth(startOfLocalMonth(previous))
                  setFocusedDayKey(previous)
                }}
              >
                <span aria-hidden="true">‹</span>
              </button>
              <h2 id={headingId} aria-live="polite">
                {calendarMonthLabel}
              </h2>
              <button
                type="button"
                className="date-calendar__nav"
                aria-label="Next month"
                disabled={compareDayKeys(visibleMonth, todayMonth) >= 0}
                onClick={() => {
                  const next = clampToToday(addLocalMonths(visibleMonth, 1), todayDayKey)
                  setVisibleMonth(startOfLocalMonth(next))
                  setFocusedDayKey(next)
                }}
              >
                <span aria-hidden="true">›</span>
              </button>
            </div>
            <div
              className="date-calendar__grid"
              role="grid"
              aria-label={calendarMonthLabel}
            >
              <div className="date-calendar__weekdays" role="row">
                {weekdayLabels.map((weekday) => (
                  <span role="columnheader" aria-label={weekday.long} key={weekday.long}>
                    {weekday.short}
                  </span>
                ))}
              </div>
              {Array.from({ length: 6 }, (_, weekIndex) => (
                <div className="date-calendar__week" role="row" key={weekIndex}>
                  {calendarDays
                    .slice(weekIndex * 7, weekIndex * 7 + 7)
                    .map((dayKey) => {
                      const hasContent = contentDayKeys.has(dayKey)
                      const status = getDateStatus(dayKey, todayDayKey, hasContent)
                      const selected = dayKey === activeDayKey
                      const selectable = isSelectableDay(dayKey, todayDayKey)
                      return (
                        <span
                          role="gridcell"
                          aria-selected={selected}
                          className={[
                            'date-calendar__cell',
                            `is-${status}`,
                            selected ? 'is-selected' : '',
                            isDayInMonth(dayKey, visibleMonth) ? '' : 'is-outside',
                          ].filter(Boolean).join(' ')}
                          key={dayKey}
                        >
                          <button
                            ref={(element) => {
                              if (element) dayButtonRefs.current.set(dayKey, element)
                              else dayButtonRefs.current.delete(dayKey)
                            }}
                            type="button"
                            data-day-key={dayKey}
                            data-date-status={status}
                            disabled={disabled || !selectable}
                            tabIndex={dayKey === focusedDayKey ? 0 : -1}
                            aria-label={dayAriaLabel(
                              dayKey,
                              todayDayKey,
                              hasContent,
                              locale,
                            )}
                            onFocus={() => setFocusedDayKey(dayKey)}
                            onClick={() => {
                              selectDay(dayKey)
                              closeCalendar(true)
                            }}
                          >
                            {parseDayKey(dayKey).day}
                            {hasContent && selectable ? (
                              <span className="date-calendar__content-dot" aria-hidden="true" />
                            ) : null}
                          </button>
                        </span>
                      )
                    })}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div
        ref={daysRef}
        className="date-rail__days"
        role="list"
        aria-label="Nearby journal days"
      >
        {railDays.map((dayKey) => {
          const hasContent = contentDayKeys.has(dayKey)
          const status = getDateStatus(dayKey, todayDayKey, hasContent)
          const selected = dayKey === activeDayKey
          const date = fromLocalDayKey(dayKey)
          return (
            <div className={`date-rail__day is-${status}`} role="listitem" key={dayKey}>
              <button
                type="button"
                data-day-key={dayKey}
                data-date-status={status}
                disabled={disabled || status === 'future'}
                aria-current={dayKey === todayDayKey ? 'date' : undefined}
                aria-pressed={selected}
                aria-label={dayAriaLabel(dayKey, todayDayKey, hasContent, locale)}
                onClick={() => selectDay(dayKey)}
              >
                <span className="date-rail__weekday">
                  {new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date)}
                </span>
                {' '}
                <span className="date-rail__number">{date.getDate()}</span>
                <span className="date-rail__marker" aria-hidden="true" />
              </button>
            </div>
          )
        })}
      </div>
      <button
        type="button"
        className={`date-rail__today ${todayIsVisible ? '' : 'is-visible'}`}
        data-testid="date-rail-today"
        aria-hidden={todayIsVisible}
        tabIndex={todayIsVisible ? -1 : 0}
        disabled={disabled || todayIsVisible}
        onClick={() => selectDay(todayDayKey)}
      >
        Today
      </button>
    </section>
  )
}

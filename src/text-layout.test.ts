import { describe, expect, it } from 'vitest'
import {
  caretPointForIndex,
  layoutTextInPolygon,
  measureTextRequirement,
  nearestCaretIndex,
} from './text-layout'

describe('irregular cell text layout', () => {
  it('wraps journal text with a safe inset and centered line budget', () => {
    const polygon = [
      { x: 50, y: 0 },
      { x: 112, y: 30 },
      { x: 95, y: 105 },
      { x: 20, y: 92 },
      { x: 0, y: 34 },
    ]
    const layout = layoutTextInPolygon(
      'I noticed the answer became clearer once I stopped forcing certainty.',
      polygon,
      8,
    )

    expect(layout.content.split('\n').length).toBeLessThanOrEqual(7)
    expect(layout.fontSize).toBeGreaterThanOrEqual(7)
    expect(layout.width).toBeLessThan(96)
    expect(layout.center.x).toBeGreaterThan(20)
    expect(layout.center.x).toBeLessThan(90)
    expect(layout.fits).toBe(true)
    expect(layout.engine).toBe('fallback')
  })

  it('truncates only the rendered label when extreme crowding makes full copy impossible', () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 42, y: 0 },
      { x: 42, y: 32 },
      { x: 0, y: 32 },
    ]
    const layout = layoutTextInPolygon(
      'This deliberately long reflection cannot safely fit inside this very small cell.',
      polygon,
      10,
    )

    expect(layout.content.replace(/\n/g, ' ')).toMatch(/…$/u)
    expect(layout.content).not.toContain('very small cell')
    expect(layout.fits).toBe(true)
    expect(layout.truncated).toBe(true)
  })

  it('derives a larger minimum area from longer text', () => {
    const short = measureTextRequirement('A short note.', 12)
    const long = measureTextRequirement(
      'I noticed the difficult question became easier when I gave it enough room to change.',
      12,
    )

    expect(long.area).toBeGreaterThan(short.area)
    expect(long.lineCount).toBeGreaterThan(short.lineCount)
  })

  it('keeps the area floor monotonic for efficiently wrapped journal sentences', () => {
    const short = measureTextRequirement(
      'I delayed the decision because both options still carried real value.',
      24,
    )
    const long = measureTextRequirement(
      'I gave the difficult unresolved question more room and finally noticed a calmer answer taking shape.',
      24,
    )

    expect(long.area).toBeGreaterThan(short.area)
  })

  it('maps clicks to stable source-text caret indices across wrapped lines', () => {
    const layout = layoutTextInPolygon(
      'alpha beta gamma delta',
      [
        { x: 0, y: 0 },
        { x: 118, y: 0 },
        { x: 118, y: 90 },
        { x: 0, y: 90 },
      ],
      10,
      12,
    )
    const betaIndex = 'alpha beta gamma delta'.indexOf('beta') + 2
    const caret = caretPointForIndex(layout, betaIndex)

    expect(nearestCaretIndex(layout, {
      x: caret.x,
      y: (caret.top + caret.bottom) / 2,
    })).toBe(betaIndex)
    expect(layout.lines.every((line) => line.end >= line.start)).toBe(true)
  })
})

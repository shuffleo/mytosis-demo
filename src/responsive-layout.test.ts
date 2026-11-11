import { describe, expect, it } from 'vitest'
import {
  calculateResponsiveLayout,
  classifyResponsiveLayout,
} from './responsive-layout'

describe('responsive layout', () => {
  it('classifies compact, tablet, and expanded viewports', () => {
    expect(classifyResponsiveLayout(390, 844)).toBe('compact-portrait')
    expect(classifyResponsiveLayout(844, 390)).toBe('compact-landscape')
    expect(classifyResponsiveLayout(768, 1024)).toBe('medium')
    expect(classifyResponsiveLayout(1440, 900)).toBe('expanded')
  })

  it('keeps phone chrome outside the usable portrait rectangle', () => {
    const layout = calculateResponsiveLayout({
      width: 390,
      height: 844,
      visualWidth: 390,
      visualHeight: 844,
      visualOffsetTop: 0,
      visualOffsetLeft: 0,
      keyboardInset: 0,
    })
    expect(layout.usable).toEqual({
      top: 72,
      right: 12,
      bottom: 80,
      left: 12,
    })
  })

  it('moves the toolbar allowance to the right in short landscape', () => {
    const layout = calculateResponsiveLayout({
      width: 844,
      height: 390,
      visualWidth: 844,
      visualHeight: 390,
      visualOffsetTop: 0,
      visualOffsetLeft: 0,
      keyboardInset: 0,
    })
    expect(layout.className).toBe('compact-landscape')
    expect(layout.usable.right).toBe(68)
    expect(layout.usable.bottom).toBe(8)
  })

  it('raises the usable bottom above a software keyboard', () => {
    const layout = calculateResponsiveLayout({
      width: 390,
      height: 844,
      visualWidth: 390,
      visualHeight: 486,
      visualOffsetTop: 0,
      visualOffsetLeft: 0,
      keyboardInset: 358,
    })
    expect(layout.keyboardConstrained).toBe(true)
    expect(layout.usable.bottom).toBe(418)
  })

  it('preserves the established expanded desktop field bounds', () => {
    const layout = calculateResponsiveLayout({
      width: 1440,
      height: 900,
      visualWidth: 1440,
      visualHeight: 900,
      visualOffsetTop: 0,
      visualOffsetLeft: 0,
      keyboardInset: 0,
    })
    expect(layout.usable).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })
})

import { describe, expect, it } from 'vitest'
import {
  chooseRendererQuality,
  qualityPixelRatioCap,
} from './render-quality'

describe('runtime render quality', () => {
  it('uses high quality on ordinary expanded displays', () => {
    expect(
      chooseRendererQuality({
        preference: 'auto',
        layoutClass: 'expanded',
        devicePixelRatio: 2,
        postProcessStatus: 'live',
      }),
    ).toBe('high')
  })

  it('derives conservative tiers without changing the user preference', () => {
    expect(
      chooseRendererQuality({
        preference: 'auto',
        layoutClass: 'compact-portrait',
        devicePixelRatio: 3,
        postProcessStatus: 'live',
      }),
    ).toBe('low')
    expect(
      chooseRendererQuality({
        preference: 'auto',
        layoutClass: 'medium',
        devicePixelRatio: 2,
        postProcessStatus: 'live',
      }),
    ).toBe('balanced')
  })

  it('honors explicit overrides and fallback constraints', () => {
    expect(
      chooseRendererQuality({
        preference: 'high',
        layoutClass: 'compact-portrait',
        devicePixelRatio: 3,
        postProcessStatus: 'fallback',
      }),
    ).toBe('high')
    expect(
      chooseRendererQuality({
        preference: 'auto',
        layoutClass: 'expanded',
        devicePixelRatio: 1,
        postProcessStatus: 'fallback',
      }),
    ).toBe('low')
    expect([
      qualityPixelRatioCap('high'),
      qualityPixelRatioCap('balanced'),
      qualityPixelRatioCap('low'),
    ]).toEqual([2, 1.5, 1])
  })
})

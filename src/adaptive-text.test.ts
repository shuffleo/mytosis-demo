import { describe, expect, it } from 'vitest'
import {
  canonicalTextHash,
  createDeterministicVariants,
  normalizeGeneratedVariants,
  selectFittedTextVariant,
  textVariantsForDisplay,
  type AdaptiveTextVariantMetadata,
} from './adaptive-text'

const canonical =
  'I noticed the difficult conversation became easier after I named the specific concern.'

function metadata(
  values = {
    S: 'The conversation eased after I named the concern.',
    XS: 'Naming the concern eased the conversation.',
    XXS: 'Naming it helped.',
  },
): AdaptiveTextVariantMetadata {
  return {
    sourceHash: canonicalTextHash(canonical),
    status: 'ready',
    values,
    provenance: 'on-device-model',
    provider: 'test',
    model: 'test-model',
    promptVersion: 'test-v1',
    generatedAtMs: 1,
  }
}

describe('adaptive text variants', () => {
  it('hashes normalized canonical text and derives progressive deterministic fallbacks', () => {
    expect(canonicalTextHash(`  ${canonical}  `)).toBe(canonicalTextHash(canonical))
    const variants = createDeterministicVariants(canonical)
    const counts = [
      canonical,
      variants.S,
      variants.XS,
      variants.XXS,
    ].map((text) => text.split(/\s+/u).length)
    expect(counts[1]).toBeLessThan(counts[0])
    expect(counts[2]).toBeLessThanOrEqual(counts[1])
    expect(counts[3]).toBeLessThanOrEqual(counts[2])
    expect(variants.XXS).toMatch(/conversation|concern|named|easier/iu)
  })

  it('rejects verbose or empty model outputs in favor of deterministic variants', () => {
    const fallback = createDeterministicVariants(canonical)
    expect(
      normalizeGeneratedVariants(canonical, {
        S: `${canonical} This is unexpectedly longer.`,
        XS: '',
        XXS: 'Named concern.',
      }),
    ).toEqual({
      S: fallback.S,
      XS: fallback.XS,
      XXS: 'Named concern.',
    })
  })

  it('ignores stale persisted metadata when canonical M changes', () => {
    const changed = `${canonical} Today.`
    const displayed = textVariantsForDisplay(changed, metadata())
    expect(displayed.M).toBe(changed)
    expect(displayed.S).not.toBe(metadata().values.S)
  })

  it('selects the longest measured variant that fits and applies stable hysteresis', () => {
    const large = [
      { x: 0, y: 0 },
      { x: 230, y: 0 },
      { x: 230, y: 120 },
      { x: 0, y: 120 },
    ]
    const tight = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 58 },
      { x: 0, y: 58 },
    ]
    const largeFit = selectFittedTextVariant({
      canonical,
      metadata: metadata(),
      polygon: large,
      safeInset: 8,
      minimumFontSize: 10,
      hysteresis: 0.12,
    })
    const tightFit = selectFittedTextVariant({
      canonical,
      metadata: metadata(),
      polygon: tight,
      safeInset: 8,
      minimumFontSize: 10,
      hysteresis: 0.12,
    })
    expect(largeFit.level).toBe('M')
    expect(['S', 'XS', 'XXS']).toContain(tightFit.level)

    const nearBoundary = selectFittedTextVariant({
      canonical,
      metadata: metadata(),
      polygon: tight,
      safeInset: 8,
      minimumFontSize: 10,
      hysteresis: 0.3,
      previousLevel: 'S',
    })
    expect(['S', tightFit.level]).toContain(nearBoundary.level)
  })
})

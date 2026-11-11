import type { Point2 } from './geometry'
import {
  layoutTextInPolygon,
  type WrappedTextLayout,
} from './text-layout'

export const ADAPTIVE_TEXT_PROMPT_VERSION = 'variants-v1'
export const ADAPTIVE_TEXT_MODEL_ID = 'HuggingFaceTB/SmolLM2-135M-Instruct'

export type AdaptiveTextLevel = 'M' | 'S' | 'XS' | 'XXS'
export type AdaptiveTextGenerationStatus =
  | 'pending'
  | 'loading'
  | 'generating'
  | 'ready'
  | 'fallback'
  | 'error'

export interface DerivedTextVariants {
  S: string
  XS: string
  XXS: string
}

export interface AdaptiveTextVariantMetadata {
  sourceHash: string
  status: AdaptiveTextGenerationStatus
  values: DerivedTextVariants
  provenance: 'on-device-model' | 'deterministic-fallback'
  provider: string
  model?: string
  promptVersion: string
  generatedAtMs: number
  cacheHit?: boolean
  error?: string
}

export interface FittedTextVariant {
  level: AdaptiveTextLevel
  text: string
  layout: WrappedTextLayout
}

const LEVELS: readonly AdaptiveTextLevel[] = ['M', 'S', 'XS', 'XXS']
const REMOVABLE_FILLERS = new Set([
  'actually',
  'basically',
  'certainly',
  'definitely',
  'just',
  'literally',
  'maybe',
  'perhaps',
  'quite',
  'really',
  'simply',
  'somewhat',
  'that',
  'very',
])
const ESSENTIAL_NEGATIONS = new Set(['no', 'not', 'never', "isn't", "wasn't", "won't"])

export function canonicalTextHash(text: string) {
  const normalized = text.normalize('NFKC').trim().replace(/\s+/gu, ' ')
  let hash = 0x811c9dc5
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function wordsOf(text: string) {
  return text
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .split(' ')
    .filter(Boolean)
}

function cleanOutput(text: string) {
  return text
    .replace(/^(?:S|XS|XXS)\s*:\s*/iu, '')
    .replace(/^["'“”]+|["'“”]+$/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function shortenExtractively(text: string, targetWords: number) {
  const words = wordsOf(text)
  if (words.length <= targetWords) return cleanOutput(text)
  const retained = words.map((word, index) => ({
    word,
    index,
    removable:
      REMOVABLE_FILLERS.has(word.toLowerCase().replace(/[^\p{L}'-]/gu, '')) &&
      !ESSENTIAL_NEGATIONS.has(word.toLowerCase()),
  }))
  for (let index = retained.length - 1; index >= 0 && retained.length > targetWords; index -= 1) {
    if (retained[index]?.removable) retained.splice(index, 1)
  }
  while (retained.length > targetWords) {
    const candidates = retained
      .map((entry, index) => ({ entry, index }))
      .filter(
        ({ entry }, index) =>
          index > 0 &&
          index < retained.length - 1 &&
          !ESSENTIAL_NEGATIONS.has(
            entry.word.toLowerCase().replace(/[^\p{L}'-]/gu, ''),
          ),
      )
    const removable = candidates.find(({ entry }) =>
      /^(?:a|an|the|my|one|some|this|these|those|own|still)$/iu.test(
        entry.word.replace(/[^\p{L}'-]/gu, ''),
      ),
    )
    const selected = removable ?? candidates[candidates.length - 1]
    if (!selected) break
    retained.splice(selected.index, 1)
  }
  const result = retained.map(({ word }) => word).join(' ')
  return cleanOutput(result).replace(/[,:;]+$/u, '').trim()
}

export function createDeterministicVariants(text: string): DerivedTextVariants {
  const canonical = cleanOutput(text)
  const wordCount = wordsOf(canonical).length
  if (wordCount === 0) return { S: '', XS: '', XXS: '' }
  const targets = {
    S: Math.max(1, Math.min(wordCount, Math.ceil(wordCount * 0.72))),
    XS: Math.max(1, Math.min(wordCount, Math.ceil(wordCount * 0.5))),
    XXS: Math.max(1, Math.min(wordCount, Math.ceil(wordCount * 0.32))),
  }
  const S = shortenExtractively(canonical, targets.S)
  const XS = shortenExtractively(S, Math.min(wordsOf(S).length, targets.XS))
  const XXS = shortenExtractively(
    XS,
    Math.min(wordsOf(XS).length, targets.XXS),
  )
  return { S: S || canonical, XS: XS || S || canonical, XXS: XXS || XS || S || canonical }
}

export function normalizeGeneratedVariants(
  canonical: string,
  candidate: Partial<DerivedTextVariants>,
) {
  const fallback = createDeterministicVariants(canonical)
  const maximumWords = wordsOf(canonical).length
  let previous = canonical
  const normalized = {} as DerivedTextVariants
  for (const level of ['S', 'XS', 'XXS'] as const) {
    const value = cleanOutput(candidate[level] ?? '')
    const previousWords = wordsOf(previous).length
    const valueWords = wordsOf(value).length
    const fallbackValue = fallback[level]
    normalized[level] =
      value &&
      valueWords > 0 &&
      valueWords <= previousWords &&
      valueWords <= maximumWords
        ? value
        : fallbackValue
    previous = normalized[level]
  }
  return normalized
}

export function textVariantsForDisplay(
  canonical: string,
  metadata?: AdaptiveTextVariantMetadata,
) {
  const values =
    metadata?.sourceHash === canonicalTextHash(canonical)
      ? metadata.values
      : createDeterministicVariants(canonical)
  return {
    M: canonical,
    S: values.S,
    XS: values.XS,
    XXS: values.XXS,
  } satisfies Record<AdaptiveTextLevel, string>
}

function fitsWithoutTruncation(layout: WrappedTextLayout) {
  return layout.fits && !layout.truncated
}

export function selectFittedTextVariant(options: {
  canonical: string
  metadata?: AdaptiveTextVariantMetadata
  polygon: readonly Point2[]
  safeInset: number
  minimumFontSize: number
  hysteresis: number
  previousLevel?: AdaptiveTextLevel
}): FittedTextVariant {
  const {
    canonical,
    metadata,
    polygon,
    safeInset,
    minimumFontSize,
    previousLevel,
  } = options
  const hysteresis = Math.max(0, Math.min(0.3, options.hysteresis))
  const variants = textVariantsForDisplay(canonical, metadata)
  const layoutAt = (level: AdaptiveTextLevel, fontSize = minimumFontSize) =>
    layoutTextInPolygon(variants[level], polygon, safeInset, fontSize)
  let selectedLevel =
    LEVELS.find((level) => fitsWithoutTruncation(layoutAt(level))) ?? 'XXS'
  if (previousLevel) {
    const previousIndex = LEVELS.indexOf(previousLevel)
    const selectedIndex = LEVELS.indexOf(selectedLevel)
    if (selectedIndex > previousIndex) {
      const tolerant = layoutAt(
        previousLevel,
        Math.max(6, minimumFontSize * (1 - hysteresis)),
      )
      if (fitsWithoutTruncation(tolerant)) selectedLevel = previousLevel
    } else if (selectedIndex < previousIndex) {
      const cautious = layoutAt(
        selectedLevel,
        minimumFontSize * (1 + hysteresis),
      )
      if (!fitsWithoutTruncation(cautious)) selectedLevel = previousLevel
    }
  }
  return {
    level: selectedLevel,
    text: variants[selectedLevel],
    layout: layoutAt(selectedLevel),
  }
}

import {
  layoutNextLine,
  layoutWithLines,
  prepareWithSegments,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from '@chenglou/pretext'
import {
  clamp,
  horizontalIntervalAtY,
  polygonBounds,
  polygonCentroid,
  type Point2,
} from './geometry'

export interface TextLineLayout {
  text: string
  width: number
  x: number
  y: number
}

export interface WrappedTextLayout {
  content: string
  fontSize: number
  leading: number
  center: Point2
  width: number
  lineCount: number
  fits: boolean
  truncated: boolean
  lines: TextLineLayout[]
  engine: 'pretext' | 'fallback'
}

export interface TextSizeRequirement {
  width: number
  height: number
  area: number
  lineCount: number
  fontSize: number
}

function wrapWords(words: readonly string[], maximumWidth: number, fontSize: number) {
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    const estimatedWidth = candidate.length * fontSize * 0.54
    if (current && estimatedWidth > maximumWidth) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

function estimatedLineWidth(line: string, fontSize: number) {
  return line.length * fontSize * 0.54
}

const preparedCache = new Map<string, PreparedTextWithSegments>()

function fontString(fontSize: number) {
  return `500 ${fontSize}px "Helvetica Neue", Arial, sans-serif`
}

function preparedText(text: string, fontSize: number) {
  const key = `${fontSize}\u0000${text}`
  const cached = preparedCache.get(key)
  if (cached) return cached
  const prepared = prepareWithSegments(text, fontString(fontSize))
  preparedCache.set(key, prepared)
  if (preparedCache.size > 256) {
    preparedCache.delete(preparedCache.keys().next().value ?? '')
  }
  return prepared
}

function roundedLayoutWidth(width: number) {
  return Math.max(1, Math.floor(width * 4) / 4)
}

function layoutWithPretext(
  text: string,
  polygon: readonly Point2[],
  safeInset: number,
  fontSize: number,
): TextLineLayout[] | null {
  if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined') return null
  try {
    const prepared = preparedText(text, fontSize)
    const center = polygonCentroid(polygon)
    const bounds = polygonBounds(polygon)
    const leading = fontSize * 1.22
    const maximumRows = Math.min(
      8,
      Math.floor(Math.max(0, bounds.height - safeInset * 2) / leading),
    )
    for (let rowCount = 1; rowCount <= maximumRows; rowCount += 1) {
      const verticalOffsets = [0, -0.7, 0.7, -1.4, 1.4].map(
        (factor) => factor * leading,
      )
      for (const verticalOffset of verticalOffsets) {
        let cursor: LayoutCursor | undefined
        const lines: TextLineLayout[] = []
        let valid = true
        for (let row = 0; row < rowCount; row += 1) {
          const rowCenterY =
            center.y -
            ((rowCount - 1) * leading) / 2 +
            row * leading +
            verticalOffset
          const interval = horizontalIntervalAtY(polygon, rowCenterY)
          if (!interval) {
            valid = false
            break
          }
          const left = interval[0] + safeInset
          const right = interval[1] - safeInset
          const availableWidth = roundedLayoutWidth(right - left)
          if (availableWidth < Math.max(18, fontSize * 1.7)) {
            valid = false
            break
          }
          const line = layoutNextLine(prepared, availableWidth, cursor)
          if (!line) break
          lines.push({
            text: line.text,
            width: line.width,
            x: (left + right) / 2,
            y: rowCenterY + fontSize * 0.35,
          })
          cursor = line.end
        }
        if (!valid || lines.length === 0) continue
        if (layoutNextLine(prepared, 100_000, cursor) === null) return lines
      }
    }
  } catch {
    // Canvas measurement can be unavailable in non-browser test runtimes.
  }
  return null
}

function fallbackLines(
  text: string,
  polygon: readonly Point2[],
  safeInset: number,
  fontSize: number,
) {
  const center = polygonCentroid(polygon)
  const bounds = polygonBounds(polygon)
  const leading = fontSize * 1.22
  const maximumWidth = Math.max(24, bounds.width - safeInset * 2)
  const lines = wrapWords(text.trim().split(/\s+/).filter(Boolean), maximumWidth, fontSize)
  const firstY = center.y - ((lines.length - 1) * leading) / 2
  return lines.map<TextLineLayout>((line, index) => {
    const y = firstY + index * leading
    const interval = horizontalIntervalAtY(polygon, y)
    return {
      text: line,
      width: estimatedLineWidth(line, fontSize),
      x: interval ? (interval[0] + interval[1]) / 2 : center.x,
      y: y + fontSize * 0.35,
    }
  })
}

function arithmeticLinesFit(
  lines: readonly TextLineLayout[],
  polygon: readonly Point2[],
  safeInset: number,
  fontSize: number,
) {
  const bounds = polygonBounds(polygon)
  const leading = fontSize * 1.22
  return (
    lines.length <= 8 &&
    lines.length * leading <= bounds.height - safeInset * 2 &&
    lines.every((line) => {
      const interval = horizontalIntervalAtY(polygon, line.y - fontSize * 0.35)
      return Boolean(
        interval &&
          line.width <= interval[1] - interval[0] - safeInset * 2,
      )
    })
  )
}

function truncatedLayout(
  text: string,
  polygon: readonly Point2[],
  safeInset: number,
  fontSize: number,
) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  for (let retained = words.length - 1; retained >= 0; retained -= 1) {
    const candidate =
      retained > 0 ? `${words.slice(0, retained).join(' ')}…` : '…'
    const measured = layoutWithPretext(candidate, polygon, safeInset, fontSize)
    if (measured) return { lines: measured, engine: 'pretext' as const }
    const arithmetic = fallbackLines(candidate, polygon, safeInset, fontSize)
    if (arithmeticLinesFit(arithmetic, polygon, safeInset, fontSize)) {
      return { lines: arithmetic, engine: 'fallback' as const }
    }
  }
  return null
}

export function layoutTextInPolygon(
  text: string,
  polygon: readonly Point2[],
  safeInset: number,
  minimumFontSize = 8,
): WrappedTextLayout {
  const center = polygonCentroid(polygon)
  const bounds = polygonBounds(polygon)
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    return {
      content: '',
      fontSize: 12,
      leading: 15,
      center,
      width: 0,
      lineCount: 0,
      fits: true,
      truncated: false,
      lines: [],
      engine: 'pretext',
    }
  }

  for (let fontSize = 16; fontSize >= minimumFontSize; fontSize -= 0.5) {
    const leading = fontSize * 1.22
    const lines = layoutWithPretext(text, polygon, safeInset, fontSize)
    if (lines) {
      return {
        content: lines.map((line) => line.text).join('\n'),
        fontSize,
        leading,
        center,
        width: Math.max(...lines.map((line) => line.width)),
        lineCount: lines.length,
        fits: true,
        truncated: false,
        lines,
        engine: 'pretext',
      }
    }
    const arithmeticLines = fallbackLines(text, polygon, safeInset, fontSize)
    const arithmeticFits = arithmeticLinesFit(
      arithmeticLines,
      polygon,
      safeInset,
      fontSize,
    )
    if (arithmeticFits) {
      return {
        content: arithmeticLines.map((line) => line.text).join('\n'),
        fontSize,
        leading,
        center,
        width: Math.max(...arithmeticLines.map((line) => line.width)),
        lineCount: arithmeticLines.length,
        fits: true,
        truncated: false,
        lines: arithmeticLines,
        engine: 'fallback',
      }
    }
  }

  const fallbackSize = minimumFontSize
  const truncated = truncatedLayout(text, polygon, safeInset, fallbackSize)
  if (truncated) {
    return {
      content: truncated.lines.map((line) => line.text).join('\n'),
      fontSize: fallbackSize,
      leading: fallbackSize * 1.22,
      center,
      width: Math.max(...truncated.lines.map((line) => line.width)),
      lineCount: truncated.lines.length,
      fits: true,
      truncated: true,
      lines: truncated.lines,
      engine: truncated.engine,
    }
  }
  const fallbackWidth = Math.max(32, bounds.width - safeInset * 2)
  const lines = fallbackLines(text, polygon, safeInset, fallbackSize)
  return {
    content: lines.map((line) => line.text).join('\n'),
    fontSize: fallbackSize,
    leading: fallbackSize * 1.24,
    center,
    width: clamp(fallbackWidth, 32, bounds.width),
    lineCount: lines.length,
    fits: false,
    truncated: false,
    lines,
    engine: 'fallback',
  }
}

export function measureTextRequirement(
  text: string,
  safeInset: number,
  fontSize = 10,
): TextSizeRequirement {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    const diameter = safeInset * 2 + fontSize * 1.5
    return { width: diameter, height: diameter, area: diameter * diameter, lineCount: 0, fontSize }
  }
  const characterCount = words.reduce((sum, word) => sum + word.length, 0) + words.length - 1
  const targetCharacters = clamp(Math.ceil(Math.sqrt(characterCount * 18)), 14, 28)
  const targetWidth = targetCharacters * fontSize * 0.54
  let lines = wrapWords(words, targetWidth, fontSize).map((text) => ({
    text,
    width: estimatedLineWidth(text, fontSize),
  }))
  try {
    if (typeof document !== 'undefined' || typeof OffscreenCanvas !== 'undefined') {
      lines = layoutWithLines(preparedText(text, fontSize), targetWidth, fontSize * 1.22).lines
    }
  } catch {
    // Preserve deterministic arithmetic fallback for test and SSR environments.
  }
  const contentWidth = Math.max(...lines.map((line) => line.width))
  const leading = fontSize * 1.22
  const width = contentWidth + safeInset * 2
  const height = lines.length * leading + safeInset * 2
  // A pure bounding box can perversely make a longer, efficiently wrapped
  // sentence look cheaper than a shorter wide line. Keep a monotonic text-
  // volume floor so weight allocation always grows with actual copy volume.
  const volumeDiameter =
    safeInset * 2 + Math.sqrt(Math.max(1, characterCount)) * fontSize * 2
  const measuredArea = width * height * 1.22
  return {
    width,
    height,
    area: Math.max(measuredArea, volumeDiameter * volumeDiameter),
    lineCount: lines.length,
    fontSize,
  }
}

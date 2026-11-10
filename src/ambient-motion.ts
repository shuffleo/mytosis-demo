export interface AmbientMotionSettings {
  enabled: boolean
  amplitudePx: number
  periodMs: number
  phaseSpread: number
  coverage: number
}

function hashOrder(order: number) {
  const value = Math.sin((order + 1) * 78.233) * 43758.5453
  return value - Math.floor(value)
}

export function ambientScaleOffset(
  order: number,
  timeSeconds: number,
  cellSpanPx: number,
  settings: AmbientMotionSettings,
  reducedMotion = false,
) {
  if (
    reducedMotion ||
    !settings.enabled ||
    settings.amplitudePx <= 0 ||
    settings.coverage <= 0 ||
    hashOrder(order) > settings.coverage
  ) {
    return 0
  }
  const periodSeconds = Math.max(0.4, settings.periodMs / 1000)
  const phase =
    (timeSeconds / periodSeconds) * Math.PI * 2 +
    order * settings.phaseSpread * Math.PI * 2
  const amplitudeRatio = settings.amplitudePx / Math.max(1, cellSpanPx)
  return Math.sin(phase) * amplitudeRatio
}

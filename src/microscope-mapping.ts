import type { Point2 } from './geometry'
import type { CanvasSettings } from './settings'

export interface PostProcessField {
  width: number
  height: number
  center: Point2
  radius: number
}

function smoothstep(edge0: number, edge1: number, value: number) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function postProcessRadialScale(
  normalized: Point2,
  settings: CanvasSettings['effects'],
) {
  const radius = Math.hypot(normalized.x, normalized.y)
  if (radius >= 1) return 1

  let offset = 0
  if (settings.lens.enabled) {
    const sphereDepth = Math.sqrt(Math.max(0, 1 - radius * radius))
    offset += settings.lens.refraction * 0.18 * (1 - sphereDepth)
  }
  if (settings.crt.enabled) {
    offset += settings.crt.bulge * 0.08 * radius * radius
  }
  if (settings.vignette.enabled) {
    const rim = smoothstep(
      Math.max(0, 1 - settings.vignette.rimWidth - settings.vignette.softness),
      Math.max(0.001, 1 - settings.vignette.softness),
      radius,
    )
    const grain =
      Math.sin(normalized.x * 17 + normalized.y * 23) *
      Math.cos(normalized.y * 19 - normalized.x * 11)
    offset += settings.vignette.distortion * rim * grain
  }
  return 1 + offset
}

/**
 * Maps a visible post-processed coordinate back to the Paper.js source
 * coordinate sampled by the shader. Pointer events stay on the source canvas;
 * this mapping keeps hit-testing aligned with the refracted image.
 */
export function mapPostProcessedPoint(
  point: Point2,
  field: PostProcessField,
  settings: CanvasSettings,
): Point2 {
  const normalized = {
    x: (point.x - field.center.x) / Math.max(1, field.radius),
    y: (point.y - field.center.y) / Math.max(1, field.radius),
  }
  if (Math.hypot(normalized.x, normalized.y) >= 1) return { ...point }
  const scale = postProcessRadialScale(normalized, settings.effects)
  return {
    x: field.center.x + normalized.x * field.radius * scale,
    y: field.center.y + normalized.y * field.radius * scale,
  }
}

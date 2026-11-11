import type { ResponsiveLayoutClass } from './responsive-layout'
import type { PostProcessStatus } from './microscope-postprocess'

export type RendererQualityPreference =
  | 'auto'
  | 'high'
  | 'balanced'
  | 'low'
export type RendererQualityTier = Exclude<RendererQualityPreference, 'auto'>

export function chooseRendererQuality(options: {
  preference: RendererQualityPreference
  layoutClass: ResponsiveLayoutClass
  devicePixelRatio: number
  postProcessStatus: PostProcessStatus | 'checking'
}): RendererQualityTier {
  if (options.preference !== 'auto') return options.preference
  if (options.postProcessStatus === 'fallback') return 'low'
  if (options.layoutClass === 'expanded' && options.devicePixelRatio <= 2) {
    return 'high'
  }
  if (
    options.layoutClass === 'compact-landscape' ||
    (options.layoutClass === 'compact-portrait' &&
      options.devicePixelRatio > 2.5)
  ) {
    return 'low'
  }
  return 'balanced'
}

export function qualityPixelRatioCap(tier: RendererQualityTier) {
  if (tier === 'high') return 2
  if (tier === 'balanced') return 1.5
  return 1
}

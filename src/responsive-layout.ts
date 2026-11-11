export type ResponsiveLayoutClass =
  | 'compact-portrait'
  | 'compact-landscape'
  | 'medium'
  | 'expanded'

export interface ResponsiveViewport {
  width: number
  height: number
  visualWidth: number
  visualHeight: number
  visualOffsetTop: number
  visualOffsetLeft: number
  keyboardInset: number
}

export interface ResponsiveLayout {
  className: ResponsiveLayoutClass
  orientation: 'portrait' | 'landscape'
  keyboardConstrained: boolean
  dateChromeHeight: number
  toolbarHeight: number
  usable: {
    top: number
    right: number
    bottom: number
    left: number
  }
}

export function classifyResponsiveLayout(
  width: number,
  height: number,
): ResponsiveLayoutClass {
  if (height < 500 && width > height) return 'compact-landscape'
  if (width < 600) return 'compact-portrait'
  if (Math.min(width, height) < 600 || width < 1024 || height < 600) {
    return 'medium'
  }
  return 'expanded'
}

export function calculateResponsiveLayout(
  viewport: ResponsiveViewport,
): ResponsiveLayout {
  const className = classifyResponsiveLayout(
    viewport.visualWidth,
    viewport.visualHeight,
  )
  const orientation =
    viewport.visualWidth > viewport.visualHeight ? 'landscape' : 'portrait'
  const keyboardConstrained = viewport.keyboardInset >= 96

  if (className === 'compact-landscape') {
    return {
      className,
      orientation,
      keyboardConstrained,
      dateChromeHeight: 48,
      toolbarHeight: 56,
      usable: {
        top: viewport.visualOffsetTop + 56,
        right: Math.max(68, viewport.width - viewport.visualWidth + 68),
        bottom: Math.max(8, viewport.keyboardInset),
        left: viewport.visualOffsetLeft + 8,
      },
    }
  }

  if (className === 'expanded') {
    return {
      className,
      orientation,
      keyboardConstrained,
      dateChromeHeight: 74,
      toolbarHeight: 72,
      usable: { top: 0, right: 0, bottom: 0, left: 0 },
    }
  }

  const compact = className === 'compact-portrait'
  const dateChromeHeight = compact ? 64 : 74
  const toolbarHeight = compact ? 64 : 72
  const horizontalMargin = compact ? 12 : className === 'medium' ? 16 : 20
  return {
    className,
    orientation,
    keyboardConstrained,
    dateChromeHeight,
    toolbarHeight,
    usable: {
      top: viewport.visualOffsetTop + dateChromeHeight + 8,
      right: Math.max(horizontalMargin, viewport.width - viewport.visualWidth + horizontalMargin),
      bottom: Math.max(
        toolbarHeight + 16,
        viewport.keyboardInset + (keyboardConstrained ? 60 : 0),
      ),
      left: viewport.visualOffsetLeft + horizontalMargin,
    },
  }
}

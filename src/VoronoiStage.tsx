import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type CSSProperties,
} from 'react'
import type { ClusteringResult } from './clustering'
import {
  VoronoiCanvasEngine,
  type CanvasMode,
  type EditorLayout,
  type VoronoiDebugSnapshot,
} from './voronoi-engine'
import {
  MicroscopePostProcessor,
  type PostProcessDebugSnapshot,
  type PostProcessStatus,
} from './microscope-postprocess'
import type { CanvasSettings } from './settings'
import { WallTextureRenderer } from './wall-texture-renderer'

declare global {
  interface Window {
    __VORONOI_DEBUG__?: {
      snapshot: () => VoronoiDebugSnapshot
      serialize: () => string
      load: (serialized: string) => void
      forceSeed: () => boolean
      dieSeed: () => boolean
      undo: () => boolean
      redo: () => boolean
      postProcess: () => PostProcessDebugSnapshot | null
      mapPostProcessPoint: (point: { x: number; y: number }) => { x: number; y: number }
    }
  }
}

interface EditingState {
  id: string
  value: string
  originalValue: string
  ghostPrompt: string
}

interface VoronoiStageProps {
  mode: CanvasMode
  settings: CanvasSettings
  autoGrowth: boolean
  seedAuditRequest: number
  historyRequest: { kind: 'undo' | 'redo'; nonce: number } | null
  blocked: boolean
  suspended: boolean
  clusteringWave: boolean
  onPostProcessingStatus: (status: PostProcessStatus) => void
  onHistoryChanged: (canUndo: boolean, canRedo: boolean) => void
  onEditingChanged?: (editing: boolean) => void
}

export interface VoronoiStageHandle {
  serialize: () => string
  replaceDocument: (serialized: string, command?: string) => void
  applyClustering: (
    cellIds: readonly string[],
    result: ClusteringResult,
  ) => boolean
  snapshot: () => VoronoiDebugSnapshot | null
  dieFirstSeed: () => boolean
  addCellAtCentroid: () => boolean
}

export const VoronoiStage = forwardRef<VoronoiStageHandle, VoronoiStageProps>(function VoronoiStage({
  mode,
  settings,
  autoGrowth,
  seedAuditRequest,
  historyRequest,
  blocked,
  suspended,
  clusteringWave,
  onPostProcessingStatus,
  onHistoryChanged,
  onEditingChanged,
}, forwardedRef) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const postProcessCanvasRef = useRef<HTMLCanvasElement>(null)
  const wallTextureCanvasRef = useRef<HTMLCanvasElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const engineRef = useRef<VoronoiCanvasEngine>(null)
  const postProcessorRef = useRef<MicroscopePostProcessor>(null)
  const wallRendererRef = useRef<WallTextureRenderer>(null)
  const initialSettingsRef = useRef(settings)
  const settingsRef = useRef(settings)
  const fieldBoundsRef = useRef({ center: { x: 0, y: 0 }, radius: 1 })
  const latestLayoutRef = useRef<EditorLayout | null>(null)
  const editingRef = useRef<EditingState | null>(null)
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [focusExiting, setFocusExiting] = useState(false)
  const [focusLayout, setFocusLayout] = useState<EditorLayout | null>(null)
  const [fieldBounds, setFieldBounds] = useState(() => ({
    center: { x: 0, y: 0 },
    radius: 1,
  }))
  const focusExitTimerRef = useRef<number | null>(null)
  const [selection, setSelection] = useState<string | null>(null)
  const previousSeedAuditRequestRef = useRef(seedAuditRequest)

  const positionEditor = (layout: EditorLayout) => {
    latestLayoutRef.current = layout
    setFocusLayout((current) =>
      current &&
      Math.abs(current.x - layout.x) < 0.35 &&
      Math.abs(current.y - layout.y) < 0.35 &&
      Math.abs(current.width - layout.width) < 0.35 &&
      Math.abs(current.height - layout.height) < 0.35 &&
      Math.abs(current.polygonWidth - layout.polygonWidth) < 0.35 &&
      Math.abs((current.points[0]?.x ?? 0) - (layout.points[0]?.x ?? 0)) < 0.35 &&
      Math.abs((current.points[0]?.y ?? 0) - (layout.points[0]?.y ?? 0)) < 0.35 &&
      current.text === layout.text
        ? current
        : layout,
    )
    const editor = editorRef.current
    if (!editor) return
    const words = Math.max(1, layout.text.trim().split(/\s+/).filter(Boolean).length)
    const width = Math.max(300, Math.min(660, 250 + Math.min(12, Math.max(6, words)) * 28))
    const estimatedLines = Math.max(
      5,
      Math.min(12, Math.max(layout.text.split('\n').length, Math.ceil(words / 9))),
    )
    editor.style.left = `${fieldBoundsRef.current.center.x}px`
    editor.style.top = `${fieldBoundsRef.current.center.y}px`
    editor.style.width = `${width}px`
    editor.style.height = `${Math.max(170, Math.min(390, estimatedLines * 31))}px`
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const postProcessCanvas = postProcessCanvasRef.current
    const wallTextureCanvas = wallTextureCanvasRef.current
    if (!canvas || !postProcessCanvas || !wallTextureCanvas) return
    const wallRenderer = new WallTextureRenderer(wallTextureCanvas, initialSettingsRef.current)
    wallRendererRef.current = wallRenderer
    wallRenderer.setSettings(initialSettingsRef.current)

    const engine = new VoronoiCanvasEngine(
      canvas,
      {
        onEditRequested: (cellId, text, ghostPrompt) => {
          const nextEditing = { id: cellId, value: text, originalValue: text, ghostPrompt }
          editingRef.current = nextEditing
          setEditing(nextEditing)
        },
        onEditorLayout: positionEditor,
        onSelectionChanged: setSelection,
        onCanvasChanged: (field, animated) => {
          const circleClip = `circle(${field.radius}px at ${field.center.x}px ${field.center.y}px)`
          canvas.style.clipPath = circleClip
          postProcessCanvas.style.clipPath = circleClip
          wallTextureCanvas.style.clipPath = circleClip
          const nextBounds = { center: { ...field.center }, radius: field.radius }
          fieldBoundsRef.current = nextBounds
          setFieldBounds((current) =>
            current.center.x === nextBounds.center.x &&
            current.center.y === nextBounds.center.y &&
            current.radius === nextBounds.radius
              ? current
              : nextBounds,
          )
          postProcessorRef.current?.setState(settingsRef.current, field, animated)
        },
        onHistoryChanged,
        onWallFrame: (snapshot) => {
          if (wallRenderer.render(snapshot)) {
            postProcessorRef.current?.requestFrame(true)
          }
        },
      },
      initialSettingsRef.current,
    )
    engineRef.current = engine
    const postProcessor = new MicroscopePostProcessor(
      canvas,
      wallTextureCanvas,
      postProcessCanvas,
      initialSettingsRef.current,
      engine.getFieldBounds(),
      onPostProcessingStatus,
    )
    postProcessorRef.current = postProcessor
    engine.setCoordinateMapper((point) => postProcessor.mapPointer(point))
    const debugBridge = {
      snapshot: () => engine.getSnapshot(),
      serialize: () => engine.serialize(),
      load: (serialized: string) => engine.load(serialized),
      forceSeed: () => engine.forceSpawnSeed(),
      dieSeed: () => engine.forceExpireFirstSeed(),
      undo: () => engine.undo(),
      redo: () => engine.redo(),
      postProcess: () => postProcessor.getDebugSnapshot(),
      mapPostProcessPoint: (point: { x: number; y: number }) =>
        postProcessor.mapPointer(point),
    }
    window.__VORONOI_DEBUG__ = debugBridge

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotionPreference = () => engine.setReducedMotion(motionQuery.matches)
    updateMotionPreference()
    motionQuery.addEventListener('change', updateMotionPreference)

    return () => {
      motionQuery.removeEventListener('change', updateMotionPreference)
      if (window.__VORONOI_DEBUG__ === debugBridge) {
        delete window.__VORONOI_DEBUG__
      }
      postProcessor.destroy()
      wallRendererRef.current = null
      postProcessorRef.current = null
      engine.destroy()
      engineRef.current = null
    }
  }, [onHistoryChanged, onPostProcessingStatus])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    const activeEditor = editingRef.current
    if (activeEditor && mode !== 'select') {
      engine.finishEditing(activeEditor.id, editorRef.current?.value ?? activeEditor.value)
      editingRef.current = null
      setEditing(null)
    }
    engine.setMode(mode)
  }, [mode])

  useEffect(() => {
    settingsRef.current = settings
    engineRef.current?.setSettings(settings)
    wallRendererRef.current?.setSettings(settings)
    const engine = engineRef.current
    if (engine) postProcessorRef.current?.setState(settings, engine.getFieldBounds(), true)
  }, [settings])

  useEffect(() => {
    engineRef.current?.setAutoGrowth(autoGrowth)
  }, [autoGrowth])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    if ((blocked || suspended) && editingRef.current) {
      const active = editingRef.current
      engine.finishEditing(active.id, editorRef.current?.value ?? active.value)
      editingRef.current = null
      setEditing(null)
    }
    engine.setBlocked(blocked || suspended)
    engine.setClusteringWave(clusteringWave && !suspended)
    engine.setSuspended(suspended)
    postProcessorRef.current?.setSuspended(suspended)
  }, [blocked, clusteringWave, suspended])

  useEffect(() => {
    if (seedAuditRequest === previousSeedAuditRequestRef.current) return
    previousSeedAuditRequestRef.current = seedAuditRequest
    engineRef.current?.forceSpawnSeed()
  }, [seedAuditRequest])

  useEffect(() => {
    if (!historyRequest) return
    if (historyRequest.kind === 'undo') engineRef.current?.undo()
    else engineRef.current?.redo()
  }, [historyRequest])

  useEffect(() => {
    const handleGlobalKey = (event: globalThis.KeyboardEvent) => {
      if (blocked || suspended) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        if (editingRef.current) return
        event.preventDefault()
        if (event.shiftKey) engineRef.current?.redo()
        else engineRef.current?.undo()
        return
      }
      if (event.key === 'Escape' && !editingRef.current) {
        engineRef.current?.handleKey('Escape')
      }
    }
    window.addEventListener('keydown', handleGlobalKey)
    return () => window.removeEventListener('keydown', handleGlobalKey)
  }, [blocked, suspended])

  useImperativeHandle(
    forwardedRef,
    () => ({
      serialize: () => engineRef.current?.serialize() ?? '',
      replaceDocument: (serialized, command) =>
        engineRef.current?.replaceDocument(serialized, command),
      applyClustering: (cellIds, result) =>
        engineRef.current?.applyClustering(cellIds, result) ?? false,
      snapshot: () => engineRef.current?.getSnapshot() ?? null,
      dieFirstSeed: () => engineRef.current?.forceExpireFirstSeed() ?? false,
      addCellAtCentroid: () => engineRef.current?.addCellAtCentroid() ?? false,
    }),
    [],
  )

  useLayoutEffect(() => {
    if (!editing) return
    const editor = editorRef.current
    const layout = latestLayoutRef.current
    if (!editor) return
    if (layout) positionEditor(layout)
    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
  }, [editing])

  useEffect(() => {
    onEditingChanged?.(Boolean(editing))
  }, [editing, onEditingChanged])

  useEffect(
    () => () => {
      if (focusExitTimerRef.current !== null) {
        window.clearTimeout(focusExitTimerRef.current)
      }
    },
    [],
  )

  const beginFocusExit = () => {
    setFocusExiting(true)
    if (focusExitTimerRef.current !== null) window.clearTimeout(focusExitTimerRef.current)
    focusExitTimerRef.current = window.setTimeout(() => {
      setFocusExiting(false)
      setFocusLayout(null)
      focusExitTimerRef.current = null
    }, settingsRef.current.editFocus.durationMs)
  }

  const finishEditingWithTransition = (kind: 'commit' | 'cancel') => {
    const active = editingRef.current
    if (!active) return
    if (kind === 'commit') {
      engineRef.current?.finishEditing(active.id, editorRef.current?.value ?? active.value)
    } else {
      engineRef.current?.cancelEditing()
    }
    editingRef.current = null
    setEditing(null)
    beginFocusExit()
    canvasRef.current?.focus({ preventScroll: true })
  }

  useEffect(() => {
    if (!editing) return
    const commitFromOutside = (event: PointerEvent) => {
      const editor = editorRef.current
      if (editor?.contains(event.target as Node)) return
      finishEditingWithTransition('commit')
    }
    document.addEventListener('pointerdown', commitFromOutside)
    return () => document.removeEventListener('pointerdown', commitFromOutside)
  }, [editing])

  const commitEditing = () => {
    if (!editing || editingRef.current?.id !== editing.id) return
    finishEditingWithTransition('commit')
  }

  const cancelEditing = () => {
    if (!editing || editingRef.current?.id !== editing.id) return
    finishEditingWithTransition('cancel')
  }

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      cancelEditing()
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.stopPropagation()
      commitEditing()
    }
  }

  const handleCanvasKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === 'Escape' || event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      engineRef.current?.handleKey(event.key)
      return
    }
    if (mode === 'select' && event.key === 'Enter' && selection && !selection.startsWith('group:')) {
      event.preventDefault()
      engineRef.current?.startEditing(selection)
    }
  }

  const stopEditorPointer = (event: ReactPointerEvent<HTMLTextAreaElement>) => {
    event.stopPropagation()
  }

  const focusScale =
    focusLayout && fieldBounds.radius > 1
      ? Math.max(
          1,
          (fieldBounds.radius * 2 * settings.editFocus.coverage) /
            Math.max(focusLayout.polygonWidth, focusLayout.height),
        )
      : 1
  const focusTranslateX =
    fieldBounds.center.x -
    (focusLayout?.x ?? fieldBounds.center.x) * focusScale
  const focusTranslateY =
    fieldBounds.center.y -
    (focusLayout?.y ?? fieldBounds.center.y) * focusScale
  const focusSafeClip = focusLayout?.points.length
    ? `polygon(${focusLayout.points
        .map(
          (point) =>
            `${point.x * focusScale + focusTranslateX}px ${point.y * focusScale + focusTranslateY}px`,
        )
        .join(',')})`
    : undefined
  const focusStyle = {
    '--focus-scale': String(focusScale),
    '--focus-x': `${focusTranslateX}px`,
    '--focus-y': `${focusTranslateY}px`,
    '--focus-duration': `${settings.editFocus.durationMs}ms`,
    '--focus-blur': `${settings.editFocus.blurPx}px`,
    '--focus-ease':
      settings.editFocus.easing === 'linear'
        ? 'linear'
        : settings.editFocus.easing === 'spring'
          ? 'cubic-bezier(.2,.9,.25,1.12)'
          : 'cubic-bezier(.4,0,.2,1)',
    '--field-center-x': `${fieldBounds.center.x}px`,
    '--field-center-y': `${fieldBounds.center.y}px`,
    '--field-radius': `${fieldBounds.radius}px`,
  } as CSSProperties

  return (
    <main
      className={`voronoi-stage ${suspended ? 'is-suspended' : ''}`}
      aria-hidden={suspended}
      style={focusStyle}
    >
      <svg className="wall-filter-defs" aria-hidden="true" width="0" height="0">
        <defs>
          <filter
            id="paper-wall-pencil"
            x="-3%"
            y="-3%"
            width="106%"
            height="106%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency={`${settings.geometry.wallGrainFrequency} ${settings.geometry.wallGrainFrequency * 2.4}`}
              numOctaves={settings.geometry.wallGrainOctaves}
              seed="17"
              result="pencilNoise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="pencilNoise"
              scale={settings.geometry.wallGrainEnabled ? settings.geometry.wallGrain : 0}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>
      <div
        className="microscope-viewport-mask"
        style={{
          clipPath: `circle(${fieldBounds.radius}px at ${fieldBounds.center.x}px ${fieldBounds.center.y}px)`,
        }}
      >
        <div
          className={`microscope-scene ${editing ? 'is-focus-editing' : ''} ${focusExiting ? 'is-focus-exiting' : ''}`}
        >
          <canvas
            ref={canvasRef}
            className="voronoi-canvas"
            data-testid="voronoi-canvas"
            tabIndex={blocked || suspended ? -1 : 0}
            role="application"
            aria-label="Interactive journal cell canvas"
            onKeyDown={handleCanvasKeyDown}
          />
          <canvas
            ref={postProcessCanvasRef}
            className="microscope-canvas"
            data-testid="microscope-canvas"
            aria-hidden="true"
          />
          <canvas
            ref={wallTextureCanvasRef}
            className="wall-texture-canvas"
            data-testid="wall-texture-canvas"
            aria-hidden="true"
          />
        </div>
      </div>
      {editing && (
        <>
          <button
            className="focus-edit-dismiss"
            type="button"
            aria-label="Close focused text editing"
            data-testid="focus-edit-dismiss"
            onPointerDown={commitEditing}
          />
          <div
            className="focus-edit-safe-zone"
            aria-hidden="true"
            style={{ clipPath: focusSafeClip }}
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              editorRef.current?.focus()
            }}
          />
          <textarea
            ref={editorRef}
            className="cell-editor"
            data-testid="cell-editor"
            aria-label="Edit cell text"
            defaultValue={editing.value}
            placeholder={editing.ghostPrompt}
            rows={5}
            spellCheck
            onInput={(event) => {
              const value = event.currentTarget.value
              const words = Math.max(1, value.trim().split(/\s+/).filter(Boolean).length)
              const lines = Math.max(
                5,
                Math.min(12, Math.max(value.split('\n').length, Math.ceil(words / 9))),
              )
              event.currentTarget.style.width = `${Math.max(
                300,
                Math.min(660, 250 + Math.min(12, Math.max(6, words)) * 28),
              )}px`
              event.currentTarget.style.height = `${Math.max(170, Math.min(390, lines * 31))}px`
            }}
            onKeyDown={handleEditorKeyDown}
            onPointerDown={stopEditorPointer}
          />
        </>
      )}
      <div className="sr-only" aria-live="polite">
        {selection ? `Cell ${selection} selected` : 'No cell selected'}
      </div>
    </main>
  )
})

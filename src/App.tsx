import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { runLocalClustering } from './clustering-client'
import type { ClusteringProgress } from './clustering'
import { ControlPanel } from './ControlPanel'
import { DateRail } from './DateRail'
import { EditorAccessoryBar } from './EditorAccessoryBar'
import { createJournalStore } from './journal-store'
import { ListEditor } from './ListEditor'
import { prepareListDocumentForMicroscope } from './list-model'
import { toLocalDayKey, type DayKey } from './local-day'
import type { PostProcessStatus } from './microscope-postprocess'
import {
  createDefaultDocument,
  createEmptyDocument,
  deserializeDocument,
  serializeDocument,
  type VoronoiDocument,
} from './model'
import { cloneSettings, defaultSettings } from './settings'
import {
  chooseRendererQuality,
  type RendererQualityPreference,
} from './render-quality'
import { SelectedCellActions } from './SelectedCellActions'
import { ToolbarDock } from './ToolbarDock'
import { VoronoiStage, type VoronoiStageHandle } from './VoronoiStage'
import type { CanvasMode } from './voronoi-engine'
import {
  AdaptiveTextGenerationCoordinator,
  BrowserWorkerTextVariantGenerator,
  type AdaptiveTextRuntimeState,
} from './adaptive-text-generator'
import {
  canonicalTextHash,
  type AdaptiveTextVariantMetadata,
} from './adaptive-text'
import { useResponsiveEnvironment } from './use-responsive-environment'
import './App.css'

function GearIcon() {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <path d="M11.4 3.6h5.2l.8 3 2.7 1.6 3-.8 2.6 4.5-2.2 2.2v3.1l2.2 2.2-2.6 4.5-3-.8-2.7 1.6-.8 3h-5.2l-.8-3-2.7-1.6-3 .8-2.6-4.5 2.2-2.2v-3.1l-2.2-2.2 2.6-4.5 3 .8 2.7-1.6Z" />
      <circle cx="14" cy="15.6" r="3.4" />
    </svg>
  )
}

function abortableDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, milliseconds)
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeout)
        const error = new Error('Clustering cancelled')
        error.name = 'AbortError'
        reject(error)
      },
      { once: true },
    )
  })
}

function App() {
  const responsive = useResponsiveEnvironment()
  const [journalSession] = useState(() => {
    const store = createJournalStore()
    const today = new Date()
    const dayKey = toLocalDayKey(today)
    const document = store.loadPage(dayKey) ?? createDefaultDocument()
    if (!store.getSharedPalette()) store.setSharedPalette(document.settings.palette)
    if (!store.hasPage(dayKey)) store.savePage(dayKey, document)
    return { store, today, dayKey, document }
  })
  const stageRef = useRef<VoronoiStageHandle>(null)
  const clusterAbortRef = useRef<AbortController | null>(null)
  const panelBeforeClusterRef = useRef(false)
  const [mode, setMode] = useState<CanvasMode>('select')
  const [selectedCellIds, setSelectedCellIds] = useState<string[]>([])
  const [recommendedSplitCount, setRecommendedSplitCount] =
    useState<number | null>(null)
  const [view, setView] = useState<'microscope' | 'list'>(() =>
    new URLSearchParams(window.location.search).get('view') === 'microscope'
      ? 'microscope'
      : 'list',
  )
  const [selectedDayKey, setSelectedDayKey] = useState<DayKey>(journalSession.dayKey)
  const [listDocument, setListDocument] = useState<VoronoiDocument | null>(() =>
    deserializeDocument(serializeDocument(journalSession.document)),
  )
  const [listDirty, setListDirty] = useState(false)
  const [contentDayKeys, setContentDayKeys] = useState(
    () => journalSession.store.contentDayKeys(),
  )
  const [autoGrowth, setAutoGrowth] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [stageEditing, setStageEditing] = useState(false)
  const [seedAuditRequest, setSeedAuditRequest] = useState(0)
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false })
  const [postProcessingStatus, setPostProcessingStatus] = useState<
    PostProcessStatus | 'checking'
  >('checking')
  const [rendererQualityPreference, setRendererQualityPreference] =
    useState<RendererQualityPreference>(() => {
      const saved = window.localStorage.getItem('mytosis.renderer-quality')
      return saved === 'high' || saved === 'balanced' || saved === 'low'
        ? saved
        : 'auto'
    })
  const [adaptiveTextStatus, setAdaptiveTextStatus] =
    useState<AdaptiveTextRuntimeState>({
      phase: 'idle',
      message: 'Adaptive text idle',
    })
  const [settings, setSettings] = useState(() =>
    cloneSettings(journalSession.document.settings ?? defaultSettings),
  )
  const selectedDayKeyRef = useRef(selectedDayKey)
  const listDocumentRef = useRef(listDocument)
  const viewRef = useRef(view)
  const settingsRef = useRef(settings)
  const adaptiveTextCoordinatorRef =
    useRef<AdaptiveTextGenerationCoordinator | null>(null)
  const lastSavedRef = useRef(
    new Map<DayKey, string>([
      [journalSession.dayKey, serializeDocument(journalSession.document)],
    ]),
  )
  const [viewTransition, setViewTransition] = useState<
    'microscope-out' | 'list-in' | 'list-out' | 'microscope-in' | null
  >(null)
  const [dateTransition, setDateTransition] = useState<{
    phase: 'out' | 'in'
    direction: 'forward' | 'backward'
  } | null>(null)
  const transitionTimersRef = useRef<number[]>([])
  const [clustering, setClustering] = useState<{
    phase: 'processing' | 'settling'
    progress: number
    message: string
  } | null>(null)
  const clusteringActive = clustering !== null
  const transitionActive = viewTransition !== null || dateTransition !== null
  const rendererQuality = useMemo(
    () =>
      chooseRendererQuality({
        preference: rendererQualityPreference,
        layoutClass: responsive.layout.className,
        devicePixelRatio: window.devicePixelRatio || 1,
        postProcessStatus: postProcessingStatus,
      }),
    [
      postProcessingStatus,
      rendererQualityPreference,
      responsive.layout.className,
    ],
  )
  const showTouchActions =
    view === 'microscope' &&
    !stageEditing &&
    !panelOpen &&
    !clusteringActive &&
    (responsive.coarsePointer ||
      responsive.layout.className === 'compact-portrait' ||
      responsive.layout.className === 'compact-landscape')
  const mobileEditing =
    stageEditing &&
    (responsive.coarsePointer ||
      responsive.layout.className === 'compact-portrait' ||
      responsive.layout.className === 'compact-landscape')
  const handleHistoryChanged = useCallback((canUndo: boolean, canRedo: boolean) => {
    setHistoryState({ canUndo, canRedo })
  }, [])
  const refreshContentDays = useCallback(() => {
    const next = journalSession.store.contentDayKeys()
    setContentDayKeys((current) => {
      if (
        current.size === next.size &&
        [...current].every((dayKey) => next.has(dayKey))
      ) {
        return current
      }
      return next
    })
  }, [journalSession])
  const persistDocument = useCallback(
    (dayKey: DayKey, document: VoronoiDocument) => {
      const serialized = serializeDocument(document)
      if (lastSavedRef.current.get(dayKey) === serialized) return
      journalSession.store.savePage(dayKey, document)
      lastSavedRef.current.set(dayKey, serialized)
      refreshContentDays()
    },
    [journalSession, refreshContentDays],
  )
  const applyAdaptiveTextMetadata = useCallback(
    (
      cellId: string,
      sourceHash: string,
      metadata: AdaptiveTextVariantMetadata | undefined,
    ) => {
      stageRef.current?.setTextVariants(cellId, sourceHash, metadata)
      setListDocument((current) => {
        if (!current) return current
        const cell = current.cells.find((candidate) => candidate.id === cellId)
        if (!cell || canonicalTextHash(cell.text) !== sourceHash) return current
        const next = structuredClone(current)
        const nextCell = next.cells.find((candidate) => candidate.id === cellId)
        if (!nextCell) return current
        if (metadata) nextCell.textVariants = structuredClone(metadata)
        else delete nextCell.textVariants
        return next
      })
    },
    [],
  )
  useEffect(() => {
    const coordinator = new AdaptiveTextGenerationCoordinator({
        generator: new BrowserWorkerTextVariantGenerator(),
        onMetadata: applyAdaptiveTextMetadata,
        onRuntimeState: setAdaptiveTextStatus,
      })
    adaptiveTextCoordinatorRef.current = coordinator
    return () => {
      if (adaptiveTextCoordinatorRef.current === coordinator) {
        adaptiveTextCoordinatorRef.current = null
      }
      coordinator.dispose()
    }
  }, [applyAdaptiveTextMetadata])
  const scheduleAdaptiveText = useCallback(
    (cellId: string, text: string) => {
      adaptiveTextCoordinatorRef.current?.schedule(cellId, text, {
        enabled: settingsRef.current.adaptiveText.enabled,
        debounceMs: settingsRef.current.adaptiveText.debounceMs,
      })
    },
    [],
  )
  const handleListDocumentChange = useCallback(
    (document: VoronoiDocument) => {
      const previous = listDocumentRef.current
      setListDocument(document)
      setListDirty(true)
      for (const cell of document.cells) {
        const previousText = previous?.cells.find(
          (candidate) => candidate.id === cell.id,
        )?.text
        if (cell.text !== previousText) scheduleAdaptiveText(cell.id, cell.text)
      }
    },
    [scheduleAdaptiveText],
  )
  const updateSettings = (next: typeof settings) => {
    if (
      JSON.stringify(settingsRef.current.palette) !== JSON.stringify(next.palette)
    ) {
      journalSession.store.setSharedPalette(next.palette)
    }
    setSettings(next)
    settingsRef.current = next
    setListDocument((current) =>
      current ? { ...current, settings: cloneSettings(next) } : current,
    )
    if ((!next.mergeSplit.enabled || next.mergeSplit.newSelect) && mode === 'merge') {
      setMode('select')
    }
  }
  const requestHistory = (kind: 'undo' | 'redo') => {
    const serialized =
      kind === 'undo' ? stageRef.current?.undo() : stageRef.current?.redo()
    if (!serialized) return
    const document = deserializeDocument(serialized)
    setListDocument(document)
    setListDirty(false)
    persistDocument(selectedDayKeyRef.current, document)
  }
  const commitListDocument = (document: VoronoiDocument, command: string) => {
    const serialized = serializeDocument(document)
    const before = stageRef.current?.serialize()
    if (before === serialized) {
      setListDirty(false)
      persistDocument(selectedDayKeyRef.current, document)
      return
    }
    stageRef.current?.replaceDocument(serialized, command)
    const current = stageRef.current?.serialize()
    if (current) {
      const canonical = deserializeDocument(current)
      setListDocument(canonical)
      setListDirty(false)
      persistDocument(selectedDayKeyRef.current, canonical)
    }
  }
  const selectDay = (nextDayKey: DayKey) => {
    if (
      nextDayKey === selectedDayKeyRef.current ||
      viewTransition !== null ||
      clusteringActive
    ) {
      return
    }
    for (const timer of transitionTimersRef.current) window.clearTimeout(timer)
    transitionTimersRef.current = []
    adaptiveTextCoordinatorRef.current?.cancelAll()
    const previousDayKey = selectedDayKeyRef.current
    const currentDocument =
      viewRef.current === 'list'
        ? listDocumentRef.current
        : (() => {
            const serialized = stageRef.current?.serialize()
            return serialized ? deserializeDocument(serialized) : null
          })()
    if (currentDocument) {
      persistDocument(selectedDayKeyRef.current, currentDocument)
    }
    const applyNextDay = () => {
      const nextDocument =
        journalSession.store.loadPage(nextDayKey) ?? createEmptyDocument()
      if (!journalSession.store.hasPage(nextDayKey)) {
        nextDocument.settings = cloneSettings(settingsRef.current)
        nextDocument.layout.settingsVersion = nextDocument.settings.schemaVersion
      }
      nextDocument.settings.palette = structuredClone(
        journalSession.store.getSharedPalette() ?? settingsRef.current.palette,
      )
      const serialized = serializeDocument(nextDocument)
      lastSavedRef.current.set(nextDayKey, serialized)
      selectedDayKeyRef.current = nextDayKey
      setSelectedDayKey(nextDayKey)
      setSettings(cloneSettings(nextDocument.settings))
      settingsRef.current = nextDocument.settings
      setListDocument(deserializeDocument(serialized))
      setListDirty(false)
      setHistoryState({ canUndo: false, canRedo: false })
      setSelectedCellIds([])
      stageRef.current?.loadDocument(serialized)
    }
    if (
      !settingsRef.current.viewTransition.enabled ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setDateTransition(null)
      applyNextDay()
      return
    }
    const direction = nextDayKey > previousDayKey ? 'forward' : 'backward'
    const duration = Math.max(240, settingsRef.current.viewTransition.durationMs)
    setDateTransition({ phase: 'out', direction })
    const midpointTimer = window.setTimeout(() => {
      applyNextDay()
      setDateTransition({ phase: 'in', direction })
    }, duration / 2)
    const endTimer = window.setTimeout(() => setDateTransition(null), duration)
    transitionTimersRef.current = [midpointTimer, endTimer]
  }
  const startAnew = () => {
    if (
      !window.confirm(
        'Erase every saved journal page on this device and restore the starter journal?',
      )
    ) {
      return
    }
    clusterAbortRef.current?.abort()
    adaptiveTextCoordinatorRef.current?.cancelAll()
    journalSession.store.clearAll()
    const nextDayKey = toLocalDayKey(new Date())
    const nextDocument = createDefaultDocument()
    const serialized = serializeDocument(nextDocument)
    journalSession.store.savePage(nextDayKey, nextDocument)
    journalSession.store.setSharedPalette(nextDocument.settings.palette)
    lastSavedRef.current.clear()
    lastSavedRef.current.set(nextDayKey, serialized)
    selectedDayKeyRef.current = nextDayKey
    listDocumentRef.current = deserializeDocument(serialized)
    settingsRef.current = cloneSettings(nextDocument.settings)
    setSelectedDayKey(nextDayKey)
    setListDocument(deserializeDocument(serialized))
    setListDirty(false)
    setSettings(cloneSettings(nextDocument.settings))
    setContentDayKeys(journalSession.store.contentDayKeys())
    setHistoryState({ canUndo: false, canRedo: false })
    setMode('select')
    setSelectedCellIds([])
    setPanelOpen(false)
    setView('list')
    stageRef.current?.loadDocument(serialized)
  }
  useEffect(() => {
    selectedDayKeyRef.current = selectedDayKey
    listDocumentRef.current = listDocument
    viewRef.current = view
    settingsRef.current = settings
  }, [listDocument, selectedDayKey, settings, view])
  useEffect(() => {
    const saveCurrentPage = () => {
      const document =
        viewRef.current === 'list'
          ? listDocumentRef.current
          : (() => {
              const serialized = stageRef.current?.serialize()
              return serialized ? deserializeDocument(serialized) : null
            })()
      if (document) persistDocument(selectedDayKeyRef.current, document)
    }
    const interval = window.setInterval(saveCurrentPage, 500)
    window.addEventListener('beforeunload', saveCurrentPage)
    return () => {
      saveCurrentPage()
      window.clearInterval(interval)
      window.removeEventListener('beforeunload', saveCurrentPage)
    }
  }, [persistDocument])
  useEffect(
    () => () => {
      for (const timer of transitionTimersRef.current) window.clearTimeout(timer)
    },
    [],
  )
  useEffect(() => {
    if (!settings.adaptiveText.enabled) {
      adaptiveTextCoordinatorRef.current?.cancelAll()
    }
  }, [settings.adaptiveText.enabled])
  const switchViewWithTransition = (
    target: 'microscope' | 'list',
    atMidpoint: () => void,
  ) => {
    if (transitionActive) return
    if (
      !settings.viewTransition.enabled ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      atMidpoint()
      setView(target)
      return
    }
    const duration = Math.max(200, settings.viewTransition.durationMs)
    const half = duration / 2
    setViewTransition(target === 'list' ? 'microscope-out' : 'list-out')
    const midpointTimer = window.setTimeout(() => {
      atMidpoint()
      setView(target)
      setViewTransition(target === 'list' ? 'list-in' : 'microscope-in')
    }, half)
    const endTimer = window.setTimeout(() => setViewTransition(null), duration)
    transitionTimersRef.current = [midpointTimer, endTimer]
  }
  const openListView = () => {
    if (clusteringActive || transitionActive) return
    const serialized = stageRef.current?.serialize()
    if (!serialized) return
    setPanelOpen(false)
    const nextDocument = deserializeDocument(serialized)
    switchViewWithTransition('list', () => setListDocument(nextDocument))
  }
  const closeListView = () => {
    if (transitionActive) return
    if (!listDocument) {
      setView('microscope')
      return
    }
    const prepared = prepareListDocumentForMicroscope(listDocument)
    switchViewWithTransition('microscope', () =>
      commitListDocument(prepared, 'list-return'),
    )
  }
  const cancelClustering = () => clusterAbortRef.current?.abort()
  const startClustering = async () => {
    if (clusteringActive) {
      cancelClustering()
      return
    }
    const serialized = stageRef.current?.serialize()
    if (!serialized) return
    const document = deserializeDocument(serialized)
    const cells = document.cells.filter((cell) => cell.kind === 'journal' && cell.text.trim())
    if (cells.length < 2) return
    const controller = new AbortController()
    clusterAbortRef.current = controller
    panelBeforeClusterRef.current = panelOpen
    setPanelOpen(false)
    setClustering({
      phase: 'processing',
      progress: 0,
      message: 'Preparing local groups',
    })
    const startedAt = performance.now()
    const updateProgress = (progress: ClusteringProgress) =>
      setClustering({
        phase: 'processing',
        progress: progress.progress,
        message: progress.message,
      })
    try {
      const result = await runLocalClustering(
        cells.map((cell) => cell.text),
        {
          autoK: settings.clustering.autoK,
          minK: settings.clustering.minK,
          maxK: settings.clustering.maxK,
          seed: settings.clustering.seed,
        },
        controller.signal,
        updateProgress,
      )
      const minimumCancellableWindow = 450
      await abortableDelay(
        Math.max(0, minimumCancellableWindow - (performance.now() - startedAt)),
        controller.signal,
      )
      if (controller.signal.aborted) return
      setClustering({ phase: 'settling', progress: 1, message: `Settling ${result.k} groups` })
      stageRef.current?.applyClustering(
        cells.map((cell) => cell.id),
        result,
      )
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'AbortError') {
        console.error(error)
      }
    } finally {
      if (clusterAbortRef.current === controller) {
        clusterAbortRef.current = null
        setClustering(null)
        setPanelOpen(panelBeforeClusterRef.current)
      }
    }
  }
  const transitionStyle = {
    '--view-phase-duration': `${Math.max(150, settings.viewTransition.durationMs / 2)}ms`,
    '--view-transition-blur': `${settings.viewTransition.blurPx}px`,
    '--view-transition-origin': `50% ${settings.viewTransition.arcDepth * 100}vh`,
    '--view-transition-ease':
      settings.viewTransition.easing === 'linear'
        ? 'linear'
        : settings.viewTransition.easing === 'spring'
          ? 'cubic-bezier(.2,.9,.25,1.12)'
          : 'cubic-bezier(.4,0,.2,1)',
    '--visual-viewport-bottom': `${responsive.viewport.keyboardInset}px`,
    '--date-chrome-height': `${responsive.layout.dateChromeHeight}px`,
    '--toolbar-height': `${responsive.layout.toolbarHeight}px`,
    '--usable-top': `${responsive.layout.usable.top}px`,
    '--usable-right': `${responsive.layout.usable.right}px`,
    '--usable-bottom': `${responsive.layout.usable.bottom}px`,
    '--usable-left': `${responsive.layout.usable.left}px`,
  } as CSSProperties

  return (
    <div
      className={`app-shell app-shell--${view} layout-${responsive.layout.className} ${
        responsive.layout.keyboardConstrained ? 'is-keyboard-constrained' : ''
      } ${responsive.coarsePointer ? 'has-coarse-pointer' : ''} ${
        stageEditing ? 'is-stage-editing' : ''
      } ${viewTransition ? `view-transition-${viewTransition}` : ''} ${
        dateTransition
          ? `date-transition-${dateTransition.direction}-${dateTransition.phase}`
          : ''
      }`}
      data-layout-class={responsive.layout.className}
      data-orientation={responsive.layout.orientation}
      data-keyboard-constrained={responsive.layout.keyboardConstrained}
      data-coarse-pointer={responsive.coarsePointer}
      style={{
        background:
          view === 'list' ? 'var(--paper-background)' : settings.palette.exterior,
        ...transitionStyle,
      }}
    >
      <VoronoiStage
        ref={stageRef}
        initialDocument={serializeDocument(journalSession.document)}
        mode={mode}
        settings={settings}
        autoGrowth={autoGrowth}
        seedAuditRequest={seedAuditRequest}
        historyRequest={null}
        blocked={clusteringActive || transitionActive}
        suspended={view === 'list'}
        clusteringWave={clusteringActive}
        viewportInsets={responsive.layout.usable}
        mobileEditing={mobileEditing}
        rendererQuality={rendererQuality}
        onPostProcessingStatus={setPostProcessingStatus}
        onHistoryChanged={handleHistoryChanged}
        onEditingChanged={(editing) => {
          setStageEditing(editing)
          if (editing) setPanelOpen(false)
        }}
        onModeChanged={setMode}
        onCanonicalTextChanged={scheduleAdaptiveText}
        onSelectionChanged={(ids) => {
          setSelectedCellIds([...ids])
          setRecommendedSplitCount(
            ids.length === 1
              ? stageRef.current?.recommendedSplitCount() ?? null
              : null,
          )
        }}
      />
      {view === 'list' && listDocument && (
        <ListEditor
          document={listDocument}
          onChange={handleListDocumentChange}
          onCommit={commitListDocument}
        />
      )}
      <div className={`journal-date-rail journal-date-rail--${view}`}>
        <DateRail
          selectedDayKey={selectedDayKey}
          onSelectDay={selectDay}
          contentDayKeys={contentDayKeys}
          theme={view}
          disabled={clusteringActive || viewTransition !== null}
        />
      </div>
      {showTouchActions ? (
        <SelectedCellActions
          selectionCount={selectedCellIds.length}
          recommendedSplitCount={recommendedSplitCount}
          onEdit={() => stageRef.current?.editSelectedCell()}
          onSplit={(count) => stageRef.current?.splitSelectedCell(count)}
          onMergeNearest={() => stageRef.current?.mergeSelectedWithNearest()}
          onGroup={() => {
            if (stageRef.current?.groupSelectedCells()) {
              setSelectedCellIds([])
              setMode('select')
            }
          }}
          onDone={() => stageRef.current?.finishTouchMultiSelect()}
        />
      ) : null}
      {!mobileEditing ? (
        <ToolbarDock
        viewMode={view}
        activeTool={mode === 'add' ? 'addCell' : 'select'}
        selectionCount={selectedCellIds.length}
        cultivateOn={autoGrowth}
        clusteringActive={clusteringActive}
        transitionActive={transitionActive}
        canUndo={historyState.canUndo}
        canRedo={historyState.canRedo}
        listDirty={listDirty}
        onUndo={() => requestHistory('undo')}
        onRedo={() => requestHistory('redo')}
        onSelect={() => setMode('select')}
        onAddCell={() => {
          if (mode === 'add') stageRef.current?.addCellAtCentroid()
          else setMode('add')
        }}
        onGroupAction={() => {
          if (selectedCellIds.length > 1) {
            if (stageRef.current?.groupSelectedCells()) {
              setSelectedCellIds([])
              setMode('select')
            }
            return
          }
          void startClustering()
        }}
        onCultivate={() => setAutoGrowth((current) => !current)}
        onOpenList={openListView}
          onReturnMicroscope={closeListView}
        />
      ) : (
        <EditorAccessoryBar
          onCancel={() => stageRef.current?.cancelEditing()}
          onUndo={() => stageRef.current?.undoEditingDraft()}
          onRedo={() => stageRef.current?.redoEditingDraft()}
          onDone={() => stageRef.current?.commitEditing()}
        />
      )}

      {viewTransition && <div className="view-transition-curtain" aria-hidden="true" />}

      {clustering && (
        <div
          className="clustering-status"
          role="status"
          aria-live="polite"
          data-testid="clustering-status"
        >
          <span>{clustering.message}</span>
          <span>{Math.round(clustering.progress * 100)}%</span>
        </div>
      )}

      {view === 'microscope' && panelOpen && !clusteringActive && !transitionActive && (
        <aside className="settings-shell" aria-label="Canvas configuration">
          <label className="renderer-quality-control">
            <span>Renderer quality</span>
            <select
              aria-label="Renderer quality"
              value={rendererQualityPreference}
              onChange={(event) => {
                const preference = event.currentTarget
                  .value as RendererQualityPreference
                setRendererQualityPreference(preference)
                if (preference === 'auto') {
                  window.localStorage.removeItem('mytosis.renderer-quality')
                } else {
                  window.localStorage.setItem(
                    'mytosis.renderer-quality',
                    preference,
                  )
                }
              }}
            >
              <option value="auto">Auto · {rendererQuality}</option>
              <option value="high">High</option>
              <option value="balanced">Balanced</option>
              <option value="low">Low</option>
            </select>
          </label>
          <ControlPanel
            settings={settings}
            postProcessingStatus={postProcessingStatus}
            adaptiveTextStatus={adaptiveTextStatus}
            onChange={updateSettings}
            onAddSeed={() => setSeedAuditRequest((request) => request + 1)}
            onDieSeed={() => stageRef.current?.dieFirstSeed()}
            onStartAnew={startAnew}
          />
        </aside>
      )}
      {view === 'microscope' && !mobileEditing && (
        <button
          className={`settings-toggle ${panelOpen ? 'is-open' : ''}`}
          data-testid="settings-toggle"
          type="button"
          aria-label={panelOpen ? 'Close canvas configuration' : 'Open canvas configuration'}
          aria-expanded={panelOpen}
          title={panelOpen ? 'Close settings' : 'Canvas settings'}
          disabled={clusteringActive || transitionActive}
          onClick={() => setPanelOpen((current) => !current)}
        >
          <GearIcon />
        </button>
      )}
    </div>
  )
}

export default App

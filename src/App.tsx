import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { runLocalClustering } from './clustering-client'
import type { ClusteringProgress } from './clustering'
import { ControlPanel } from './ControlPanel'
import { DateRail } from './DateRail'
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
import { VoronoiStage, type VoronoiStageHandle } from './VoronoiStage'
import type { CanvasMode } from './voronoi-engine'
import './App.css'

function AddCellIcon() {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <path d="M7 3.8 21 3.8 26 14 21 24.2 7 24.2 2 14Z" />
      <path d="M14 9.2v9.6M9.2 14h9.6" />
    </svg>
  )
}

function SelectIcon() {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <path d="m6.4 3.5 15.1 11.2-7.1 1.4-3.7 6.2Z" />
      <path d="m15.1 16 4.3 6.8" />
    </svg>
  )
}

function GroupIcon() {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <path d="m9.2 5.5 5.3 3.1v6.2l-5.3 3.1-5.3-3.1V8.6Z" />
      <path d="m18.8 10.1 5.3 3.1v6.2l-5.3 3.1-5.3-3.1v-6.2Z" />
      <path d="m13.8 13.6 3.7 2.1" />
    </svg>
  )
}

function MergeSplitIcon() {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <path d="M4.2 14c0-4.4 3.2-7.8 7.3-7.8 2.3 0 4.2 1 5.5 2.6 1-.8 2.2-1.2 3.5-1.2 3.3 0 5.8 2.7 5.8 6.1s-2.5 6.1-5.8 6.1c-1.4 0-2.7-.5-3.7-1.4-1.3 1.9-3.2 3.4-5.8 3.4-3.9 0-6.8-3.4-6.8-7.8Z" />
      <path d="M11.2 9.8 16.8 18.2M16.8 9.8 11.2 18.2" />
    </svg>
  )
}

function SproutIcon() {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <path d="M14 23V12.5" />
      <path d="M14 15.5c-5.8 0-8.1-3-8.3-7.5 5.1-.4 8.2 1.8 8.3 7.5Z" />
      <path d="M14 12.5c5.3 0 7.5-2.7 7.7-6.8-4.8-.3-7.6 1.7-7.7 6.8Z" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <path d="M11.4 3.6h5.2l.8 3 2.7 1.6 3-.8 2.6 4.5-2.2 2.2v3.1l2.2 2.2-2.6 4.5-3-.8-2.7 1.6-.8 3h-5.2l-.8-3-2.7-1.6-3 .8-2.6-4.5 2.2-2.2v-3.1l-2.2-2.2 2.6-4.5 3 .8 2.7-1.6Z" />
      <circle cx="14" cy="15.6" r="3.4" />
    </svg>
  )
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <path d="M10.5 8.2 5.4 13l5.1 4.8" />
      <path d="M6 13h8.2c5.1 0 8.1 2.6 8.1 7" />
    </svg>
  )
}

function RedoIcon() {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <path d="m17.5 8.2 5.1 4.8-5.1 4.8" />
      <path d="M22 13h-8.2c-5.1 0-8.1 2.6-8.1 7" />
    </svg>
  )
}

function AutogroupIcon({ cancelling = false }: { cancelling?: boolean }) {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      {cancelling ? (
        <path d="M8 8h12v12H8Z" />
      ) : (
        <>
          <circle cx="9" cy="9" r="3.2" />
          <circle cx="19" cy="10.5" r="3.2" />
          <circle cx="13.5" cy="19" r="3.2" />
          <path d="m11.8 10 4.1.7M10.8 11.8l1.8 4.1m4.4-2.6-1.9 3.2" />
        </>
      )}
    </svg>
  )
}

function ListViewIcon({ returning = false }: { returning?: boolean }) {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      {returning ? (
        <>
          <path d="M6 14h16M14 6v16" />
          <path d="M4.5 9.3 14 3.8l9.5 5.5v9.4L14 24.2l-9.5-5.5Z" />
        </>
      ) : (
        <>
          <circle cx="6.5" cy="8" r="1.2" />
          <circle cx="6.5" cy="14" r="1.2" />
          <circle cx="6.5" cy="20" r="1.2" />
          <path d="M11 8h11M11 14h11M11 20h8" />
        </>
      )}
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
  const [mode, setMode] = useState<CanvasMode>('add')
  const [focusedEditing, setFocusedEditing] = useState(false)
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
  const [seedAuditRequest, setSeedAuditRequest] = useState(0)
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false })
  const [postProcessingStatus, setPostProcessingStatus] = useState<
    PostProcessStatus | 'checking'
  >('checking')
  const [settings, setSettings] = useState(() =>
    cloneSettings(journalSession.document.settings ?? defaultSettings),
  )
  const selectedDayKeyRef = useRef(selectedDayKey)
  const listDocumentRef = useRef(listDocument)
  const viewRef = useRef(view)
  const settingsRef = useRef(settings)
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
    if (nextDayKey === selectedDayKeyRef.current || transitionActive) return
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
      stageRef.current?.loadDocument(serialized)
    }
    if (
      !settingsRef.current.viewTransition.enabled ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
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
    setMode('add')
    setFocusedEditing(false)
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
      const minimumCancellableWindow = Math.min(
        5600,
        Math.max(5000, settings.clustering.animationMs),
      )
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
  const tools = ([
    { mode: 'add', label: 'Add Cell', icon: <AddCellIcon /> },
    { mode: 'select', label: 'Select', icon: <SelectIcon /> },
    { mode: 'group', label: 'Group', icon: <GroupIcon /> },
    {
      mode: 'merge',
      label: 'Merge / Split',
      icon: <MergeSplitIcon />,
      disabled: !settings.mergeSplit.enabled || clusteringActive,
    },
  ] satisfies Array<{
    mode: CanvasMode
    label: string
    icon: React.ReactNode
    disabled?: boolean
  }>)
    .filter((tool) => tool.mode !== 'merge' || !settings.mergeSplit.newSelect)
    .filter(
      (tool) =>
        !focusedEditing ||
        (tool.mode !== 'add' && tool.mode !== 'group' && tool.mode !== 'merge'),
    )

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
  } as CSSProperties

  return (
    <div
      className={`app-shell ${viewTransition ? `view-transition-${viewTransition}` : ''} ${
        dateTransition
          ? `date-transition-${dateTransition.direction}-${dateTransition.phase}`
          : ''
      }`}
      style={{ background: settings.palette.exterior, ...transitionStyle }}
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
        onPostProcessingStatus={setPostProcessingStatus}
        onHistoryChanged={handleHistoryChanged}
        onEditingChanged={setFocusedEditing}
        onModeChanged={setMode}
      />
      {view === 'list' && listDocument && (
        <ListEditor
          document={listDocument}
          onChange={(document) => {
            setListDocument(document)
            setListDirty(true)
          }}
          onCommit={commitListDocument}
        />
      )}
      <div className="journal-date-rail">
        <DateRail
          selectedDayKey={selectedDayKey}
          onSelectDay={selectDay}
          contentDayKeys={contentDayKeys}
          theme={view}
          disabled={clusteringActive || transitionActive}
        />
      </div>
      <nav aria-label={view === 'list' ? 'Return to microscope' : 'Canvas controls'}>
        <div
          className={`tool-dock ${view === 'list' ? 'list-only-dock' : ''}`}
          role="toolbar"
          aria-label={view === 'list' ? 'List view controls' : 'Canvas tools'}
        >
          {view === 'list' ? (
            <>
              <div className="history-toolbar" role="group" aria-label="Journal history">
                <button
                  className="icon-tool-button"
                  data-testid="history-undo"
                  type="button"
                  aria-label="Undo"
                  title="Undo (⌘/Ctrl-Z)"
                  disabled={(!historyState.canUndo && !listDirty) || transitionActive}
                  onClick={() => requestHistory('undo')}
                >
                  <UndoIcon />
                </button>
                <button
                  className="icon-tool-button"
                  data-testid="history-redo"
                  type="button"
                  aria-label="Redo"
                  title="Redo (Shift-⌘/Ctrl-Z)"
                  disabled={!historyState.canRedo || listDirty || transitionActive}
                  onClick={() => requestHistory('redo')}
                >
                  <RedoIcon />
                </button>
              </div>
              <span className="toolbar-divider" aria-hidden="true" />
              <button
                className="tool-button return-microscope-button is-active"
                data-testid="return-microscope"
                type="button"
                aria-label="Return to microscope view"
                data-tooltip="Return to microscope"
                title="Return to microscope"
                disabled={transitionActive}
                onClick={closeListView}
              >
                <ListViewIcon returning />
              </button>
            </>
          ) : (
            <>
              <div className="history-toolbar" role="group" aria-label="Canvas history">
                <button
                  className="icon-tool-button"
                  data-testid="history-undo"
                  type="button"
                  aria-label="Undo"
                  data-tooltip="Undo"
                  title="Undo (⌘/Ctrl-Z)"
                  disabled={!historyState.canUndo || clusteringActive || transitionActive}
                  onClick={() => requestHistory('undo')}
                >
                  <UndoIcon />
                </button>
                <button
                  className="icon-tool-button"
                  data-testid="history-redo"
                  type="button"
                  aria-label="Redo"
                  data-tooltip="Redo"
                  title="Redo (Shift-⌘/Ctrl-Z)"
                  disabled={!historyState.canRedo || clusteringActive || transitionActive}
                  onClick={() => requestHistory('redo')}
                >
                  <RedoIcon />
                </button>
              </div>
              <span className="toolbar-divider" aria-hidden="true" />
              {tools.map((tool) => (
                <button
                  key={tool.mode}
                  className={`tool-button ${mode === tool.mode ? 'is-active' : ''}`}
                  data-testid={`tool-${tool.mode}`}
                  type="button"
                  aria-label={tool.label}
                  aria-pressed={mode === tool.mode}
                  data-tooltip={tool.label}
                  title={tool.label}
                  disabled={tool.disabled || clusteringActive || transitionActive}
                  onClick={() => {
                    if (tool.mode === 'add' && mode === 'add') {
                      stageRef.current?.addCellAtCentroid()
                    } else {
                      setMode(tool.mode)
                    }
                  }}
                >
                  {tool.icon}
                  <span>{tool.label}</span>
                </button>
              ))}
            </>
          )}
          {view === 'microscope' && mode === 'add' && !focusedEditing && (
            <button
              className={`sprout-toggle ${autoGrowth ? 'is-active' : ''}`}
              data-testid="sprout-toggle"
              type="button"
              aria-label="Toggle auto-growth"
              aria-pressed={autoGrowth}
              data-tooltip={autoGrowth ? 'Auto-growth on' : 'Auto-growth off'}
              title={autoGrowth ? 'Auto-growth on' : 'Auto-growth off'}
              disabled={clusteringActive || transitionActive}
              onClick={() => setAutoGrowth((current) => !current)}
            >
              <SproutIcon />
            </button>
          )}
          {view === 'microscope' && mode === 'group' && !focusedEditing && (
            <button
              className={`sprout-toggle autogroup-toggle ${clusteringActive ? 'is-active' : ''}`}
              data-testid="autogroup-toggle"
              type="button"
              aria-label={clusteringActive ? 'Cancel autogroup' : 'Start local autogroup'}
              aria-pressed={clusteringActive}
              data-tooltip={clusteringActive ? 'Cancel' : 'Autogroup'}
              title={clusteringActive ? 'Cancel clustering' : 'Autogroup locally'}
              disabled={transitionActive}
              onClick={startClustering}
            >
              <AutogroupIcon cancelling={clusteringActive} />
            </button>
          )}
          {view === 'microscope' && !clusteringActive && !transitionActive && (
            <>
              <span className="toolbar-divider" aria-hidden="true" />
              <button
                className="icon-tool-button list-view-toggle"
                data-testid="list-view-toggle"
                type="button"
                aria-label="Open bullet list view"
                data-tooltip="Bullet list"
                title="Bullet list view"
                onClick={openListView}
              >
                <ListViewIcon />
              </button>
            </>
          )}
        </div>
      </nav>

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
          <ControlPanel
            settings={settings}
            postProcessingStatus={postProcessingStatus}
            onChange={updateSettings}
            onAddSeed={() => setSeedAuditRequest((request) => request + 1)}
            onDieSeed={() => stageRef.current?.dieFirstSeed()}
            onStartAnew={startAnew}
          />
        </aside>
      )}
      {view === 'microscope' && (
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

import paper from 'paper/dist/paper-core'
import { ambientScaleOffset } from './ambient-motion'
import {
  circlePolygon,
  clamp,
  computePowerDiagram,
  distanceToPolygonEdges,
  findDelaunayTriples,
  insetConvexPolygon,
  pointInPolygon,
  polygonArea,
  polygonBounds,
  polygonCentroid,
  rayPolygonIntersection,
  roundedPolygon,
  stableSamplePolygon,
  type Point2,
  type WeightedSite,
} from './geometry'
import {
  cloneDocument,
  createDefaultDocument,
  deserializeDocument,
  enforceSingleEmptyCell,
  serializeDocument,
  type CellEntity,
  type GroupEntity,
  type VoronoiDocument,
} from './model'
import type { ClusteringResult } from './clustering'
import { BoundedCommandHistory } from './history'
import { reflectiveContentProvider } from './reflective-content'
import { cloneSettings, groupColorFor, type CanvasSettings } from './settings'
import { seedExpiryScale, seedExpiryVisualState } from './seed-expiry'
import {
  caretPointForIndex,
  layoutTextInPolygon,
  measureTextRequirement,
  type WrappedTextLayout,
} from './text-layout'
import {
  easeInteraction,
  groupCuePhase,
  groupCueStrength,
  mergeVibrationState,
  proximityExcitement,
  splitJitterState,
} from './interaction-effects'
import {
  canonicalTextHash,
  selectFittedTextVariant,
  textVariantsForDisplay,
  type AdaptiveTextLevel,
  type AdaptiveTextVariantMetadata,
} from './adaptive-text'

export type CanvasMode = 'add' | 'select' | 'group' | 'merge'
export type EditPresentation = 'focused' | 'inline'

interface CellVisual {
  fillPath: paper.Path
  innerPath: paper.Path
  strokeClipPath: paper.Path
  strokeGroup: paper.Group
  label: paper.Group
  lineLabels: paper.PointText[]
  caretPath: paper.Path
  currentPoints: Point2[]
  targetPoints: Point2[]
  currentInnerPoints: Point2[]
  targetInnerPoints: Point2[]
  velocities: Point2[]
  innerVelocities: Point2[]
  targetOpacity: number
  preview: boolean
  hoverMix: number
  lineBreakKey: string
  pendingLineBreakKey: string
  pendingLineBreakFrames: number
  textLayoutEngine: 'pretext' | 'fallback'
  textEffectScale: number
  displayVariant: AdaptiveTextLevel
}

interface GroupVisual {
  path: paper.Path
  currentPoints: Point2[]
  targetPoints: Point2[]
  velocities: Point2[]
  createdAtMs: number
}

interface GroupSlotLayout {
  signature: string
  targets: Map<string, Point2>
}

interface GroupTextFloor {
  signature: string
  weight: number
}

interface PreviewCell extends CellEntity {
  preview: true
}

interface MoveGesture {
  kind: 'move'
  cellId: string
  offset: Point2
  pendingAttachGroupId: string | null
  attachCandidateGroupId: string | null
  attachCandidateSince: number | null
  attachCandidatePosition: Point2 | null
  attachArmedGroupId: string | null
  oscillatorStartedAt: number
  historyCaptured: boolean
  mergeIntent?: MergeIntent
}

interface ResizeGesture {
  kind: 'resize'
  cellId: string
  direction: Point2
  startProjection: number
  startWeight: number
  startRadius: number
  historyCaptured: boolean
}

interface GroupMemberGesture {
  kind: 'group-member'
  cellId: string
  groupId: string
  offset: Point2
  origin: Point2
  pendingDetach: boolean
  detachCandidateSince: number | null
  oscillatorStartedAt: number
  historyCaptured: boolean
  mergeIntent?: MergeIntent
}

interface GroupResizeGesture {
  kind: 'group-resize'
  groupId: string
  direction: Point2
  startProjection: number
  startWeight: number
  startRadius: number
  historyCaptured: boolean
}

interface MergeIntent {
  startedAt: number
  origin: Point2
  pointer: Point2
  moved: boolean
  candidateId: string | null
  candidateSince: number | null
  targetId: string | null
  splitTriggered: boolean
}

interface MergeGesture {
  kind: 'merge'
  cellId: string
  offset: Point2
  startedAt: number
  origin: Point2
  moved: boolean
  historyCaptured: boolean
  targetId: string | null
  splitTriggered: boolean
}

type Gesture =
  | MoveGesture
  | ResizeGesture
  | GroupMemberGesture
  | GroupResizeGesture
  | MergeGesture

interface InteractionState {
  mode: CanvasMode
  hoveredId: string | null
  selectedCellId: string | null
  selectedCellIds: string[]
  selectedGroupId: string | null
  editingId: string | null
  acquiringGroupId: string | null
  gesture: Gesture | null
  preview: PreviewCell | null
}

interface InteractionVisualEffect {
  cellJitterPx: number
  wallJitterPx: number
  frequencyHz: number
  phaseStartedAt: number
  phaseOffset: number
  tint: number
  grainBoost: number
}

interface ActiveGroupCue {
  kind: 'join' | 'detach'
  cellId: string
  groupId: string
  strength: number
  oscillatorStartedAt: number
  ghostSite: Point2
}

interface GroupGhostSlot {
  kind: 'join' | 'detach'
  groupId: string
  site: Point2
  strength: number
}

interface ItemData {
  kind: 'cell' | 'label' | 'handle' | 'group-handle' | 'group-wall'
  cellId?: string
  groupId?: string
  direction?: Point2
}

interface SeedRuntime {
  bornAt: number
  startWeight: number
  targetWeight: number
}

export interface EditorLayout {
  cellId: string
  x: number
  y: number
  width: number
  height: number
  polygonWidth: number
  fontSize: number
  points: Point2[]
  text: string
  textLayout: WrappedTextLayout
}

export interface EngineCallbacks {
  onEditRequested: (
    cellId: string,
    text: string,
    ghostPrompt: string,
    presentation: EditPresentation,
  ) => void
  onEditorLayout: (layout: EditorLayout) => void
  onEditorPointer: (point: Point2) => void
  onInlineEditingFinished: () => void
  onSelectionChanged: (
    selection: string | null,
    selectedCellIds: readonly string[],
  ) => void
  onModeChanged?: (mode: CanvasMode) => void
  onCanvasChanged?: (field: CanvasFieldBounds, animated: boolean) => void
  onHistoryChanged?: (canUndo: boolean, canRedo: boolean) => void
  onWallFrame?: (snapshot: WallRenderSnapshot) => void
  onCanonicalTextChanged?: (cellId: string, text: string) => void
}

export interface CanvasFieldBounds {
  width: number
  height: number
  center: Point2
  radius: number
}

export interface ViewportInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface WallRenderSnapshot {
  time: number
  width: number
  height: number
  field: { center: Point2; radius: number }
  cells: Array<{ id: string; points: Point2[]; grainBoost: number }>
  groups: Array<{ id: string; points: Point2[]; color: string; strokeBoost: number }>
}

export interface VoronoiDebugSnapshot {
  mode: CanvasMode
  cellCount: number
  previewId: string | null
  hoveredId: string | null
  selectedId: string | null
  selectedIds: string[]
  selectionMode: 'single' | 'multi'
  selectedGroupId: string | null
  editingId: string | null
  editingCaretIndex: number
  acquiringGroupId: string | null
  model: VoronoiDocument
  cells: Record<string, Point2[]>
  handles: Point2[]
  groupWalls: Record<string, Point2[]>
  groupWallEffects: Record<string, { strokeWidth: number }>
  breathScales: Record<string, { cell: number; text: number }>
  seedProgress: Record<string, number>
  incubationProgress: Record<string, number>
  groupContainers: Record<string, Point2[]>
  innerStrokes: Record<
    string,
    { closed: boolean; dashCount: number; strokeWidth: number; pointCount: number }
  >
  textRequirements: Record<string, { requiredArea: number; actualArea: number; fits: boolean }>
  textEffects: Record<
    string,
    { blur: number; scale: number; opacity: number; visible: boolean; incubationState: string }
  >
  textLayouts: Record<
    string,
    {
      engine: 'pretext' | 'fallback'
      lineCount: number
      variant: AdaptiveTextLevel
      content: string
    }
  >
  stickyBridges: number
  mergeCandidateId: string | null
  interactionEffects: Record<string, InteractionVisualEffect>
  groupCue: (ActiveGroupCue & { ghostStrength: number }) | null
  history: { undoDepth: number; redoDepth: number }
  gesture: {
    kind: string
    cellId?: string
    groupId?: string
    pendingDetach?: boolean
    attachCandidateGroupId?: string | null
    attachArmedGroupId?: string | null
  } | null
  blocked: boolean
  clusteringWave: boolean
  crowdingScale: number
  performance: {
    canvasNotifications: number
    resizeCount: number
    lastChecksum: number
    dynamic: boolean
    maxSettlingDelta: number
    maxSettlingCellId: string | null
  }
  field: { center: Point2; radius: number; outerRadius: number }
  settings: CanvasSettings
}

const SAMPLE_COUNT = 72
const GROUP_SAMPLE_COUNT = 80
const HANDLE_DIRECTIONS: Point2[] = [
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: -1 },
  { x: 0, y: 1 },
]

function distance(first: Point2, second: Point2) {
  return Math.hypot(second.x - first.x, second.y - first.y)
}

function nearestPointOnPolygon(point: Point2, polygon: readonly Point2[]) {
  let nearest = polygon[0] ?? point
  let nearestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]
    const end = polygon[(index + 1) % polygon.length]
    const dx = end.x - start.x
    const dy = end.y - start.y
    const lengthSquared = dx * dx + dy * dy
    const projection =
      lengthSquared > 0
        ? clamp(
            ((point.x - start.x) * dx + (point.y - start.y) * dy) /
              lengthSquared,
            0,
            1,
          )
        : 0
    const candidate = {
      x: start.x + dx * projection,
      y: start.y + dy * projection,
    }
    const candidateDistance = distance(point, candidate)
    if (candidateDistance < nearestDistance) {
      nearest = candidate
      nearestDistance = candidateDistance
    }
  }
  return { point: { ...nearest }, distance: nearestDistance }
}

function smoothstep(value: number) {
  const clamped = clamp(value, 0, 1)
  return clamped * clamped * (3 - 2 * clamped)
}

function springstep(value: number) {
  const clamped = clamp(value, 0, 1)
  return clamp(1 - Math.exp(-6 * clamped) * Math.cos(clamped * Math.PI * 2.4), 0, 1.08)
}

function ease(value: number, easing: 'smooth' | 'spring' | 'linear') {
  if (easing === 'spring') return springstep(value)
  if (easing === 'smooth') return smoothstep(value)
  return clamp(value, 0, 1)
}

export class VoronoiCanvasEngine {
  private readonly canvas: HTMLCanvasElement
  private readonly callbacks: EngineCallbacks
  private readonly scope: paper.PaperScope
  private readonly groupLayer: paper.Layer
  private readonly cellsLayer: paper.Layer
  private readonly relationshipLayer: paper.Layer
  private readonly labelsLayer: paper.Layer
  private readonly handlesLayer: paper.Layer
  private readonly fieldPath: paper.Path
  private readonly seamPath: paper.Path
  private readonly tool: paper.Tool
  private readonly visuals = new Map<string, CellVisual>()
  private readonly groupVisuals = new Map<string, GroupVisual>()
  private readonly handlePositions: Point2[] = []
  private readonly breathScales = new Map<string, number>()
  private readonly seedRuntime = new Map<string, SeedRuntime>()
  private readonly expiryHistoryCaptured = new Set<string>()
  private readonly groupInnerPolygons = new Map<string, Point2[]>()
  private readonly groupContainerPolygons = new Map<string, Point2[]>()
  private readonly groupSlotLayouts = new Map<string, GroupSlotLayout>()
  private readonly groupTextFloors = new Map<string, GroupTextFloor>()
  private readonly textWeightBoost = new Map<string, number>()
  private readonly interactionEffects = new Map<string, InteractionVisualEffect>()
  private activeGroupCue: ActiveGroupCue | null = null
  private groupGhostSlot: GroupGhostSlot | null = null
  private readonly textRequirementState = new Map<
    string,
    { requiredArea: number; actualArea: number; fits: boolean }
  >()
  private model = createDefaultDocument()
  private settings: CanvasSettings
  private state: InteractionState = {
    mode: 'add',
    hoveredId: null,
    selectedCellId: null,
    selectedCellIds: [],
    selectedGroupId: null,
    editingId: null,
    acquiringGroupId: null,
    gesture: null,
    preview: null,
  }
  private width = 1
  private height = 1
  private viewportInsets: ViewportInsets = {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  }
  private fieldCenter: Point2 = { x: 0, y: 0 }
  private fieldOuterRadius = 1
  private fieldRadius = 1
  private reducedMotion = false
  private autoGrowth = false
  private lastFrameTime = 0
  private nextSeedAt = Number.POSITIVE_INFINITY
  private randomState: number
  private previewSuppressedAt: Point2 | null = null
  private resizeObserver: ResizeObserver
  private destroyed = false
  private crowdingScale = 1
  private coordinateMapper: (point: Point2) => Point2 = (point) => point
  private lastCanvasChecksum = -1
  private sourceDirtyToken = 0
  private canvasNotificationCount = 0
  private resizeCount = 0
  private lastCanvasDynamic = false
  private stickyBridgeCount = 0
  private readonly history = new BoundedCommandHistory<string>((state) => state, 80)
  private blocked = false
  private suspended = false
  private touchMultiSelect = false
  private clusteringWave = false
  private editingDraftText: string | null = null
  private editingSelectionIndex = 0
  private editingPresentation: EditPresentation = 'focused'
  private readonly renderFrame = (event: { time: number }) => this.render(event.time)

  private readonly handleDoubleClick = (event: MouseEvent) => {
    if (this.blocked || this.state.editingId || this.state.mode !== 'select') return
    const hit = this.hitTest(this.eventPoint(event))
    if (hit?.cellId) {
      const cell = this.findCell(hit.cellId)
      if (!cell) return
      if (cell.kind === 'seed') {
        this.promoteSeed(cell.id)
      } else {
        this.startEditing(cell.id)
      }
    }
  }

  constructor(
    canvas: HTMLCanvasElement,
    callbacks: EngineCallbacks,
    settings: CanvasSettings,
  ) {
    this.canvas = canvas
    this.callbacks = callbacks
    this.settings = cloneSettings(settings)
    this.randomState = this.model.layout.seed >>> 0
    this.scope = new paper.PaperScope()
    this.scope.setup(canvas)
    new this.scope.Layer()
    this.fieldPath = new this.scope.Path.Circle({
      center: [0, 0],
      radius: 1,
      fillColor: this.settings.palette.interior,
    })
    this.seamPath = new this.scope.Path.Circle({
      center: [0, 0],
      radius: 1,
      fillColor: this.settings.palette.seam,
    })
    this.groupLayer = new this.scope.Layer()
    this.relationshipLayer = new this.scope.Layer()
    this.cellsLayer = new this.scope.Layer()
    this.labelsLayer = new this.scope.Layer()
    this.handlesLayer = new this.scope.Layer()
    this.tool = new this.scope.Tool()
    this.tool.minDistance = 0
    this.tool.onMouseMove = (event: paper.ToolEvent) => this.handleMouseMove(event)
    this.tool.onMouseDown = (event: paper.ToolEvent) => this.handleMouseDown(event)
    this.tool.onMouseDrag = (event: paper.ToolEvent) => this.handleMouseDrag(event)
    this.tool.onMouseUp = () => this.handleMouseUp()
    this.tool.activate()
    this.canvas.addEventListener('dblclick', this.handleDoubleClick)
    this.scope.view.onFrame = this.renderFrame
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas.parentElement ?? canvas)
    this.resize()
    this.updateCanvasState()
  }

  setMode(mode: CanvasMode) {
    if (this.blocked) return
    if (
      mode === 'merge' &&
      (!this.settings.mergeSplit.enabled || this.settings.mergeSplit.newSelect)
    ) {
      mode = 'select'
    }
    if (this.state.mode === mode) return
    this.state.mode = mode
    this.state.preview = null
    this.previewSuppressedAt = null
    this.state.hoveredId = null
    this.state.gesture = null
    this.state.acquiringGroupId = null
    if (mode === 'add') this.clearSelection()
    this.updateCanvasState()
  }

  setBlocked(blocked: boolean) {
    this.blocked = blocked
    if (blocked) {
      this.state.gesture = null
      this.state.preview = null
      this.state.hoveredId = null
    }
    this.canvas.dataset.blocked = String(blocked)
    this.canvas.style.cursor = blocked ? 'wait' : this.state.mode === 'add' ? 'crosshair' : 'default'
    this.sourceDirtyToken += 1
  }

  setClusteringWave(active: boolean) {
    this.clusteringWave = active
    this.canvas.dataset.clustering = String(active)
    this.sourceDirtyToken += 1
  }

  setSuspended(suspended: boolean) {
    if (this.suspended === suspended) return
    this.suspended = suspended
    this.scope.view.onFrame = suspended ? null : this.renderFrame
    this.canvas.dataset.suspended = String(suspended)
    if (!suspended) {
      this.sourceDirtyToken += 1
      this.scope.view.requestUpdate()
    }
  }

  setViewportInsets(insets: ViewportInsets) {
    if (
      this.viewportInsets.top === insets.top &&
      this.viewportInsets.right === insets.right &&
      this.viewportInsets.bottom === insets.bottom &&
      this.viewportInsets.left === insets.left
    ) {
      return
    }
    this.viewportInsets = { ...insets }
    this.groupSlotLayouts.clear()
    this.groupTextFloors.clear()
    this.updateFieldBounds()
    this.sourceDirtyToken += 1
    if (!this.suspended) this.scope.view.requestUpdate()
  }

  setTextVariants(
    cellId: string,
    sourceHash: string,
    metadata: AdaptiveTextVariantMetadata | undefined,
  ) {
    const cell = this.findCell(cellId)
    if (!cell || canonicalTextHash(cell.text) !== sourceHash) return false
    if (metadata) cell.textVariants = structuredClone(metadata)
    else delete cell.textVariants
    this.sourceDirtyToken += 1
    if (!this.suspended) this.scope.view.requestUpdate()
    return true
  }

  replaceDocument(serialized: string, command = 'list-edit') {
    const next = deserializeDocument(serialized)
    this.checkpoint(command)
    next.settings = cloneSettings(this.settings)
    next.layout.settingsVersion = this.settings.schemaVersion
    next.layout.history = {
      revision: this.model.layout.history.revision + 1,
      lastCommand: command,
    }
    this.model = next
    this.randomState = next.layout.seed >>> 0
    this.seedRuntime.clear()
    this.expiryHistoryCaptured.clear()
    this.groupSlotLayouts.clear()
    this.groupTextFloors.clear()
    this.clearSelection()
    this.sourceDirtyToken += 1
    this.notifyHistoryChanged()
  }

  applyClustering(cellIds: readonly string[], result: ClusteringResult) {
    if (cellIds.length !== result.assignments.length) return false
    this.checkpoint('autogroup')
    for (const cell of this.model.cells) delete cell.groupId
    this.model.groups = []
    this.groupSlotLayouts.clear()
    this.groupTextFloors.clear()
    const clusters = new Map<number, CellEntity[]>()
    for (const [index, cellId] of cellIds.entries()) {
      const cell = this.findCell(cellId)
      if (!cell || cell.kind !== 'journal') continue
      const assignment = result.assignments[index]
      const members = clusters.get(assignment) ?? []
      members.push(cell)
      clusters.set(assignment, members)
    }
    for (const [cluster, members] of [...clusters.entries()].sort((a, b) => a[0] - b[0])) {
      if (this.model.groups.length >= 8) break
      if (members.length < 2) continue
      const id = `group-${this.model.layout.nextGroupNumber}`
      this.model.layout.nextGroupNumber += 1
      const site = members.reduce(
        (sum, member) => ({
          x: sum.x + member.site.x / members.length,
          y: sum.y + member.site.y / members.length,
        }),
        { x: 0, y: 0 },
      )
      const title = reflectiveContentProvider.groupTitle(
        members.map((member) => ({ id: member.id, text: member.text })),
      )
      const group: GroupEntity = {
        id,
        memberIds: members.map((member) => member.id),
        wall: {
          gap: this.settings.group.wallGap,
          thickness: this.settings.group.wallThickness,
        },
        style: { tint: groupColorFor(this.settings, cluster + 1) },
        container: {
          site,
          weight: Math.max(0.018, members.length * 0.012),
        },
        title: title.text,
        provenance: {
          source: 'autogroup',
          algorithm: result.algorithm,
          algorithmVersion: result.algorithmVersion,
          provider: `${result.provider.id}@${result.provider.version}`,
          seed: result.seed,
          settings: {
            autoK: result.settings.autoK,
            minK: result.settings.minK,
            maxK: result.settings.maxK,
          },
        },
        order: cluster + 1,
      }
      for (const member of members) member.groupId = id
      this.model.groups.push(group)
    }
    this.model.layout.clustering = {
      runId: `cluster-${this.model.layout.history.revision + 1}-${result.seed}`,
      algorithm: result.algorithm,
      algorithmVersion: result.algorithmVersion,
      provider: result.provider.id,
      providerVersion: result.provider.version,
      seed: result.seed,
      k: result.k,
      score: result.score,
      settings: {
        autoK: result.settings.autoK,
        minK: result.settings.minK,
        maxK: result.settings.maxK,
      },
    }
    this.model.layout.history = {
      revision: this.model.layout.history.revision + 1,
      lastCommand: 'autogroup',
    }
    this.groupVisuals.forEach((visual) => visual.path.remove())
    this.groupVisuals.clear()
    this.clearSelection()
    this.sourceDirtyToken += 1
    this.notifyHistoryChanged()
    return true
  }

  groupSelectedCells() {
    const cells = this.state.selectedCellIds
      .map((id) => this.findCell(id))
      .filter(
        (cell): cell is CellEntity =>
          Boolean(cell && cell.kind === 'journal' && !cell.groupId),
      )
    if (cells.length < 2 || this.model.groups.length >= 8) return false
    this.checkpoint('group-selection')
    const group = this.createManualGroup(cells[0])
    if (!group) {
      this.history.discardLastCheckpoint()
      return false
    }
    for (const cell of cells) this.attachCellToGroup(cell, group)
    this.state.acquiringGroupId = null
    this.clearSelection()
    this.sourceDirtyToken += 1
    this.notifyHistoryChanged()
    this.updateCanvasState()
    return true
  }

  setSettings(settings: CanvasSettings) {
    const groupGeometryChanged =
      settings.group.wallGap !== this.settings.group.wallGap ||
      settings.group.wallThickness !== this.settings.group.wallThickness ||
      settings.geometry.seamGap !== this.settings.geometry.seamGap ||
      settings.geometry.outerGap !== this.settings.geometry.outerGap
    const seedExpiryChanged =
      settings.seed.expirySeconds !== this.settings.seed.expirySeconds
    this.settings = cloneSettings(settings)
    this.model.settings = cloneSettings(settings)
    if (groupGeometryChanged) {
      this.groupSlotLayouts.clear()
      this.groupTextFloors.clear()
    }
    for (const group of this.model.groups) {
      group.wall.gap = settings.group.wallGap
      group.wall.thickness = settings.group.wallThickness
      group.style.tint = groupColorFor(settings, group.order)
    }
    if (seedExpiryChanged) {
      for (const cell of this.model.cells) {
        if (cell.kind === 'seed' && cell.expiry.state === 'scheduled') {
          cell.expiry.timeoutMs = settings.seed.expirySeconds * 1000
        }
      }
    }
    this.updateFieldBounds()
    this.canvas.style.backgroundColor = this.settings.palette.exterior
    if (
      (!settings.mergeSplit.enabled || settings.mergeSplit.newSelect) &&
      this.state.mode === 'merge'
    ) {
      this.state.mode = 'select'
      this.state.gesture = null
    }
    this.sourceDirtyToken += 1
  }

  setCoordinateMapper(mapper: (point: Point2) => Point2) {
    this.coordinateMapper = mapper
  }

  getFieldBounds(): CanvasFieldBounds {
    return {
      width: this.width,
      height: this.height,
      center: { ...this.fieldCenter },
      radius: this.fieldOuterRadius,
    }
  }

  pointerTap(clientX: number, clientY: number) {
    if (this.blocked || this.state.editingId) return
    const raw = this.canvasPointFromClient(clientX, clientY)
    const point = this.coordinateMapper(raw)
    const paperPoint = new this.scope.Point(point.x, point.y)
    const hit = this.hitSeed(paperPoint) ?? this.hitTest(paperPoint)
    const cell = hit?.cellId ? this.findCell(hit.cellId) : undefined
    if (this.touchMultiSelect) {
      if (cell?.kind === 'journal') {
        this.toggleCellSelection(cell.id)
        this.updateCanvasState()
      } else {
        this.touchMultiSelect = false
        this.clearSelection()
      }
      return
    }
    if (
      this.state.mode === 'select' &&
      cell?.kind === 'journal' &&
      this.state.selectedCellId === cell.id &&
      this.state.selectedCellIds.length === 1
    ) {
      this.startEditing(cell.id)
      return
    }
    this.handleMouseDown(this.toolEventAt(raw))
    this.state.gesture = null
    this.updateCanvasState()
  }

  pointerHold(clientX: number, clientY: number) {
    if (this.blocked || this.state.editingId || this.state.mode !== 'select') return
    const raw = this.canvasPointFromClient(clientX, clientY)
    const point = this.coordinateMapper(raw)
    const hit = this.hitSeed(new this.scope.Point(point.x, point.y)) ?? this.hitTest(
      new this.scope.Point(point.x, point.y),
    )
    const cell = hit?.cellId ? this.findCell(hit.cellId) : undefined
    if (!cell || cell.kind !== 'journal') return
    this.touchMultiSelect = true
    if (!this.state.selectedCellIds.includes(cell.id)) {
      this.toggleCellSelection(cell.id)
    }
    this.state.gesture = null
    this.updateCanvasState()
  }

  pointerDragStart(clientX: number, clientY: number) {
    if (this.blocked || this.state.editingId) return
    this.handleMouseDown(this.toolEventAt(this.canvasPointFromClient(clientX, clientY)))
  }

  pointerDragMove(clientX: number, clientY: number) {
    if (this.blocked || this.state.editingId) return
    this.handleMouseDrag(this.toolEventAt(this.canvasPointFromClient(clientX, clientY)))
  }

  pointerDragEnd() {
    this.handleMouseUp()
  }

  pointerCancel() {
    const gesture = this.state.gesture
    const selectedCellId = gesture && 'cellId' in gesture ? gesture.cellId : null
    if (gesture && 'historyCaptured' in gesture && gesture.historyCaptured) {
      const checkpoint = this.history.discardLastCheckpoint()
      if (checkpoint) this.restoreHistory(checkpoint.state)
      if (selectedCellId && this.findCell(selectedCellId)) this.selectCell(selectedCellId)
      this.notifyHistoryChanged()
    }
    this.state.gesture = null
    this.activeGroupCue = null
    this.groupGhostSlot = null
    this.canvas.style.cursor = this.state.mode === 'add' ? 'crosshair' : 'default'
    this.updateCanvasState()
  }

  finishTouchMultiSelect() {
    this.touchMultiSelect = false
    const primary = this.state.selectedCellIds[0] ?? null
    this.state.selectedCellId = primary
    this.state.selectedCellIds = primary ? [primary] : []
    this.notifySelectionChanged()
    this.updateCanvasState()
  }

  editSelectedCell() {
    const cellId = this.state.selectedCellId
    if (!cellId || this.state.selectedCellIds.length !== 1) return false
    const cell = this.findCell(cellId)
    if (!cell || cell.kind !== 'journal') return false
    this.startEditing(cellId)
    return true
  }

  recommendedSplitCount() {
    const cell = this.state.selectedCellId
      ? this.findCell(this.state.selectedCellId)
      : undefined
    if (!cell || cell.kind !== 'journal') return null
    return clamp(
      Math.round(cell.text.trim().split(/\s+/).filter(Boolean).length / 4),
      2,
      4,
    )
  }

  splitSelectedCell(count: number) {
    const cellId = this.state.selectedCellId
    if (!cellId || this.state.selectedCellIds.length !== 1) return false
    const before = this.model.cells.length
    this.splitCell(cellId, clamp(Math.round(count), 2, 4))
    return this.model.cells.length !== before
  }

  mergeSelectedWithNearest() {
    const source = this.state.selectedCellId
      ? this.findCell(this.state.selectedCellId)
      : undefined
    if (!source || source.kind !== 'journal') return false
    const target = this.model.cells
      .filter(
        (candidate) =>
          candidate.id !== source.id &&
          candidate.kind === 'journal' &&
          candidate.groupId === source.groupId,
      )
      .sort(
        (first, second) =>
          distance(first.site, source.site) - distance(second.site, source.site) ||
          first.id.localeCompare(second.id),
      )[0]
    if (!target) return false
    this.mergeCells(source.id, target.id)
    return true
  }

  setAutoGrowth(enabled: boolean) {
    this.autoGrowth = enabled
    this.nextSeedAt = enabled ? this.lastFrameTime + this.nextSeedDelay() / 1000 : Number.POSITIVE_INFINITY
    if (!enabled) {
      for (const cell of this.model.cells) {
        if (cell.incubation.state === 'empty') cell.incubation.restStartedAtMs = undefined
      }
    }
    this.updateCanvasState()
  }

  setReducedMotion(reduced: boolean) {
    this.reducedMotion = reduced
  }

  undo() {
    if (this.blocked) return false
    const previous = this.history.undo(
      serializeDocument(this.model),
      'undo',
      this.model.layout.history.revision,
    )
    if (!previous) return false
    this.restoreHistory(previous)
    this.notifyHistoryChanged()
    return true
  }

  redo() {
    if (this.blocked) return false
    const next = this.history.redo(
      serializeDocument(this.model),
      'redo',
      this.model.layout.history.revision,
    )
    if (!next) return false
    this.restoreHistory(next)
    this.notifyHistoryChanged()
    return true
  }

  handleKey(key: string) {
    if (this.blocked) return
    if (key === 'Escape') {
      if (this.state.acquiringGroupId) {
        this.state.acquiringGroupId = null
      } else {
        this.clearSelection()
      }
      this.updateCanvasState()
      return
    }
    if (
      this.state.mode === 'select' &&
      !this.state.editingId &&
      (key === 'ArrowLeft' ||
        key === 'ArrowRight' ||
        key === 'ArrowUp' ||
        key === 'ArrowDown')
    ) {
      const ordered = this.model.layout.zOrder.filter((id) => {
        const cell = this.findCell(id)
        return cell?.kind === 'journal'
      })
      if (!ordered.length) return
      const currentIndex = this.state.selectedCellId
        ? ordered.indexOf(this.state.selectedCellId)
        : -1
      const backwards = key === 'ArrowLeft' || key === 'ArrowUp'
      const nextIndex =
        currentIndex < 0
          ? 0
          : (currentIndex + (backwards ? -1 : 1) + ordered.length) %
            ordered.length
      this.selectCell(ordered[nextIndex])
      this.updateCanvasState()
      return
    }
    if (
      key === ' ' &&
      this.state.mode === 'select' &&
      this.state.selectedCellId &&
      !this.state.editingId
    ) {
      this.touchMultiSelect = true
      this.toggleCellSelection(this.state.selectedCellId)
      this.updateCanvasState()
      return
    }
    if (
      (key === 'Delete' || key === 'Backspace') &&
      this.state.mode === 'select' &&
      this.state.selectedCellId &&
      !this.state.editingId
    ) {
      this.deleteCell(this.state.selectedCellId)
    }
  }

  startEditing(cellId: string, presentation: EditPresentation = 'focused') {
    if (this.blocked) return
    const cell = this.findCell(cellId)
    if (!cell || cell.kind === 'seed') return
    if (this.state.mode !== 'select') {
      this.state.mode = 'select'
      this.callbacks.onModeChanged?.('select')
    }
    this.state.editingId = cellId
    this.editingDraftText = cell.text
    this.editingSelectionIndex = cell.text.length
    this.editingPresentation = presentation
    this.state.gesture = null
    this.selectCell(cellId)
    this.state.hoveredId = null
    this.callbacks.onEditRequested(
      cellId,
      cell.text,
      reflectiveContentProvider.manualGhostPrompt(cell.creation.order),
      presentation,
    )
    if (presentation === 'inline') this.canvas.style.cursor = 'default'
    this.updateCanvasState()
  }

  finishEditing(cellId: string, text: string) {
    const cell = this.findCell(cellId)
    if (cell) {
      const nextText = text.trim()
      const changed = nextText !== cell.text
      if (changed) this.checkpoint('text-edit')
      cell.text = nextText
      if (changed) delete cell.textVariants
      if (changed || cell.contentProvenance.operation !== 'manual') {
        cell.contentProvenance = {
          provider: reflectiveContentProvider.id,
          operation: 'manual',
          sourceIds: [],
          themes: [],
          tensions: [],
          horizon: 'today',
        }
      }
      cell.incubation = cell.text
        ? { state: 'revealed', sourceIds: [] }
        : { state: 'empty', sourceIds: [], restStartedAtMs: this.lastFrameTime * 1000 }
      if (!cell.text) enforceSingleEmptyCell(this.model, cell.id)
      if (changed) this.callbacks.onCanonicalTextChanged?.(cell.id, cell.text)
    }
    this.state.editingId = null
    this.editingDraftText = null
    this.editingSelectionIndex = 0
    this.updateCanvasState()
  }

  cancelEditing() {
    this.state.editingId = null
    this.editingDraftText = null
    this.editingSelectionIndex = 0
    this.updateCanvasState()
  }

  updateEditingDraft(cellId: string, text: string) {
    if (this.state.editingId !== cellId) return
    this.editingDraftText = text
    this.editingSelectionIndex = Math.min(this.editingSelectionIndex, text.length)
    this.sourceDirtyToken += 1
    this.updateCanvasState()
  }

  updateEditingSelection(cellId: string, selectionIndex: number) {
    if (this.state.editingId !== cellId) return
    this.editingSelectionIndex = clamp(
      Math.round(selectionIndex),
      0,
      this.editingDraftText?.length ?? 0,
    )
    this.sourceDirtyToken += 1
    this.updateCanvasState()
  }

  startEmptySingletonEditing() {
    const cells = this.model.cells.filter((cell) => cell.kind === 'journal')
    if (
      this.blocked ||
      this.state.editingId ||
      cells.length !== 1 ||
      cells[0].text.trim()
    ) {
      return false
    }
    this.startEditing(cells[0].id, 'inline')
    return true
  }

  serialize() {
    return serializeDocument(this.model)
  }

  load(serialized: string) {
    this.model = deserializeDocument(serialized)
    this.settings = cloneSettings(this.model.settings)
    this.randomState = this.model.layout.seed >>> 0
    this.seedRuntime.clear()
    this.expiryHistoryCaptured.clear()
    this.groupSlotLayouts.clear()
    this.groupTextFloors.clear()
    this.history.clear()
    this.editingDraftText = null
    this.editingSelectionIndex = 0
    this.clearSelection()
    this.notifyHistoryChanged()
  }

  forceSpawnSeed() {
    if (this.blocked) return false
    const priorHistory = { ...this.model.layout.history }
    this.checkpoint('add-seed')
    const spawned = this.spawnSeed(this.lastFrameTime || 0)
    if (!spawned) {
      this.history.discardLastCheckpoint()
      this.model.layout.history = priorHistory
    }
    this.notifyHistoryChanged()
    return spawned
  }

  addCellAtCentroid() {
    if (this.blocked || this.state.mode !== 'add') return false
    const angle = this.random() * Math.PI * 2
    const radius = 0.025 + this.random() * 0.055
    const point = this.pixelFromSite({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    })
    const cellId = this.placeEmptyCell(point, 'add-cell-at-centroid')
    if (cellId) this.startEditing(cellId, 'inline')
    return Boolean(cellId)
  }

  forceExpireFirstSeed() {
    if (this.blocked) return false
    const seed = this.model.cells
      .filter(
        (cell) =>
          cell.kind === 'seed' &&
          !cell.creation.promoted &&
          cell.expiry.state !== 'shrinking',
      )
      .sort(
        (a, b) =>
          (a.expiry.createdAtMs ?? Number.POSITIVE_INFINITY) -
          (b.expiry.createdAtMs ?? Number.POSITIVE_INFINITY),
      )[0]
    if (!seed) return false
    this.checkpoint('expire-seed')
    seed.expiry.state = 'shrinking'
    seed.expiry.shrinkStartedAtMs = Date.now()
    this.expiryHistoryCaptured.add(seed.id)
    this.sourceDirtyToken += 1
    return true
  }

  private checkpoint(command = 'edit') {
    const snapshot = serializeDocument(this.model)
    this.history.checkpoint(snapshot, command, this.model.layout.history.revision)
    this.model.layout.history = {
      revision: this.model.layout.history.revision + 1,
      lastCommand: command,
    }
    this.notifyHistoryChanged()
  }

  private restoreHistory(serialized: string) {
    const restored = deserializeDocument(serialized)
    restored.settings = cloneSettings(this.settings)
    restored.layout.settingsVersion = this.settings.schemaVersion
    this.model = restored
    this.randomState = restored.layout.seed >>> 0
    this.seedRuntime.clear()
    this.expiryHistoryCaptured.clear()
    this.groupSlotLayouts.clear()
    this.groupTextFloors.clear()
    this.state.gesture = null
    this.state.preview = null
    this.clearSelection()
    this.sourceDirtyToken += 1
  }

  private notifyHistoryChanged() {
    this.callbacks.onHistoryChanged?.(this.history.canUndo, this.history.canRedo)
  }

  getSnapshot(): VoronoiDebugSnapshot {
    return {
      mode: this.state.mode,
      cellCount: this.model.cells.length,
      previewId: this.state.preview?.id ?? null,
      hoveredId: this.state.hoveredId,
      selectedId: this.state.selectedCellId,
      selectedIds: [...this.state.selectedCellIds],
      selectionMode: this.touchMultiSelect ? 'multi' : 'single',
      selectedGroupId: this.state.selectedGroupId,
      editingId: this.state.editingId,
      editingCaretIndex: this.editingSelectionIndex,
      acquiringGroupId: this.state.acquiringGroupId,
      model: cloneDocument(this.model),
      cells: Object.fromEntries(
        [...this.visuals.entries()]
          .filter(([, visual]) => !visual.preview)
          .map(([id, visual]) => [id, visual.currentPoints.map((point) => ({ ...point }))]),
      ),
      handles: this.handlePositions.map((point) => ({ ...point })),
      groupWalls: Object.fromEntries(
        [...this.groupVisuals.entries()].map(([id, visual]) => [
          id,
          visual.currentPoints.map((point) => ({ ...point })),
        ]),
      ),
      groupWallEffects: Object.fromEntries(
        [...this.groupVisuals.entries()].map(([id, visual]) => [
          id,
          { strokeWidth: visual.path.strokeWidth },
        ]),
      ),
      breathScales: Object.fromEntries(
        [...this.breathScales.entries()].map(([id, scale]) => [
          id,
          { cell: scale, text: 1 },
        ]),
      ),
      seedProgress: Object.fromEntries(
        [...this.seedRuntime.entries()].map(([id, runtime]) => [
          id,
          clamp(
            ((this.lastFrameTime - runtime.bornAt) * 1000) / Math.max(1, this.settings.seed.growthMs),
            0,
            1,
          ),
        ]),
      ),
      incubationProgress: Object.fromEntries(
        this.model.cells.map((cell) => [
          cell.id,
          cell.incubation.state === 'incubating' && cell.incubation.startedAtMs !== undefined
            ? clamp(
                (this.lastFrameTime * 1000 - cell.incubation.startedAtMs) /
                  Math.max(1, this.settings.seed.incubationGrowthMs),
                0,
                1,
              )
            : cell.incubation.state === 'revealed'
              ? 1
              : 0,
        ]),
      ),
      groupContainers: Object.fromEntries(
        [...this.groupContainerPolygons.entries()].map(([id, points]) => [
          id,
          points.map((point) => ({ ...point })),
        ]),
      ),
      innerStrokes: Object.fromEntries(
        [...this.visuals.entries()].map(([id, visual]) => [
          id,
          {
            closed: visual.innerPath.closed,
            dashCount: visual.innerPath.dashArray.length,
            strokeWidth: visual.innerPath.strokeWidth,
            pointCount: visual.innerPath.segments.length,
          },
        ]),
      ),
      textRequirements: Object.fromEntries(this.textRequirementState),
      textEffects: Object.fromEntries(
        [...this.visuals.entries()].map(([id, visual]) => [
          id,
          {
            blur: visual.label.shadowBlur,
            scale: visual.textEffectScale,
            opacity: visual.label.opacity,
            visible: visual.label.visible,
            incubationState: this.findCell(id)?.incubation.state ?? 'preview',
          },
        ]),
      ),
      textLayouts: Object.fromEntries(
        [...this.visuals.entries()].map(([id, visual]) => [
          id,
          {
            engine: visual.textLayoutEngine,
            lineCount: visual.lineLabels.length,
            variant: visual.displayVariant,
            content: visual.lineLabels.map((line) => line.content).join(' '),
          },
        ]),
      ),
      stickyBridges: this.stickyBridgeCount,
      mergeCandidateId:
        this.state.gesture?.kind === 'merge'
          ? this.state.gesture.targetId
          : this.state.gesture
            ? this.mergeIntentFor(this.state.gesture)?.targetId ?? null
            : null,
      interactionEffects: Object.fromEntries(
        [...this.interactionEffects.entries()].map(([id, effect]) => [
          id,
          { ...effect },
        ]),
      ),
      groupCue: this.activeGroupCue
        ? {
            ...this.activeGroupCue,
            ghostSite: { ...this.activeGroupCue.ghostSite },
            ghostStrength: this.groupGhostSlot?.strength ?? 0,
          }
        : null,
      history: this.history.depths,
      gesture: this.state.gesture
        ? {
            kind: this.state.gesture.kind,
            ...('cellId' in this.state.gesture
              ? { cellId: this.state.gesture.cellId }
              : { groupId: this.state.gesture.groupId }),
            ...('pendingDetach' in this.state.gesture
              ? { pendingDetach: this.state.gesture.pendingDetach }
              : {}),
            ...(this.state.gesture.kind === 'move'
              ? {
                  attachCandidateGroupId:
                    this.state.gesture.attachCandidateGroupId,
                  attachArmedGroupId: this.state.gesture.attachArmedGroupId,
                }
              : {}),
          }
        : null,
      blocked: this.blocked,
      clusteringWave: this.clusteringWave,
      crowdingScale: this.crowdingScale,
      performance: {
        canvasNotifications: this.canvasNotificationCount,
        resizeCount: this.resizeCount,
        lastChecksum: this.lastCanvasChecksum,
        dynamic: this.lastCanvasDynamic,
        maxSettlingDelta: Math.max(
          0,
          ...[...this.visuals.values()].flatMap((visual) =>
            visual.currentPoints.map((point, index) =>
              distance(point, visual.targetPoints[index] ?? point),
            ),
          ),
        ),
        maxSettlingCellId:
          [...this.visuals.entries()]
            .map(([id, visual]) => ({
              id,
              delta: Math.max(
                0,
                ...visual.currentPoints.map((point, index) =>
                  distance(point, visual.targetPoints[index] ?? point),
                ),
              ),
            }))
            .sort((first, second) => second.delta - first.delta)[0]?.id ?? null,
      },
      field: {
        center: { ...this.fieldCenter },
        radius: this.fieldRadius,
        outerRadius: this.fieldOuterRadius,
      },
      settings: cloneSettings(this.settings),
    }
  }

  destroy() {
    this.destroyed = true
    this.resizeObserver.disconnect()
    this.canvas.removeEventListener('dblclick', this.handleDoubleClick)
    this.scope.view.onFrame = null
    this.tool.remove()
    this.scope.project.remove()
  }

  private resize() {
    this.resizeCount += 1
    const bounds = (this.canvas.parentElement ?? this.canvas).getBoundingClientRect()
    const width = Math.max(1, Math.round(bounds.width))
    const height = Math.max(1, Math.round(bounds.height))
    if (width !== this.width || height !== this.height) {
      this.groupSlotLayouts.clear()
      this.groupTextFloors.clear()
    }
    this.width = width
    this.height = height
    this.canvas.style.width = `${this.width}px`
    this.canvas.style.height = `${this.height}px`
    this.scope.view.viewSize = new this.scope.Size(this.width, this.height)
    this.updateFieldBounds()
    this.sourceDirtyToken += 1
  }

  private updateFieldBounds() {
    const usableWidth = Math.max(
      1,
      this.width - this.viewportInsets.left - this.viewportInsets.right,
    )
    const usableHeight = Math.max(
      1,
      this.height - this.viewportInsets.top - this.viewportInsets.bottom,
    )
    this.fieldCenter = {
      x:
        this.viewportInsets.left +
        usableWidth * this.model.layout.circle.center.x,
      y:
        this.viewportInsets.top +
        usableHeight * this.model.layout.circle.center.y,
    }
    this.fieldOuterRadius =
      Math.min(usableWidth, usableHeight) * this.model.layout.circle.radius
    this.fieldRadius = Math.max(40, this.fieldOuterRadius - this.settings.geometry.outerGap)
  }

  private canvasPointFromClient(clientX: number, clientY: number) {
    const bounds = this.canvas.getBoundingClientRect()
    return {
      x: ((clientX - bounds.left) / bounds.width) * this.width,
      y: ((clientY - bounds.top) / bounds.height) * this.height,
    }
  }

  private toolEventAt(point: Point2) {
    return {
      point: new this.scope.Point(point.x, point.y),
      modifiers: { shift: false },
    } as paper.ToolEvent
  }

  private eventPoint(event: MouseEvent) {
    const mapped = this.coordinateMapper(
      this.canvasPointFromClient(event.clientX, event.clientY),
    )
    return new this.scope.Point(mapped.x, mapped.y)
  }

  private pixelFromSite(site: Point2): Point2 {
    return {
      x: this.fieldCenter.x + site.x * this.fieldRadius,
      y: this.fieldCenter.y + site.y * this.fieldRadius,
    }
  }

  private normalizedFromPixel(point: Point2): Point2 {
    return {
      x: (point.x - this.fieldCenter.x) / this.fieldRadius,
      y: (point.y - this.fieldCenter.y) / this.fieldRadius,
    }
  }

  private minimumWeightForText(text: string) {
    if (!text.trim()) return 0
    const requirement = measureTextRequirement(
      text,
      this.settings.geometry.textInset,
      10,
    )
    const fieldArea = Math.max(1, Math.PI * this.fieldRadius * this.fieldRadius)
    return clamp((requirement.area / fieldArea) + 0.004, 0.006, 0.12)
  }

  private displayTextForCell(cell: CellEntity | PreviewCell) {
    return this.state.editingId === cell.id && this.editingDraftText !== null
      ? this.editingDraftText
      : cell.text
  }

  private minimumDisplayTextForCell(cell: CellEntity | PreviewCell) {
    const canonical = this.displayTextForCell(cell)
    if (
      !this.settings.adaptiveText.enabled ||
      this.state.editingId === cell.id ||
      cell.kind === 'seed' ||
      'preview' in cell ||
      cell.textVariants?.sourceHash !== canonicalTextHash(canonical)
    ) {
      return canonical
    }
    return textVariantsForDisplay(canonical, cell.textVariants).XXS
  }

  private currentTextWeightFloor(cell: CellEntity) {
    const text = this.minimumDisplayTextForCell(cell)
    if (!text.trim()) return 0
    const requirement = measureTextRequirement(
      text,
      this.settings.geometry.textInset,
      10,
    )
    const fieldArea = Math.max(1, Math.PI * this.fieldRadius * this.fieldRadius)
    return (
      (requirement.area * this.crowdingScale) / fieldArea +
      0.004 +
      (this.textWeightBoost.get(cell.id) ?? 0)
    )
  }

  private handleMouseMove(event: paper.ToolEvent) {
    if (this.blocked) return
    const mapped = this.coordinateMapper({ x: event.point.x, y: event.point.y })
    const point = { x: mapped.x, y: mapped.y }
    const paperPoint = new this.scope.Point(mapped.x, mapped.y)
    const hit = this.hitSeed(paperPoint) ?? this.hitTest(paperPoint)
    if (this.state.editingId) {
      if (this.editingPresentation === 'inline') {
        this.canvas.style.cursor =
          hit?.cellId === this.state.editingId
            ? 'text'
            : hit?.cellId
              ? 'pointer'
              : 'default'
      }
      return
    }
    const interactedCell = hit?.cellId ? this.findCell(hit.cellId) : undefined
    if (this.state.mode === 'add') {
      this.state.hoveredId = hit?.cellId ?? null
      const hoveredCell = interactedCell
      if (hoveredCell?.kind === 'seed') {
        this.state.preview = null
      } else if (
        this.previewSuppressedAt &&
        distance(point, this.previewSuppressedAt) < Math.max(12, this.fieldRadius * 0.025)
      ) {
        this.state.preview = null
      } else {
        this.previewSuppressedAt = null
        this.state.preview = this.makePreview(point)
      }
      this.canvas.style.cursor = hoveredCell?.kind === 'seed' ? 'pointer' : 'crosshair'
    } else {
      this.state.preview = null
      this.state.hoveredId = hit?.cellId ?? null
      this.canvas.style.cursor =
        hit?.kind === 'handle' || hit?.kind === 'group-handle'
          ? this.resizeCursor(hit.direction)
          : hit?.kind === 'group-wall' || hit?.cellId
            ? 'pointer'
            : 'default'
    }
    this.updateCanvasState()
  }

  private handleMouseDown(event: paper.ToolEvent) {
    if (this.blocked) return
    const mapped = this.coordinateMapper({ x: event.point.x, y: event.point.y })
    const point = { x: mapped.x, y: mapped.y }
    const paperPoint = new this.scope.Point(mapped.x, mapped.y)
    const hit = this.hitSeed(paperPoint) ?? this.hitTest(paperPoint)
    if (this.state.editingId) {
      if (this.editingPresentation !== 'inline') return
      if (hit?.cellId === this.state.editingId) {
        this.callbacks.onEditorPointer(point)
        return
      }
      this.finishEditing(
        this.state.editingId,
        this.editingDraftText ?? this.findCell(this.state.editingId)?.text ?? '',
      )
      this.callbacks.onInlineEditingFinished()
    }
    const hitCell = hit?.cellId ? this.findCell(hit.cellId) : undefined
    if (hitCell?.kind === 'seed') {
      this.promoteSeed(hitCell.id)
      return
    }

    if (this.state.mode === 'add') {
      const cellId = this.placeEmptyCell(point, 'add-cell')
      if (cellId) this.startEditing(cellId, 'inline')
      return
    }

    if (this.state.mode === 'group') {
      if (hitCell) this.absorbIntoGroup(hitCell)
      return
    }

    if (this.state.mode === 'merge') {
      if (
        !this.settings.mergeSplit.enabled ||
        !hitCell
      ) {
        this.clearSelection()
        return
      }
      this.selectCell(hitCell.id)
      const pixel = this.pixelFromSite(hitCell.site)
      this.state.gesture = {
        kind: 'merge',
        cellId: hitCell.id,
        offset: { x: point.x - pixel.x, y: point.y - pixel.y },
        startedAt: this.lastFrameTime,
        origin: { ...hitCell.site },
        moved: false,
        historyCaptured: false,
        targetId: null,
        splitTriggered: false,
      }
      this.canvas.style.cursor = 'grabbing'
      return
    }

    if (hit?.kind === 'group-handle' && hit.groupId && hit.direction) {
      const group = this.model.groups.find((candidate) => candidate.id === hit.groupId)
      const visual = this.groupVisuals.get(hit.groupId)
      if (!group || !visual) return
      this.selectGroup(group.id)
      const center = polygonCentroid(visual.currentPoints)
      const edgePoint = rayPolygonIntersection(center, hit.direction, visual.currentPoints)
      this.state.gesture = {
        kind: 'group-resize',
        groupId: group.id,
        direction: hit.direction,
        startProjection: point.x * hit.direction.x + point.y * hit.direction.y,
        startWeight: group.container.weight,
        startRadius: Math.max(28, distance(center, edgePoint)),
        historyCaptured: false,
      }
      return
    }

    const wallHit = this.hitGroupWall(paperPoint)
    if (wallHit?.groupId) {
      const memberPolygon =
        hitCell?.groupId === wallHit.groupId
          ? this.visuals.get(hitCell.id)?.currentPoints
          : undefined
      const memberIsIntentional =
        Boolean(memberPolygon?.length) &&
        pointInPolygon(point, memberPolygon!) &&
        distanceToPolygonEdges(point, memberPolygon!) > 4
      // The wall wins against top-level cells behind it, while a deliberate
      // click inside a member wins against the wall's soft outer stroke.
      if (!memberIsIntentional) {
        this.selectGroup(wallHit.groupId)
        return
      }
    }
    if (!hit || !hitCell) {
      this.clearSelection()
      return
    }

    if (event.modifiers.shift && !hitCell.groupId) {
      this.toggleCellSelection(hitCell.id)
      this.state.gesture = null
      this.updateCanvasState()
      return
    }

    if (hit.kind === 'handle' && hit.direction) {
      this.selectCell(hitCell.id)
      const visual = this.visuals.get(hitCell.id)
      if (!visual) return
      const center = polygonCentroid(visual.currentPoints)
      const edgePoint = rayPolygonIntersection(center, hit.direction, visual.currentPoints)
      this.state.gesture = {
        kind: 'resize',
        cellId: hitCell.id,
        direction: hit.direction,
        startProjection: point.x * hit.direction.x + point.y * hit.direction.y,
        startWeight: Math.max(hitCell.weight, this.currentTextWeightFloor(hitCell)),
        startRadius: Math.max(24, distance(center, edgePoint)),
        historyCaptured: false,
      }
    } else if (hitCell.groupId) {
      this.selectCell(hitCell.id)
      const pixel = this.pixelFromSite(hitCell.site)
      this.state.gesture = {
        kind: 'group-member',
        cellId: hitCell.id,
        groupId: hitCell.groupId,
        offset: { x: point.x - pixel.x, y: point.y - pixel.y },
        origin: { ...hitCell.site },
        pendingDetach: false,
        detachCandidateSince: null,
        oscillatorStartedAt: this.lastFrameTime,
        historyCaptured: false,
        mergeIntent: this.makeNewSelectMergeIntent(hitCell),
      }
    } else {
      this.selectCell(hitCell.id)
      const pixel = this.pixelFromSite(hitCell.site)
      this.state.gesture = {
        kind: 'move',
        cellId: hitCell.id,
        offset: { x: point.x - pixel.x, y: point.y - pixel.y },
        pendingAttachGroupId: null,
        attachCandidateGroupId: null,
        attachCandidateSince: null,
        attachCandidatePosition: null,
        attachArmedGroupId: null,
        oscillatorStartedAt: this.lastFrameTime,
        historyCaptured: false,
        mergeIntent: this.makeNewSelectMergeIntent(hitCell),
      }
    }
  }

  private handleMouseDrag(event: paper.ToolEvent) {
    if (this.blocked) return
    const gesture = this.state.gesture
    if (!gesture || this.state.editingId) return
    const point = this.coordinateMapper({ x: event.point.x, y: event.point.y })
    if (gesture.kind === 'group-resize') {
      const group = this.model.groups.find((candidate) => candidate.id === gesture.groupId)
      if (!group) return
      if (!gesture.historyCaptured) {
        this.checkpoint('resize-group')
        gesture.historyCaptured = true
      }
      const projection =
        point.x * gesture.direction.x + point.y * gesture.direction.y
      const radialChange = projection - gesture.startProjection
      group.container.weight = clamp(
        gesture.startWeight +
          ((2 * gesture.startRadius * radialChange + radialChange * radialChange) /
            (this.fieldRadius * this.fieldRadius)) *
            0.72,
        0.012,
        0.2,
      )
      group.container.preferredWeight = group.container.weight
      this.groupSlotLayouts.delete(group.id)
      this.groupTextFloors.delete(group.id)
      return
    }
    const cell = this.findCell(gesture.cellId)
    if (!cell) return
    if (!gesture.historyCaptured) {
      this.checkpoint(
        gesture.kind === 'resize'
          ? 'resize-cell'
          : gesture.kind === 'group-member'
            ? 'move-group-member'
            : gesture.kind === 'merge'
              ? 'merge-drag'
              : 'move-cell',
      )
      gesture.historyCaptured = true
    }

    if (gesture.kind === 'resize') {
      const projection =
        point.x * gesture.direction.x + point.y * gesture.direction.y
      const radialChange = projection - gesture.startProjection
      cell.weight = clamp(
        gesture.startWeight +
          ((2 * gesture.startRadius * radialChange + radialChange * radialChange) /
            (this.fieldRadius * this.fieldRadius)) *
            0.7,
        -0.03,
        0.12,
      )
      return
    }

    const normalized = this.normalizedFromPixel({
      x: point.x - gesture.offset.x,
      y: point.y - gesture.offset.y,
    })
    const radius = Math.hypot(normalized.x, normalized.y)
    if (radius > 0.96) {
      normalized.x *= 0.96 / radius
      normalized.y *= 0.96 / radius
    }
    cell.site = normalized
    if (gesture.kind === 'move' || gesture.kind === 'group-member') {
      this.updateNewSelectMergeIntent(gesture, cell, point)
    }

    if (gesture.kind === 'merge') {
      gesture.moved =
        gesture.moved ||
        distance(this.pixelFromSite(gesture.origin), this.pixelFromSite(cell.site)) > 4
      const threshold = this.settings.mergeSplit.mergeDistancePx / Math.max(1, this.fieldRadius)
      const target = this.model.cells
        .filter(
          (candidate) =>
            candidate.id !== cell.id &&
            candidate.kind === 'journal' &&
            candidate.groupId === cell.groupId &&
            distance(candidate.site, cell.site) <= threshold,
        )
        .sort(
          (first, second) =>
            distance(first.site, cell.site) - distance(second.site, cell.site) ||
            first.id.localeCompare(second.id),
        )[0]
      gesture.targetId = target?.id ?? null
      return
    }

    if (gesture.kind === 'move' && !cell.groupId) {
      const nearbyGroupId = this.findNearbyGroupWall(cell)
      gesture.pendingAttachGroupId = this.findAttachableGroup(cell)
      const candidatePosition = this.pixelFromSite(cell.site)
      if (nearbyGroupId !== gesture.attachCandidateGroupId) {
        gesture.attachCandidateGroupId = nearbyGroupId
        gesture.attachCandidateSince = nearbyGroupId ? this.lastFrameTime * 1000 : null
        gesture.attachCandidatePosition = nearbyGroupId ? candidatePosition : null
        gesture.attachArmedGroupId = null
      } else if (
        nearbyGroupId &&
        gesture.attachCandidatePosition &&
        distance(candidatePosition, gesture.attachCandidatePosition) >
          Math.max(3, this.settings.group.attachDistancePx * 0.12)
      ) {
        // "Drag and hold" starts only after the pointer settles near one
        // wall location. Time spent traversing the sticky zone is not dwell.
        gesture.attachCandidateSince = this.lastFrameTime * 1000
        gesture.attachCandidatePosition = candidatePosition
        gesture.attachArmedGroupId = null
      }
      this.updateGroupAttachDwell(this.lastFrameTime * 1000)
    }

    if (gesture.kind === 'group-member') {
      const group = this.model.groups.find((candidate) => candidate.id === gesture.groupId)
      if (!group) return
      this.updateGroupDetachDwell(this.lastFrameTime * 1000)
      const otherMembers = group.memberIds
        .filter((id) => id !== cell.id)
        .map((id) => this.findCell(id))
        .filter((candidate): candidate is CellEntity => Boolean(candidate))
      const nearest = otherMembers
        .map((member) => ({ member, distance: distance(member.site, cell.site) }))
        .sort((first, second) => first.distance - second.distance)[0]
      if (nearest && nearest.distance < 0.34 && !gesture.mergeIntent) {
        nearest.member.site.x += (gesture.origin.x - nearest.member.site.x) * 0.12
        nearest.member.site.y += (gesture.origin.y - nearest.member.site.y) * 0.12
      }
      group.memberIds.sort((firstId, secondId) => {
        const first = this.findCell(firstId)?.site ?? { x: 0, y: 0 }
        const second = this.findCell(secondId)?.site ?? { x: 0, y: 0 }
        return first.x - second.x || first.y - second.y
      })
    }
  }

  private handleMouseUp() {
    if (this.blocked) return
    const gesture = this.state.gesture
    const mergeIntent = gesture ? this.mergeIntentFor(gesture) : undefined
    if (
      gesture?.kind === 'move' &&
      gesture.attachArmedGroupId
    ) {
      const cell = this.findCell(gesture.cellId)
      const group = this.model.groups.find(
        (candidate) => candidate.id === gesture.attachArmedGroupId,
      )
      if (cell && group) {
        this.attachCellToGroup(cell, group)
        this.selectGroup(group.id)
      }
    } else if (mergeIntent?.targetId && gesture && 'cellId' in gesture) {
      this.mergeCells(gesture.cellId, mergeIntent.targetId)
    } else if (gesture?.kind === 'merge') {
      if (gesture.targetId) {
        this.mergeCells(gesture.cellId, gesture.targetId)
      }
    } else if (gesture?.kind === 'group-member' && gesture.pendingDetach) {
      this.detachFromGroup(gesture.cellId, gesture.groupId)
    } else if (gesture?.kind === 'move' && gesture.pendingAttachGroupId) {
      const cell = this.findCell(gesture.cellId)
      const group = this.model.groups.find(
        (candidate) => candidate.id === gesture.pendingAttachGroupId,
      )
      if (cell && group) {
        this.attachCellToGroup(cell, group)
        this.selectGroup(group.id)
      }
    }
    this.state.gesture = null
    this.canvas.style.cursor = this.state.mode === 'add' ? 'crosshair' : 'default'
    this.updateCanvasState()
  }

  private findAttachableGroup(cell: CellEntity) {
    const point = this.pixelFromSite(cell.site)
    for (const group of this.model.groups) {
      if (group.memberIds.length < this.settings.group.attachContactThreshold) continue
      const inner = this.groupInnerPolygons.get(group.id)
      if (!inner || !pointInPolygon(point, inner)) continue
      const requiredDepth = Math.max(
        this.settings.group.wallGap + this.settings.geometry.seamGap * 0.35,
        this.settings.group.attachDistancePx * 0.75,
      )
      if (distanceToPolygonEdges(point, inner) < requiredDepth) continue
      const contacts = group.memberIds
        .map((id) => this.findCell(id))
        .filter((member): member is CellEntity => Boolean(member))
        .filter((member) => distance(member.site, cell.site) <= 0.46).length
      if (contacts >= this.settings.group.attachContactThreshold) {
        return group.id
      }
    }
    return null
  }

  private findNearbyGroupWall(cell: CellEntity) {
    const point = this.pixelFromSite(cell.site)
    return this.model.groups
      .map((group) => {
        const wall =
          this.groupVisuals.get(group.id)?.currentPoints ??
          this.groupContainerPolygons.get(group.id)
        if (!wall?.length) return null
        const edgeDistance = distanceToPolygonEdges(point, wall)
        const inside = pointInPolygon(point, wall)
        if (!inside && edgeDistance > this.settings.group.attachDistancePx) return null
        return {
          id: group.id,
          distance: inside ? edgeDistance * 0.25 : edgeDistance,
        }
      })
      .filter(
        (candidate): candidate is { id: string; distance: number } =>
          candidate !== null,
      )
      .sort(
        (first, second) =>
          first.distance - second.distance || first.id.localeCompare(second.id),
      )[0]?.id ?? null
  }

  private projectedGroupGhostSite(groupId: string, point: Point2) {
    const boundary =
      this.groupInnerPolygons.get(groupId) ??
      this.groupVisuals.get(groupId)?.currentPoints ??
      this.groupContainerPolygons.get(groupId)
    if (!boundary?.length) return this.normalizedFromPixel(point)
    const nearest = nearestPointOnPolygon(point, boundary).point
    const center = polygonCentroid(boundary)
    const dx = center.x - nearest.x
    const dy = center.y - nearest.y
    const magnitude = Math.hypot(dx, dy) || 1
    const inset = Math.min(
      this.settings.group.ghostSizePx * 0.45,
      Math.max(2, distance(nearest, center) * 0.45),
    )
    return this.normalizedFromPixel({
      x: nearest.x + (dx / magnitude) * inset,
      y: nearest.y + (dy / magnitude) * inset,
    })
  }

  private detachCueGeometry(cell: CellEntity, groupId: string) {
    const boundary =
      this.groupVisuals.get(groupId)?.currentPoints ??
      this.groupContainerPolygons.get(groupId)
    if (!boundary?.length) {
      return {
        pullProgress: 0,
        ready: false,
        ghostSite: { ...cell.site },
      }
    }
    const point = this.pixelFromSite(cell.site)
    const center = polygonCentroid(boundary)
    const nearest = nearestPointOnPolygon(point, boundary)
    const outsideDistance = pointInPolygon(point, boundary) ? 0 : nearest.distance
    const boundaryRadius = distance(center, nearest.point)
    const detachRadius = this.settings.group.detachThreshold * this.fieldRadius
    const centerDistance = distance(center, point)
    const pullSpan = Math.max(detachRadius - boundaryRadius, 1)
    return {
      pullProgress: clamp(outsideDistance / pullSpan, 0, 1),
      ready: centerDistance >= detachRadius,
      ghostSite: this.projectedGroupGhostSite(groupId, point),
    }
  }

  private updateGroupAttachDwell(nowMs: number) {
    const gesture = this.state.gesture
    if (
      gesture?.kind !== 'move' ||
      !gesture.attachCandidateGroupId ||
      gesture.attachCandidateSince === null ||
      gesture.attachArmedGroupId
    ) {
      return
    }
    const cell = this.findCell(gesture.cellId)
    if (!cell || this.findNearbyGroupWall(cell) !== gesture.attachCandidateGroupId) {
      gesture.attachCandidateGroupId = null
      gesture.attachCandidateSince = null
      gesture.attachCandidatePosition = null
      return
    }
    if (nowMs - gesture.attachCandidateSince < this.settings.group.attachHoldMs) return
    const group = this.model.groups.find(
      (candidate) => candidate.id === gesture.attachCandidateGroupId,
    )
    if (!group) return
    gesture.attachArmedGroupId = group.id
    gesture.pendingAttachGroupId = group.id
    group.container.site.x += (cell.site.x - group.container.site.x) * 0.04
    group.container.site.y += (cell.site.y - group.container.site.y) * 0.04
    group.container.weight = Math.min(0.24, group.container.weight + 0.0015)
  }

  private updateGroupDetachDwell(nowMs: number) {
    const gesture = this.state.gesture
    if (gesture?.kind !== 'group-member') return
    const cell = this.findCell(gesture.cellId)
    if (!cell) return
    const detach = this.detachCueGeometry(cell, gesture.groupId)
    if (detach.pullProgress > 0) {
      gesture.detachCandidateSince ??= nowMs
    } else {
      gesture.detachCandidateSince = null
    }
    const dwellElapsed =
      gesture.detachCandidateSince === null
        ? 0
        : nowMs - gesture.detachCandidateSince
    gesture.pendingDetach =
      detach.ready &&
      dwellElapsed >= this.settings.group.attachHoldMs
  }

  private placeEmptyCell(point: Point2, command: string) {
    const preview = this.state.preview ?? this.makePreview(point)
    if (!preview) return null
    this.checkpoint(command)
    const existing = this.model.cells.find(
      (cell) => cell.kind === 'journal' && cell.text.trim() === '',
    )
    if (existing) {
      if (existing.groupId) this.detachFromGroup(existing.id, existing.groupId)
      existing.site = { ...preview.site }
      existing.weight = Math.max(existing.weight, preview.weight)
      existing.incubation = {
        state: 'empty',
        sourceIds: [],
        restStartedAtMs: this.lastFrameTime * 1000,
      }
      existing.contentProvenance = {
        provider: reflectiveContentProvider.id,
        operation: 'manual',
        sourceIds: [],
        themes: [],
        tensions: [],
        horizon: 'today',
      }
      enforceSingleEmptyCell(this.model, existing.id)
    } else {
      const cell: CellEntity = {
        id: preview.id,
        text: '',
        site: { ...preview.site },
        weight: preview.weight,
        kind: preview.kind,
        style: preview.style,
        creation: preview.creation,
        contentProvenance: preview.contentProvenance,
        incubation: {
          state: 'empty',
          sourceIds: [],
          restStartedAtMs: this.lastFrameTime * 1000,
        },
        expiry: {
          state: 'none',
          timeoutMs: this.settings.seed.expirySeconds * 1000,
        },
      }
      this.model.cells.push(cell)
      this.model.layout.zOrder.push(cell.id)
      this.model.layout.listOrder.push(cell.id)
      this.model.layout.nextCellNumber += 1
    }
    this.state.preview = null
    this.previewSuppressedAt = point
    this.sourceDirtyToken += 1
    this.updateCanvasState()
    return existing?.id ?? preview.id
  }

  private makePreview(point: Point2): PreviewCell | null {
    const site = this.normalizedFromPixel(point)
    if (Math.hypot(site.x, site.y) > 0.97) return null
    const id = `cell-${this.model.layout.nextCellNumber}`
    return {
      id,
      text: '',
      site,
      // Reserve a normal readable cell, not a decorative sliver. Existing
      // copy floors relax while Add Cell is active so neighboring sites can
      // yield this space even in a tight Delaunay pocket.
      weight: 0.024,
      kind: 'journal',
      style: { paletteIndex: this.model.layout.nextCellNumber % 4 },
      creation: {
        source: 'manual',
        order: this.model.layout.nextCellNumber,
        promoted: true,
      },
      contentProvenance: {
        provider: reflectiveContentProvider.id,
        operation: 'manual',
        sourceIds: [],
        themes: [],
        tensions: [],
        horizon: 'today',
      },
      incubation: {
        state: 'empty',
        sourceIds: [],
      },
      expiry: {
        state: 'none',
        timeoutMs: this.settings.seed.expirySeconds * 1000,
      },
      preview: true,
    }
  }

  private absorbIntoGroup(cell: CellEntity) {
    if (cell.kind === 'seed') return
    this.checkpoint('group-cell')
    let group = this.state.acquiringGroupId
      ? this.model.groups.find((candidate) => candidate.id === this.state.acquiringGroupId)
      : undefined
    if (!group) {
      group = this.createManualGroup(cell) ?? undefined
      if (!group) return
      this.state.acquiringGroupId = group.id
    }
    this.attachCellToGroup(cell, group)
    this.selectGroup(group.id)
    this.updateCanvasState()
  }

  private createManualGroup(cell: CellEntity) {
    if (this.model.groups.length >= 8) return null
    const id = `group-${this.model.layout.nextGroupNumber}`
    const order = this.model.layout.nextGroupNumber
    const normalizedWallPadding =
      (this.settings.group.wallThickness +
        this.settings.group.wallGap +
        this.settings.geometry.seamGap) /
      Math.max(1, this.fieldRadius)
    const preferredWeight =
      cell.weight + Math.max(0.014, normalizedWallPadding * 0.4)
    const group: GroupEntity = {
      id,
      memberIds: [],
      wall: {
        gap: this.settings.group.wallGap,
        thickness: this.settings.group.wallThickness,
      },
      style: { tint: groupColorFor(this.settings, order) },
      container: {
        site: { ...cell.site },
        weight: Math.max(0.022, preferredWeight),
        preferredWeight: Math.max(0.022, preferredWeight),
      },
      title: reflectiveContentProvider.groupTitle([
        { id: cell.id, text: cell.text },
      ]).text,
      provenance: { source: 'manual' },
      order,
    }
    this.model.layout.nextGroupNumber += 1
    this.model.groups.push(group)
    return group
  }

  private attachCellToGroup(cell: CellEntity, group: GroupEntity) {
    if (cell.groupId && cell.groupId !== group.id) return
    if (!group.memberIds.includes(cell.id)) group.memberIds.push(cell.id)
    cell.groupId = group.id
    const count = group.memberIds.length
    group.container.site.x += (cell.site.x - group.container.site.x) / count
    group.container.site.y += (cell.site.y - group.container.site.y) / count
    group.title = reflectiveContentProvider.groupTitle(
      group.memberIds
        .map((id) => this.findCell(id))
        .filter((member): member is CellEntity => Boolean(member))
        .map((member) => ({ id: member.id, text: member.text })),
    ).text
  }

  private detachFromGroup(cellId: string, groupId: string) {
    const cell = this.findCell(cellId)
    const group = this.model.groups.find((candidate) => candidate.id === groupId)
    if (!cell || !group) return
    cell.groupId = undefined
    group.memberIds = group.memberIds.filter((id) => id !== cellId)
    if (group.memberIds.length === 0) {
      this.model.groups = this.model.groups.filter((candidate) => candidate.id !== groupId)
      this.state.selectedGroupId = null
    }
  }

  private deleteCell(cellId: string) {
    this.checkpoint('delete-cell')
    this.model.cells = this.model.cells.filter((cell) => cell.id !== cellId)
    this.model.relationships = this.model.relationships.filter(
      (relationship) =>
        relationship.sourceId !== cellId && relationship.targetId !== cellId,
    )
    this.model.layout.zOrder = this.model.layout.zOrder.filter((id) => id !== cellId)
    this.model.layout.listOrder = this.model.layout.listOrder.filter((id) => id !== cellId)
    for (const group of this.model.groups) {
      group.memberIds = group.memberIds.filter((id) => id !== cellId)
    }
    for (const cell of this.model.cells) {
      cell.incubation.sourceIds = cell.incubation.sourceIds.filter((id) => id !== cellId)
      if (cell.creation.sourceCellIds) {
        cell.creation.sourceCellIds = cell.creation.sourceCellIds.filter((id) => id !== cellId)
      }
    }
    this.model.groups = this.model.groups.filter((group) => group.memberIds.length > 0)
    this.seedRuntime.delete(cellId)
    this.clearSelection()
    this.updateCanvasState()
  }

  private promoteSeed(cellId: string) {
    const cell = this.findCell(cellId)
    if (!cell || cell.kind !== 'seed') return
    this.checkpoint('promote-seed')
    const sourceIds = cell.creation.sourceCellIds ?? []
    const sourceCells = sourceIds
      .map((id) => this.findCell(id))
      .filter((candidate): candidate is CellEntity => Boolean(candidate))
    cell.kind = 'journal'
    const generated = reflectiveContentProvider.synthesize(
      sourceCells.map((source) => ({ id: source.id, text: source.text })),
    )
    cell.text = generated.text
    cell.contentProvenance = generated.provenance
    cell.weight =
      sourceCells.reduce((sum, source) => sum + source.weight, 0) /
        Math.max(1, sourceCells.length) || 0.008
    cell.creation.promoted = true
    cell.expiry.state = 'cancelled'
    cell.incubation = {
      state: 'revealed',
      sourceIds: [...sourceIds],
      generatedText: cell.text,
    }
    this.seedRuntime.delete(cell.id)
    this.selectCell(cell.id)
    this.callbacks.onCanonicalTextChanged?.(cell.id, cell.text)
  }

  private mergeCells(sourceId: string, targetId: string) {
    const source = this.findCell(sourceId)
    const target = this.findCell(targetId)
    if (
      !source ||
      !target ||
      source.kind !== 'journal' ||
      target.kind !== 'journal' ||
      source.groupId !== target.groupId
    ) {
      return
    }
    if (
      !this.state.gesture ||
      !('historyCaptured' in this.state.gesture) ||
      !this.state.gesture.historyCaptured
    ) {
      this.checkpoint('merge-cells')
    }
    const id = `cell-${this.model.layout.nextCellNumber}`
    const sourceIds = [
      ...(source.transformation?.sourceIds ?? [source.id]),
      ...(target.transformation?.sourceIds ?? [target.id]),
    ]
    const totalWeight = Math.max(0.001, source.weight + target.weight)
    const mergedContent = reflectiveContentProvider.merge([
      { id: target.id, text: target.text },
      { id: source.id, text: source.text },
    ])
    const merged: CellEntity = {
      id,
      text: mergedContent.text,
      site: {
        x: (source.site.x * source.weight + target.site.x * target.weight) / totalWeight,
        y: (source.site.y * source.weight + target.site.y * target.weight) / totalWeight,
      },
      weight: clamp(source.weight + target.weight + 0.004, 0.006, 0.12),
      kind: 'journal',
      groupId: source.groupId,
      style: { ...target.style },
      creation: {
        source: 'merge',
        order: this.model.layout.nextCellNumber,
        promoted: true,
        sourceCellIds: [source.id, target.id],
      },
      transformation: { kind: 'merge', sourceIds },
      contentProvenance: mergedContent.provenance,
      incubation: {
        state: source.text || target.text ? 'revealed' : 'empty',
        sourceIds: [],
      },
      expiry: {
        state: 'none',
        timeoutMs: this.settings.seed.expirySeconds * 1000,
      },
    }
    const removed = new Set([source.id, target.id])
    this.model.cells = this.model.cells.filter((cell) => !removed.has(cell.id))
    this.model.relationships = this.model.relationships.filter(
      (relationship) =>
        !removed.has(relationship.sourceId) && !removed.has(relationship.targetId),
    )
    const firstIndex = Math.max(
      0,
      this.model.layout.zOrder.findIndex((cellId) => removed.has(cellId)),
    )
    this.model.layout.zOrder = this.model.layout.zOrder.filter((cellId) => !removed.has(cellId))
    this.model.layout.zOrder.splice(firstIndex, 0, id)
    const firstListIndex = Math.max(
      0,
      this.model.layout.listOrder.findIndex((cellId) => removed.has(cellId)),
    )
    this.model.layout.listOrder = this.model.layout.listOrder.filter(
      (cellId) => !removed.has(cellId),
    )
    this.model.layout.listOrder.splice(firstListIndex, 0, id)
    this.model.cells.push(merged)
    if (merged.groupId) {
      const group = this.model.groups.find((candidate) => candidate.id === merged.groupId)
      if (group) {
        const firstMemberIndex = Math.max(
          0,
          group.memberIds.findIndex((cellId) => removed.has(cellId)),
        )
        group.memberIds = group.memberIds.filter((cellId) => !removed.has(cellId))
        group.memberIds.splice(firstMemberIndex, 0, merged.id)
        group.title = reflectiveContentProvider.groupTitle(
          group.memberIds
            .map((memberId) => this.findCell(memberId))
            .filter((member): member is CellEntity => Boolean(member))
            .map((member) => ({ id: member.id, text: member.text })),
        ).text
      }
    }
    merged.weight = Math.max(merged.weight, this.minimumWeightForText(merged.text))
    this.model.layout.nextCellNumber += 1
    if (!merged.text.trim()) enforceSingleEmptyCell(this.model, merged.id)
    for (const cell of this.model.cells) {
      cell.incubation.sourceIds = cell.incubation.sourceIds.filter(
        (cellId) => !removed.has(cellId),
      )
    }
    this.state.selectedCellId = id
    this.state.selectedCellIds = [id]
    this.state.selectedGroupId = null
    this.state.hoveredId = null
    this.notifySelectionChanged()
    this.sourceDirtyToken += 1
    this.callbacks.onCanonicalTextChanged?.(merged.id, merged.text)
  }

  private splitCell(cellId: string, requestedCount?: number) {
    const cell = this.findCell(cellId)
    if (!cell || cell.kind !== 'journal') return
    const gesture = this.state.gesture
    if (!gesture || !('historyCaptured' in gesture) || !gesture.historyCaptured) {
      this.checkpoint('split-cell')
    }
    const desiredCount = requestedCount ?? clamp(
      Math.round(cell.text.trim().split(/\s+/).filter(Boolean).length / 4),
      this.settings.mergeSplit.splitMin,
      this.settings.mergeSplit.splitMax,
    )
    const parts = reflectiveContentProvider.split(
      { id: cell.id, text: cell.text },
      desiredCount,
    )
    const originalIndex = Math.max(0, this.model.layout.zOrder.indexOf(cell.id))
    this.model.cells = this.model.cells.filter((candidate) => candidate.id !== cell.id)
    this.model.relationships = this.model.relationships.filter(
      (relationship) =>
        relationship.sourceId !== cell.id && relationship.targetId !== cell.id,
    )
    this.model.layout.zOrder = this.model.layout.zOrder.filter((id) => id !== cell.id)
    const originalListIndex = Math.max(0, this.model.layout.listOrder.indexOf(cell.id))
    this.model.layout.listOrder = this.model.layout.listOrder.filter((id) => id !== cell.id)
    const created: CellEntity[] = parts.map((content, index) => {
      const id = `cell-${this.model.layout.nextCellNumber + index}`
      const angle = -Math.PI / 2 + (index / Math.max(1, parts.length)) * Math.PI * 2
      const spread = cell.groupId ? 0.045 + parts.length * 0.004 : 0.09 + parts.length * 0.008
      const site = {
        x: cell.site.x + Math.cos(angle) * spread,
        y: cell.site.y + Math.sin(angle) * spread,
      }
      const radius = Math.hypot(site.x, site.y)
      if (radius > 0.92) {
        site.x *= 0.92 / radius
        site.y *= 0.92 / radius
      }
      return {
        id,
        text: content.text,
        site,
        weight: Math.max(
          clamp(cell.weight / parts.length + 0.003, 0.005, 0.06),
          this.minimumWeightForText(content.text),
        ),
        kind: 'journal',
        groupId: cell.groupId,
        style: { paletteIndex: (cell.style.paletteIndex + index) % 4 },
        creation: {
          source: 'split',
          order: this.model.layout.nextCellNumber + index,
          promoted: true,
          sourceCellIds: [cell.id],
        },
        transformation: {
          kind: 'split',
          sourceIds: cell.transformation?.sourceIds ?? [cell.id],
        },
        contentProvenance: content.provenance,
        incubation: {
          state: 'revealed',
          sourceIds: [],
        },
        expiry: {
          state: 'none',
          timeoutMs: this.settings.seed.expirySeconds * 1000,
        },
      }
    })
    this.model.cells.push(...created)
    if (cell.groupId) {
      const group = this.model.groups.find((candidate) => candidate.id === cell.groupId)
      if (group) {
        const memberIndex = Math.max(0, group.memberIds.indexOf(cell.id))
        group.memberIds = group.memberIds.filter((memberId) => memberId !== cell.id)
        group.memberIds.splice(memberIndex, 0, ...created.map((candidate) => candidate.id))
        group.title = reflectiveContentProvider.groupTitle(
          group.memberIds
            .map((memberId) => this.findCell(memberId))
            .filter((member): member is CellEntity => Boolean(member))
            .map((member) => ({ id: member.id, text: member.text })),
        ).text
      }
    }
    this.model.layout.zOrder.splice(originalIndex, 0, ...created.map((candidate) => candidate.id))
    this.model.layout.listOrder.splice(
      originalListIndex,
      0,
      ...created.map((candidate) => candidate.id),
    )
    this.model.layout.nextCellNumber += created.length
    this.state.selectedCellId = created[0]?.id ?? null
    this.state.selectedCellIds = this.state.selectedCellId
      ? [this.state.selectedCellId]
      : []
    this.state.hoveredId = null
    this.notifySelectionChanged()
    this.state.gesture = null
    this.sourceDirtyToken += 1
    for (const createdCell of created) {
      this.callbacks.onCanonicalTextChanged?.(createdCell.id, createdCell.text)
    }
  }

  private spawnSeed(time: number) {
    const alive = this.model.cells.filter((cell) => cell.kind === 'seed').length
    if (alive >= this.settings.seed.maxAlive || this.settings.seed.rate <= 0) return false
    const candidates = this.model.cells.filter(
      (cell) => cell.kind === 'journal' && !cell.groupId,
    )
    const allTriples = findDelaunayTriples(
      candidates.map((cell) => ({ id: cell.id, x: cell.site.x, y: cell.site.y })),
    ).filter((triple) => {
      const distanceFromCenter = Math.hypot(triple.circumcenter.x, triple.circumcenter.y)
      const notCrowded = this.model.cells.every(
        (cell) => distance(cell.site, triple.circumcenter) > 0.09,
      )
      return distanceFromCenter < 0.88 && triple.radius < 0.62 && notCrowded
    })
    const selected = new Set(this.state.selectedCellIds)
    const selectedSeams =
      selected.size > 1
        ? allTriples.filter(
            (triple) => triple.ids.filter((id) => selected.has(id)).length >= 2,
          )
        : []
    const triples = selectedSeams.length > 0 ? selectedSeams : allTriples
    if (triples.length === 0) return false
    const triple = triples[Math.floor(this.random() * triples.length) % triples.length]
    const sources = triple.ids
      .map((id) => this.findCell(id))
      .filter((cell): cell is CellEntity => Boolean(cell))
    const averageWeight =
      sources.reduce((sum, cell) => sum + cell.weight, 0) / Math.max(1, sources.length)
    const id = `cell-${this.model.layout.nextCellNumber}`
    const targetWeight = Math.max(0.0008, averageWeight * this.settings.seed.sizeRatio)
    const seed: CellEntity = {
      id,
      text: '',
      site: { ...triple.circumcenter },
      weight: targetWeight,
      kind: 'seed',
      style: { paletteIndex: this.model.layout.nextCellNumber % 4 },
      creation: {
        source: 'auto-growth',
        order: this.model.layout.nextCellNumber,
        promoted: false,
        sourceCellIds: [...triple.ids],
      },
      contentProvenance: {
        provider: reflectiveContentProvider.id,
        operation: 'auto-growth',
        sourceIds: [...triple.ids],
        themes: [],
        tensions: [],
        horizon: 'today',
      },
      incubation: {
        state: 'empty',
        sourceIds: [...triple.ids],
      },
      expiry: {
        state: 'scheduled',
        timeoutMs: this.settings.seed.expirySeconds * 1000,
        createdAtMs: Date.now(),
      },
    }
    this.model.cells.push(seed)
    this.model.layout.zOrder.push(id)
    this.model.layout.listOrder.push(id)
    this.model.layout.nextCellNumber += 1
    this.seedRuntime.set(id, {
      bornAt: time,
      startWeight: 0.00002,
      targetWeight,
    })
    for (const sourceId of triple.ids) {
      this.model.relationships.push({
        id: `relationship-${this.model.layout.nextRelationshipNumber}`,
        sourceId: id,
        targetId: sourceId,
        type: 'emergent-source',
        weight: 1,
        provenance: 'local-delaunay',
      })
      this.model.layout.nextRelationshipNumber += 1
    }
    this.updateCanvasState()
    return true
  }

  private updateSeedExpiry(timeMs: number) {
    const expired: string[] = []
    for (const cell of this.model.cells) {
      if (cell.kind !== 'seed' || cell.expiry.state === 'cancelled') continue
      if (cell.expiry.state === 'scheduled' && cell.expiry.createdAtMs === undefined) {
        cell.expiry.createdAtMs = timeMs
        this.sourceDirtyToken += 1
      }
      const createdAt = cell.expiry.createdAtMs ?? timeMs
      if (
        cell.expiry.state === 'scheduled' &&
        timeMs - createdAt >= cell.expiry.timeoutMs
      ) {
        cell.expiry.state = 'shrinking'
        cell.expiry.shrinkStartedAtMs = timeMs
      }
      if (
        cell.expiry.state === 'shrinking' &&
        seedExpiryScale(cell.expiry, timeMs, this.settings.seed.expiryShrinkMs) <= 0.001
      ) {
        expired.push(cell.id)
      }
    }
    if (!expired.length) return
    if (expired.some((id) => !this.expiryHistoryCaptured.has(id))) {
      this.checkpoint('expire-seed')
    }
    const expiredSet = new Set(expired)
    this.model.cells = this.model.cells.filter((cell) => !expiredSet.has(cell.id))
    this.model.relationships = this.model.relationships.filter(
      (relationship) =>
        !expiredSet.has(relationship.sourceId) && !expiredSet.has(relationship.targetId),
    )
    this.model.layout.zOrder = this.model.layout.zOrder.filter((id) => !expiredSet.has(id))
    this.model.layout.listOrder = this.model.layout.listOrder.filter(
      (id) => !expiredSet.has(id),
    )
    for (const id of expired) {
      this.seedRuntime.delete(id)
      this.expiryHistoryCaptured.delete(id)
    }
    this.sourceDirtyToken += 1
  }

  private nextSeedDelay() {
    const minimum = Math.min(this.settings.seed.delayMinMs, this.settings.seed.delayMaxMs)
    const maximum = Math.max(this.settings.seed.delayMinMs, this.settings.seed.delayMaxMs)
    return (
      (minimum + (maximum - minimum) * this.random()) /
      Math.max(0.08, this.settings.seed.rate)
    )
  }

  private random() {
    this.randomState = (1664525 * this.randomState + 1013904223) >>> 0
    return this.randomState / 0x100000000
  }

  private applyGroupAttraction(delta: number) {
    if (this.state.gesture?.kind === 'group-member') return
    const strength = this.settings.group.attraction * Math.min(1, delta * 4.5)
    const activeGroupIds = new Set(this.model.groups.map((group) => group.id))
    for (const groupId of this.groupSlotLayouts.keys()) {
      if (!activeGroupIds.has(groupId)) this.groupSlotLayouts.delete(groupId)
    }
    for (const groupId of this.groupTextFloors.keys()) {
      if (!activeGroupIds.has(groupId)) this.groupTextFloors.delete(groupId)
    }
    for (const group of this.model.groups) {
      const members = group.memberIds
        .map((id) => this.findCell(id))
        .filter((cell): cell is CellEntity => Boolean(cell))
      if (members.length === 0) continue
      const center = members.reduce(
        (sum, cell) => ({
          x: sum.x + cell.site.x / members.length,
          y: sum.y + cell.site.y / members.length,
        }),
        { x: 0, y: 0 },
      )
      if (distance(group.container.site, center) < 0.00015) {
        group.container.site = { ...center }
      } else {
        group.container.site.x += (center.x - group.container.site.x) * strength
        group.container.site.y += (center.y - group.container.site.y) * strength
      }

      let slotLayout: GroupSlotLayout | undefined
      if (group.provenance.source === 'autogroup') {
        const signature = group.memberIds.join('|')
        slotLayout = this.groupSlotLayouts.get(group.id)
        if (!slotLayout || slotLayout.signature !== signature) {
          const innerBoundary = this.groupInnerPolygons.get(group.id)
          if (innerBoundary && innerBoundary.length >= 3) {
            const pixelCenter = polygonCentroid(innerBoundary)
            const angleOffset = group.order * 0.61
            const targets = new Map<string, Point2>()
            for (const [memberIndex, member] of members.entries()) {
              const angle = angleOffset + (memberIndex / members.length) * Math.PI * 2
              const edge = rayPolygonIntersection(
                pixelCenter,
                { x: Math.cos(angle), y: Math.sin(angle) },
                innerBoundary,
              )
              targets.set(
                member.id,
                this.normalizedFromPixel({
                  x: pixelCenter.x + (edge.x - pixelCenter.x) * 0.48,
                  y: pixelCenter.y + (edge.y - pixelCenter.y) * 0.48,
                }),
              )
            }
            slotLayout = { signature, targets }
            this.groupSlotLayouts.set(group.id, slotLayout)
          }
        }
      }

      for (const member of members) {
        const target = slotLayout?.targets.get(member.id)
        if (target) {
          const slotPull = Math.min(1, strength * 1.8)
          if (distance(member.site, target) < 0.00015) {
            member.site = { ...target }
          } else {
            member.site.x += (target.x - member.site.x) * slotPull
            member.site.y += (target.y - member.site.y) * slotPull
          }
        }
        const memberDistance = distance(member.site, group.container.site)
        if (memberDistance < 0.34) continue
        const pull = strength * clamp((memberDistance - 0.34) / 0.5, 0, 1)
        member.site.x += (group.container.site.x - member.site.x) * pull
        member.site.y += (group.container.site.y - member.site.y) * pull
      }
      const memberReach = Math.max(
        ...members.map(
          (member) =>
            distance(member.site, group.container.site) +
            Math.sqrt(Math.max(0.001, member.weight)),
        ),
      )
      const normalizedWall =
        (this.settings.group.wallThickness +
          this.settings.group.wallGap +
          this.settings.geometry.seamGap) /
        Math.max(1, this.fieldRadius)
      const spatialWeight = clamp(
        Math.max(0.015, (memberReach + normalizedWall) ** 2 * 0.24 + members.length * 0.003),
        0.015,
        0.16,
      )
      const requiredMemberArea = members.reduce(
        (sum, member) => sum + (this.textRequirementState.get(member.id)?.requiredArea ?? 0),
        0,
      )
      const fieldArea = Math.max(1, Math.PI * this.fieldRadius * this.fieldRadius)
      // A grouped member's power weight only changes the tessellation inside
      // its container. Propagate unresolved text pressure to the top-level
      // container too, otherwise adding or splitting a sibling can leave the
      // whole group too small for any internal weight adjustment to solve.
      const membershipSignature = group.memberIds.join('|')
      let textFloor = this.groupTextFloors.get(group.id)
      if (!textFloor || textFloor.signature !== membershipSignature) {
        textFloor = { signature: membershipSignature, weight: 0 }
        this.groupTextFloors.set(group.id, textFloor)
      }
      const hasUnfitMember = members.some(
        (member) => this.textRequirementState.get(member.id)?.fits === false,
      )
      const memberTextPressure = members.reduce(
        (pressure, member) =>
          Math.max(pressure, this.textWeightBoost.get(member.id) ?? 0),
        0,
      )
      const requestedTextWeight = clamp(
        (requiredMemberArea / fieldArea) * 0.95 +
          members.length * 0.006 +
          (hasUnfitMember ? memberTextPressure : 0),
        0.015,
        0.28,
      )
      if (hasUnfitMember) {
        textFloor.weight = Math.max(textFloor.weight, requestedTextWeight)
      }
      const textWeight = Math.max(requestedTextWeight, textFloor.weight)
      const targetWeight = Math.max(
        spatialWeight,
        textWeight,
        group.container.preferredWeight ?? 0,
      )
      if (Math.abs(targetWeight - group.container.weight) < 0.00001) {
        group.container.weight = targetWeight
      } else {
        group.container.weight += (targetWeight - group.container.weight) * Math.min(1, delta * 5)
      }
    }
  }

  private updateIncubation(timeMs: number) {
    const candidates = this.model.cells.filter(
      (cell) => cell.kind === 'journal' && !cell.groupId,
    )
    const triples = findDelaunayTriples(
      candidates.map((cell) => ({ id: cell.id, x: cell.site.x, y: cell.site.y })),
    )
    for (const cell of candidates) {
      if (cell.text || cell.incubation.state !== 'empty') continue
      if (!this.autoGrowth) {
        cell.incubation.restStartedAtMs = undefined
        continue
      }
      const active =
        this.state.selectedCellIds.includes(cell.id) ||
        this.state.hoveredId === cell.id ||
        this.state.editingId === cell.id ||
        (this.state.gesture &&
          'cellId' in this.state.gesture &&
          this.state.gesture.cellId === cell.id)
      if (active) {
        cell.incubation.restStartedAtMs = timeMs
        continue
      }
      if (cell.incubation.restStartedAtMs === undefined) {
        cell.incubation.restStartedAtMs = timeMs
        continue
      }
      if (timeMs - cell.incubation.restStartedAtMs < this.settings.seed.incubationDelayMs) {
        continue
      }
      const neighborIds = new Set<string>()
      for (const triple of triples) {
        if (!triple.ids.includes(cell.id)) continue
        for (const id of triple.ids) {
          if (id !== cell.id) neighborIds.add(id)
        }
      }
      const sources = [...neighborIds]
        .map((id) => this.findCell(id))
        .filter(
          (candidate): candidate is CellEntity =>
            Boolean(
              candidate?.text &&
                candidate.kind === 'journal' &&
                !candidate.groupId,
            ),
        )
        .sort(
          (first, second) =>
            distance(first.site, cell.site) - distance(second.site, cell.site) ||
            first.id.localeCompare(second.id),
        )
        .slice(0, 3)
      if (sources.length === 0) continue
      const generated = reflectiveContentProvider.synthesize(
        sources.map((source) => ({ id: source.id, text: source.text })),
      )
      const generatedText = generated.text
      cell.text = generatedText
      cell.contentProvenance = generated.provenance
      cell.incubation = {
        state: 'incubating',
        sourceIds: sources.map((source) => source.id),
        startedAtMs: timeMs,
        generatedText,
      }
      this.callbacks.onCanonicalTextChanged?.(cell.id, cell.text)
    }
  }

  private revealIncubation(cell: CellEntity) {
    if (cell.incubation.state !== 'incubating') return
    this.checkpoint('reveal-incubation')
    cell.incubation.state = 'revealed'
    cell.incubation.startedAtMs = undefined
  }

  private makeNewSelectMergeIntent(cell: CellEntity): MergeIntent | undefined {
    if (
      this.state.mode !== 'select' ||
      !this.settings.mergeSplit.enabled ||
      !this.settings.mergeSplit.newSelect
    ) {
      return undefined
    }
    return {
      startedAt: this.lastFrameTime,
      origin: { ...cell.site },
      pointer: this.pixelFromSite(cell.site),
      moved: false,
      candidateId: null,
      candidateSince: null,
      targetId: null,
      splitTriggered: false,
    }
  }

  private mergeIntentFor(gesture: Gesture) {
    if (gesture.kind === 'move' || gesture.kind === 'group-member') {
      return gesture.mergeIntent
    }
    return undefined
  }

  private updateNewSelectMergeIntent(
    gesture: MoveGesture | GroupMemberGesture,
    cell: CellEntity,
    pointer: Point2,
  ) {
    const intent = gesture.mergeIntent
    if (!intent) return
    intent.pointer = { ...pointer }
    intent.moved =
      intent.moved ||
      distance(this.pixelFromSite(intent.origin), this.pixelFromSite(cell.site)) > 5
    if (!intent.moved) return
    const target = this.model.cells
      .filter(
        (candidate) =>
          candidate.id !== cell.id &&
          candidate.kind === 'journal' &&
          candidate.groupId === cell.groupId,
      )
      .map((candidate) => {
        const polygon = this.visuals.get(candidate.id)?.currentPoints
        const center = polygon?.length ? polygonCentroid(polygon) : undefined
        const equivalentRadius =
          polygon?.length ? Math.sqrt(polygonArea(polygon) / Math.PI) : 0
        const centerDistance = center
          ? distance(pointer, center)
          : Number.POSITIVE_INFINITY
        const edgeDistance =
          polygon?.length && pointInPolygon(pointer, polygon)
            ? 0
            : polygon?.length
              ? distanceToPolygonEdges(pointer, polygon)
              : Number.POSITIVE_INFINITY
        const deepVisibleContact =
          Boolean(polygon?.length) &&
          edgeDistance <= this.settings.mergeSplit.activeZonePx &&
          centerDistance <= Math.max(12, equivalentRadius + this.settings.mergeSplit.activeZonePx)
        if (!deepVisibleContact) return null
        return {
          candidate,
          score: centerDistance,
        }
      })
      .filter(
        (
          entry,
        ): entry is {
          candidate: CellEntity
          score: number
        } => entry !== null,
      )
      .sort(
        (first, second) =>
          first.score - second.score ||
          first.candidate.id.localeCompare(second.candidate.id),
      )[0]?.candidate
    const candidateId = target?.id ?? null
    if (candidateId !== intent.candidateId) {
      intent.candidateId = candidateId
      intent.candidateSince = candidateId ? this.lastFrameTime : null
      intent.targetId = null
    }
  }

  private updateMergeLongPress(time: number) {
    const gesture = this.state.gesture
    if (!gesture || !('cellId' in gesture)) return
    if (gesture.kind === 'merge') {
      return
    }
    const intent = this.mergeIntentFor(gesture)
    if (!intent || intent.splitTriggered) return
    if (
      intent.moved &&
      intent.candidateId &&
      intent.candidateSince !== null &&
      (time - intent.candidateSince) * 1000 >= this.settings.mergeSplit.mergeDwellMs
    ) {
      intent.targetId = intent.candidateId
    }
  }

  private setInteractionEffect(
    cellId: string,
    patch: Partial<InteractionVisualEffect>,
  ) {
    const current = this.interactionEffects.get(cellId) ?? {
      cellJitterPx: 0,
      wallJitterPx: 0,
      frequencyHz: 0,
      phaseStartedAt: 0,
      phaseOffset: 0,
      tint: 0,
      grainBoost: 1,
    }
    this.interactionEffects.set(cellId, {
      cellJitterPx: Math.max(current.cellJitterPx, patch.cellJitterPx ?? 0),
      wallJitterPx: Math.max(current.wallJitterPx, patch.wallJitterPx ?? 0),
      frequencyHz: Math.max(current.frequencyHz, patch.frequencyHz ?? 0),
      phaseStartedAt: patch.phaseStartedAt ?? current.phaseStartedAt,
      phaseOffset: patch.phaseOffset ?? current.phaseOffset,
      tint: Math.max(current.tint, patch.tint ?? 0),
      grainBoost: Math.max(current.grainBoost, patch.grainBoost ?? 1),
    })
  }

  private deriveActiveGroupCue(
    time: number,
    source: CellEntity,
    gesture: MoveGesture | GroupMemberGesture,
  ): ActiveGroupCue | null {
    if (gesture.kind === 'move') {
      const groupId = gesture.attachCandidateGroupId ?? gesture.pendingAttachGroupId
      if (!groupId) return null
      const boundary =
        this.groupVisuals.get(groupId)?.currentPoints ??
        this.groupContainerPolygons.get(groupId)
      if (!boundary?.length) return null
      const point = this.pixelFromSite(source.site)
      const nearest = nearestPointOnPolygon(point, boundary)
      const threshold = Math.max(1, this.settings.group.attachDistancePx)
      const spatialProgress = pointInPolygon(point, boundary)
        ? 0.7 + clamp(nearest.distance / threshold, 0, 1) * 0.3
        : clamp(1 - nearest.distance / threshold, 0, 1)
      const dwellElapsedMs =
        gesture.attachCandidateSince === null
          ? 0
          : Math.max(0, time * 1000 - gesture.attachCandidateSince)
      return {
        kind: 'join',
        cellId: source.id,
        groupId,
        strength: groupCueStrength({
          spatialProgress,
          dwellElapsedMs,
          dwellMs: this.settings.group.attachHoldMs,
          easing: this.settings.group.cueEasing,
        }),
        oscillatorStartedAt: gesture.oscillatorStartedAt,
        ghostSite: this.projectedGroupGhostSite(groupId, point),
      }
    }

    const detach = this.detachCueGeometry(source, gesture.groupId)
    if (detach.pullProgress <= 0) return null
    const dwellElapsedMs =
      gesture.detachCandidateSince === null
        ? 0
        : Math.max(0, time * 1000 - gesture.detachCandidateSince)
    return {
      kind: 'detach',
      cellId: source.id,
      groupId: gesture.groupId,
      strength: groupCueStrength({
        spatialProgress: detach.pullProgress,
        dwellElapsedMs,
        dwellMs: this.settings.group.attachHoldMs,
        easing: this.settings.group.cueEasing,
      }),
      oscillatorStartedAt: gesture.oscillatorStartedAt,
      ghostSite: detach.ghostSite,
    }
  }

  private updateGroupGhostSlot(delta: number) {
    const cue = this.activeGroupCue
    if (
      cue &&
      (!this.groupGhostSlot ||
        this.groupGhostSlot.groupId !== cue.groupId ||
        this.groupGhostSlot.kind !== cue.kind)
    ) {
      this.groupGhostSlot = {
        kind: cue.kind,
        groupId: cue.groupId,
        site: { ...cue.ghostSite },
        strength: 0,
      }
    }
    const ghost = this.groupGhostSlot
    if (!ghost) return
    const response = this.reducedMotion
      ? 1
      : 1 - Math.exp(-Math.max(1, this.settings.group.ghostResponse) * delta)
    const targetStrength = cue?.groupId === ghost.groupId ? cue.strength : 0
    const targetSite = cue?.groupId === ghost.groupId ? cue.ghostSite : ghost.site
    ghost.site.x += (targetSite.x - ghost.site.x) * response
    ghost.site.y += (targetSite.y - ghost.site.y) * response
    ghost.strength += (targetStrength - ghost.strength) * response
    if (!cue && ghost.strength < 0.002) this.groupGhostSlot = null
  }

  private updateInteractionEffects(time: number) {
    this.interactionEffects.clear()
    this.activeGroupCue = null
    const gesture = this.state.gesture
    if (!gesture || !('cellId' in gesture)) return
    const source = this.findCell(gesture.cellId)
    if (!source) return
    if (gesture.kind === 'move' || gesture.kind === 'group-member') {
      const groupCue = this.deriveActiveGroupCue(time, source, gesture)
      if (groupCue) {
        this.activeGroupCue = groupCue
        this.setInteractionEffect(source.id, {
          cellJitterPx:
            this.reducedMotion
              ? 0
              : this.settings.group.cueCellAmplitudePx * groupCue.strength,
          frequencyHz: this.settings.group.cueFrequencyHz,
          phaseStartedAt: groupCue.oscillatorStartedAt,
          phaseOffset: 0,
          tint: groupCue.strength * 0.24,
          grainBoost: 1 + groupCue.strength * 0.4,
        })
      }
    }
    const intent = this.mergeIntentFor(gesture)
    const splitStartedAt = gesture.kind === 'merge' ? gesture.startedAt : intent?.startedAt
    const splitMoved = gesture.kind === 'merge' ? gesture.moved : intent?.moved
    if (splitStartedAt !== undefined && !splitMoved) {
      const amplitude = splitJitterState({
        elapsedMs: (time - splitStartedAt) * 1000,
        attackMs: this.settings.mergeSplit.splitJitterAttackMs,
        easing: this.settings.mergeSplit.splitJitterEasing,
        reducedMotion: this.reducedMotion,
      })
      this.setInteractionEffect(source.id, {
        cellJitterPx: this.settings.mergeSplit.splitJitterAmplitudePx * amplitude,
        wallJitterPx: this.settings.mergeSplit.splitJitterAmplitudePx * amplitude,
        frequencyHz: this.settings.mergeSplit.splitJitterFrequencyHz,
      })
      return
    }
    if (!intent?.moved) return

    for (const candidate of this.model.cells) {
      if (
        candidate.id === source.id ||
        candidate.kind !== 'journal' ||
        candidate.groupId !== source.groupId
      ) {
        continue
      }
      const polygon = this.visuals.get(candidate.id)?.currentPoints
      if (!polygon?.length) continue
      const distancePx = pointInPolygon(intent.pointer, polygon)
        ? 0
        : distanceToPolygonEdges(intent.pointer, polygon)
      const excitement = easeInteraction(
        proximityExcitement(
          distancePx,
          this.settings.mergeSplit.proximityPx,
          this.settings.mergeSplit.activeZonePx,
        ),
        this.settings.mergeSplit.vibrationEasing,
      )
      if (excitement <= 0) continue
      this.setInteractionEffect(candidate.id, {
        wallJitterPx:
          this.reducedMotion || intent.targetId
            ? 0
            : this.settings.mergeSplit.wallJitterAmplitudePx * excitement,
        frequencyHz: this.settings.mergeSplit.wallJitterFrequencyHz,
        tint: this.settings.mergeSplit.activeZoneTint * excitement,
        grainBoost:
          1 + (this.settings.mergeSplit.activeZoneGrain - 1) * excitement,
      })
    }

    if (!intent.candidateId || intent.candidateSince === null) return
    const vibration = mergeVibrationState({
      elapsedMs: (time - intent.candidateSince) * 1000,
      dwellMs: this.settings.mergeSplit.mergeDwellMs,
      attackMs: this.settings.mergeSplit.vibrationAttackMs,
      easing: this.settings.mergeSplit.vibrationEasing,
      stickySlowdown: this.settings.mergeSplit.stickySlowdown,
      reducedMotion: this.reducedMotion,
    })
    const frequency = this.settings.mergeSplit.cellJitterFrequencyHz * vibration.frequencyScale
    for (const cellId of [source.id, intent.candidateId]) {
      this.setInteractionEffect(cellId, {
        cellJitterPx:
          this.settings.mergeSplit.cellJitterAmplitudePx * vibration.amplitude,
        wallJitterPx:
          this.settings.mergeSplit.wallJitterAmplitudePx * vibration.amplitude,
        frequencyHz: frequency,
      })
      const synchronized = this.interactionEffects.get(cellId)
      if (synchronized) synchronized.frequencyHz = frequency
    }
  }

  private applyInteractionEffect(
    points: readonly Point2[],
    cellId: string,
    time: number,
  ) {
    const effect = this.interactionEffects.get(cellId)
    if (
      !effect ||
      (effect.cellJitterPx <= 0.001 && effect.wallJitterPx <= 0.001)
    ) {
      return points.map((point) => ({ ...point }))
    }
    const center = polygonCentroid(points)
    const groupCue =
      this.activeGroupCue?.cellId === cellId ? this.activeGroupCue : null
    const phase = groupCue
      ? groupCuePhase(
          time - groupCue.oscillatorStartedAt,
          this.settings.group.cueFrequencyHz,
          0,
        )
      : groupCuePhase(
          time - effect.phaseStartedAt,
          effect.frequencyHz,
          effect.phaseOffset,
        )
    const translation = {
      x: Math.sin(phase) * effect.cellJitterPx,
      y: Math.cos(phase * 0.93) * effect.cellJitterPx * 0.72,
    }
    return points.map((point, index) => {
      const dx = point.x - center.x
      const dy = point.y - center.y
      const magnitude = Math.hypot(dx, dy) || 1
      const wallOffset =
        Math.sin(phase + (index / Math.max(1, points.length)) * Math.PI * 10) *
        effect.wallJitterPx
      return {
        x: point.x + translation.x + (dx / magnitude) * wallOffset,
        y: point.y + translation.y + (dy / magnitude) * wallOffset,
      }
    })
  }

  private render(time: number) {
    if (this.destroyed) return
    // Preserve roughly real-time convergence when rendering is throttled by
    // shader work or a busy/mobile CPU. Smooth/default easing clamps its
    // response internally, while the wider cap prevents a low frame rate from
    // stretching a short wall settle into many seconds of visible drift.
    const delta = this.lastFrameTime === 0 ? 1 / 60 : Math.min(0.1, time - this.lastFrameTime)
    this.lastFrameTime = time
    this.updateFieldBounds()
    this.updateMergeLongPress(time)
    this.updateGroupAttachDwell(time * 1000)
    this.updateGroupDetachDwell(time * 1000)
    this.updateInteractionEffects(time)
    this.updateGroupGhostSlot(delta)
    this.applyGroupAttraction(delta)
    this.updateIncubation(time * 1000)
    const expiryNowMs = Date.now()
    this.updateSeedExpiry(expiryNowMs)
    if (this.autoGrowth && time >= this.nextSeedAt) {
      this.spawnSeed(time)
      this.nextSeedAt = time + this.nextSeedDelay() / 1000
    }
    this.renderField()

    const allCells: Array<CellEntity | PreviewCell> = this.state.preview
      ? [...this.model.cells, this.state.preview]
      : this.model.cells
    const textRequirements = new Map<string, number>()
    const totalRequiredArea = this.model.cells.reduce((sum, cell) => {
      const text = this.minimumDisplayTextForCell(cell)
      if (!text || cell.kind === 'seed') return sum
      const required = measureTextRequirement(
        text,
        this.settings.geometry.textInset,
        10,
      ).area
      textRequirements.set(cell.id, required)
      return sum + required
    }, 0)
    // Group walls consume a meaningful share of a small field. Include that
    // structural overhead in the global text budget so an impossible mobile
    // layout degrades by uniformly reducing type, not by letting labels cross
    // cell and group boundaries.
    const textAreaFactor = this.model.groups.length > 0 ? 0.46 : 0.78
    const availableTextArea = Math.PI * this.fieldRadius * this.fieldRadius * textAreaFactor
    const measuredCrowdingScale =
      totalRequiredArea > 0 ? Math.min(1, availableTextArea / totalRequiredArea) : 1
    const reservingCellSpace =
      Boolean(this.state.preview) ||
      this.model.cells.some(
        (cell) =>
          cell.kind === 'journal' && this.displayTextForCell(cell).trim() === '',
      )
    // Adding a cell is a real layout constraint, not a decorative overlay.
    // Temporarily relax existing copy floors so neighboring sites can yield a
    // usable pocket. Extremely constrained labels use the truncation path in
    // text-layout while their full model text remains untouched.
    this.crowdingScale = Math.min(
      measuredCrowdingScale,
      reservingCellSpace ? (this.state.preview ? 0.12 : 0.18) : 1,
    )
    const minimumFontSize = Math.max(3.25, 10 * Math.sqrt(this.crowdingScale))
    const weightedSites = new Map<string, WeightedSite>()
    const activeMergeTargetId =
      this.state.gesture?.kind === 'merge'
        ? this.state.gesture.targetId
        : this.state.gesture
          ? this.mergeIntentFor(this.state.gesture)?.targetId ?? null
          : null
    const activeMergeSourceId =
      activeMergeTargetId && this.state.gesture && 'cellId' in this.state.gesture
        ? this.state.gesture.cellId
        : null
    const activeMergeTarget = activeMergeTargetId
      ? allCells.find((cell) => cell.id === activeMergeTargetId)
      : undefined
    const activeAttachGesture =
      this.state.gesture?.kind === 'move' && this.state.gesture.attachArmedGroupId
        ? this.state.gesture
        : null
    const activeAttachGroup = activeAttachGesture
      ? this.model.groups.find(
          (group) => group.id === activeAttachGesture.attachArmedGroupId,
        )
      : undefined

    for (const cell of allCells) {
      let pixel = this.pixelFromSite(cell.site)
      // Two coincident power sites are mathematically unable to own two cells:
      // tiny feedback changes would make ownership alternate frame-to-frame.
      // Once the merge dwell has completed, keep a small deterministic
      // "welcome corridor" between the dragged source and target. This is a
      // rendering-space power-site constraint, not a CSS transform; both
      // polygons and their shared seams are recomputed from these sites.
      if (cell.id === activeMergeSourceId && activeMergeTarget) {
        const targetPixel = this.pixelFromSite(activeMergeTarget.site)
        const intent = this.state.gesture
          ? this.mergeIntentFor(this.state.gesture)
          : undefined
        const originPixel = intent
          ? this.pixelFromSite(intent.origin)
          : { x: targetPixel.x - 1, y: targetPixel.y }
        const towardTarget = {
          x: targetPixel.x - originPixel.x,
          y: targetPixel.y - originPixel.y,
        }
        const magnitude = Math.hypot(towardTarget.x, towardTarget.y) || 1
        const minimumSeparation = Math.max(
          28,
          this.settings.seed.stickyNeckPx * 3.5,
        )
        if (distance(pixel, targetPixel) < minimumSeparation) {
          pixel = {
            x: targetPixel.x - (towardTarget.x / magnitude) * minimumSeparation,
            y: targetPixel.y - (towardTarget.y / magnitude) * minimumSeparation,
          }
        }
      }
      if (cell.id === activeAttachGesture?.cellId && activeAttachGroup) {
        const groupPixel = this.pixelFromSite(activeAttachGroup.container.site)
        const dx = pixel.x - groupPixel.x
        const dy = pixel.y - groupPixel.y
        const magnitude = Math.hypot(dx, dy) || 1
        const minimumSeparation = Math.max(
          24,
          this.settings.seed.stickyNeckPx * 3,
        )
        if (distance(pixel, groupPixel) < minimumSeparation) {
          pixel = {
            x: groupPixel.x + (dx / magnitude) * minimumSeparation,
            y: groupPixel.y + (dy / magnitude) * minimumSeparation,
          }
        }
      }
      const visual = this.visuals.get(cell.id)
      const attackSeconds = Math.max(0.04, this.settings.motion.hoverAttackMs / 1000)
      const hoverTarget = cell.id === this.state.hoveredId ? 1 : 0
      if (visual) {
        visual.hoverMix +=
          (hoverTarget - visual.hoverMix) * Math.min(1, delta / attackSeconds)
        if (Math.abs(hoverTarget - visual.hoverMix) < 0.02) {
          visual.hoverMix = hoverTarget
        }
      }
      const hoverMix = visual?.hoverMix ?? 0
      const phase = (time * 1000 * Math.PI * 2) / Math.max(100, this.settings.motion.hoverPeriodMs)
      const popMultiplier =
        cell.kind === 'seed' && cell.id === this.state.hoveredId
          ? this.settings.seed.popScale
          : 1
      const breathScale =
        1 +
        (this.reducedMotion
          ? this.settings.motion.hoverAmplitude * 0.2 * hoverMix
          : this.settings.motion.hoverAmplitude * Math.sin(phase) * hoverMix)
      const clusterPulse = this.clusteringWave
        ? Math.sin(time * 5.4 + cell.creation.order * 0.83) *
          (this.reducedMotion ? 0.002 : 0.018)
        : 0
      const estimatedCellSpan = Math.max(
        48,
        this.fieldRadius * Math.sqrt(Math.max(0.002, cell.weight)) * 2,
      )
      const ambientPulse =
        cell.kind === 'journal' &&
        cell.id !== this.state.editingId &&
        !this.state.gesture &&
        !this.clusteringWave
          ? ambientScaleOffset(
              cell.creation.order,
              time,
              estimatedCellSpan,
              {
                enabled: this.settings.motion.ambientEnabled,
                amplitudePx: this.settings.motion.ambientAmplitudePx,
                periodMs: this.settings.motion.ambientPeriodMs,
                phaseSpread: this.settings.motion.ambientPhaseSpread,
                coverage: this.settings.motion.ambientCoverage,
              },
              this.reducedMotion,
            )
          : 0
      const ambientTravelPx = ambientPulse * estimatedCellSpan
      if (ambientTravelPx !== 0) {
        const travelAngle = cell.creation.order * 2.399963229728653
        pixel = {
          x: pixel.x + Math.cos(travelAngle) * ambientTravelPx,
          y: pixel.y + Math.sin(travelAngle) * ambientTravelPx,
        }
      }
      const combinedScale =
        cell.kind === 'seed'
          ? popMultiplier + clusterPulse
          : 1 + (breathScale - 1) + clusterPulse + ambientPulse
      this.breathScales.set(cell.id, combinedScale)

      let weight = cell.weight
      const seed = this.seedRuntime.get(cell.id)
      if (seed) {
        const progress = clamp(
          ((time - seed.bornAt) * 1000) / Math.max(1, this.settings.seed.growthMs),
          0,
          1,
        )
        weight =
          seed.startWeight +
          (seed.targetWeight - seed.startWeight) * ease(progress, this.settings.seed.easing)
      }
      if (cell.kind === 'seed') {
        const expiryVisual = seedExpiryVisualState(
          cell.expiry,
          expiryNowMs,
          this.settings.seed.expiryShrinkMs,
        )
        weight =
          Math.max(0.000001, weight + (combinedScale - 1) * 0.0015) *
          expiryVisual.scale
        weightedSites.set(cell.id, {
          id: cell.id,
          x: pixel.x,
          y: pixel.y,
          weight: weight * this.fieldRadius * this.fieldRadius,
        })
        continue
      }
      weight += (combinedScale - 1) * 0.055
      if (this.state.selectedCellIds.includes(cell.id)) weight += 0.003
      if (cell.id === activeMergeTargetId) weight += 0.024
      const requiredArea = (textRequirements.get(cell.id) ?? 0) * this.crowdingScale
      const requiredWeight =
        requiredArea > 0
          ? requiredArea / Math.max(1, Math.PI * this.fieldRadius * this.fieldRadius) +
            0.004
          : 0
      const textBoost = this.textWeightBoost.get(cell.id) ?? 0
      weight = Math.max(
        weight,
        requiredWeight + (reservingCellSpace ? Math.min(0.012, textBoost) : textBoost),
      )
      weightedSites.set(cell.id, {
        id: cell.id,
        x: pixel.x,
        y: pixel.y,
        weight: weight * this.fieldRadius * this.fieldRadius,
      })
    }

    const boundary = circlePolygon(this.fieldCenter, this.fieldRadius, 128)
    const topLevelSites: WeightedSite[] = []
    for (const cell of allCells) {
      if (!cell.groupId) {
        const site = weightedSites.get(cell.id)
        if (site) topLevelSites.push(site)
      }
    }
    for (const group of this.model.groups) {
      const pixel = this.pixelFromSite(group.container.site)
      topLevelSites.push({
        id: `group-container:${group.id}`,
        x: pixel.x,
        y: pixel.y,
        weight:
          (group.container.weight +
            (group.id === activeAttachGroup?.id ? 0.018 : 0)) *
          this.fieldRadius *
          this.fieldRadius,
      })
    }
    // A low-weight site placed at a seam can be completely hidden by the
    // neighbouring weighted sites. Give seeds only the extra display weight
    // required to carve a small cell around their own site. The document
    // weight remains unchanged, so promotion/history semantics do not drift.
    const nonSeedTopLevelSites = topLevelSites.filter(
      (site) => this.findCell(site.id)?.kind !== 'seed',
    )
    for (const seedSite of topLevelSites) {
      const seedCell = this.findCell(seedSite.id)
      if (seedCell?.kind !== 'seed' || nonSeedTopLevelSites.length === 0) continue
      let dominantInfluence = Number.NEGATIVE_INFINITY
      let dominantDistance = 0
      for (const competitor of nonSeedTopLevelSites) {
        const competitorDistance = Math.hypot(
          seedSite.x - competitor.x,
          seedSite.y - competitor.y,
        )
        const influenceAtSeed =
          competitor.weight - competitorDistance * competitorDistance
        if (influenceAtSeed > dominantInfluence) {
          dominantInfluence = influenceAtSeed
          dominantDistance = competitorDistance
        }
      }
      const runtime = this.seedRuntime.get(seedCell.id)
      const growthProgress = runtime
        ? ease(
            clamp(
              ((time - runtime.bornAt) * 1000) / Math.max(1, this.settings.seed.growthMs),
              0,
              1,
            ),
            this.settings.seed.easing,
          )
        : 1
      const expiryScale = seedExpiryVisualState(
        seedCell.expiry,
        expiryNowMs,
        this.settings.seed.expiryShrinkMs,
      ).scale
      const desiredRadius =
        Math.max(3, this.settings.geometry.seamGap * 0.4 + 1) *
        (0.72 + growthProgress * 0.68) *
        expiryScale
      if (desiredRadius > 0) {
        seedSite.weight = Math.max(
          seedSite.weight,
          dominantInfluence +
            2 * dominantDistance * desiredRadius +
            desiredRadius * desiredRadius,
        )
      }
    }
    const topLevelCells = computePowerDiagram(topLevelSites, {
      width: this.width,
      height: this.height,
      boundary,
    })
    const cellGeometries: Array<{ cell: CellEntity | PreviewCell; polygon: Point2[] }> = []
    const groupGeometries = new Map<string, Point2[]>()
    this.groupInnerPolygons.clear()
    this.groupContainerPolygons.clear()

    for (const powerCell of topLevelCells) {
      if (powerCell.site.id.startsWith('group-container:')) {
        const groupId = powerCell.site.id.slice('group-container:'.length)
        const group = this.model.groups.find((candidate) => candidate.id === groupId)
        if (!group || powerCell.polygon.length < 3) continue
        const wallCenterline = insetConvexPolygon(
          powerCell.polygon,
          this.settings.geometry.seamGap / 2 + this.settings.group.wallThickness / 2,
        )
        const wallPolygon = roundedPolygon(
          wallCenterline,
          this.settings.geometry.cornerRadius + 8,
          5,
        )
        groupGeometries.set(group.id, wallPolygon)
        this.groupContainerPolygons.set(group.id, powerCell.polygon.map((point) => ({ ...point })))
        const innerBoundary = insetConvexPolygon(
          powerCell.polygon,
          this.settings.geometry.seamGap / 2 +
            this.settings.group.wallThickness +
            this.settings.group.wallGap,
        )
        if (innerBoundary.length < 3 || polygonArea(innerBoundary) < 300) continue
        this.groupInnerPolygons.set(group.id, innerBoundary.map((point) => ({ ...point })))
        const members = group.memberIds
          .map((id) => allCells.find((cell) => cell.id === id))
          .filter((cell): cell is CellEntity | PreviewCell => Boolean(cell))
        const memberSites = members
          .map((cell) => weightedSites.get(cell.id))
          .filter((site): site is WeightedSite => Boolean(site))
          .map((site) => ({ ...site }))
        const ghost =
          this.groupGhostSlot?.groupId === group.id &&
          this.groupGhostSlot.strength > 0.001
            ? this.groupGhostSlot
            : null
        if (ghost) {
          const ghostPixel = this.pixelFromSite(ghost.site)
          const repulsionRadius = Math.max(1, this.settings.group.ghostSizePx * 2.5)
          for (const site of memberSites) {
            if (site.id === this.activeGroupCue?.cellId) continue
            let dx = site.x - ghostPixel.x
            let dy = site.y - ghostPixel.y
            let magnitude = Math.hypot(dx, dy)
            if (magnitude < 0.001) {
              const member = members.find((candidate) => candidate.id === site.id)
              const angle = (member?.creation.order ?? 1) * 2.399963229728653
              dx = Math.cos(angle)
              dy = Math.sin(angle)
              magnitude = 1
            }
            const proximity = clamp(1 - magnitude / repulsionRadius, 0, 1)
            const push =
              proximity *
              this.settings.group.ghostRepulsion *
              this.settings.group.ghostSizePx *
              ghost.strength
            site.x += (dx / magnitude) * push
            site.y += (dy / magnitude) * push
          }
          memberSites.push({
            id: `group-ghost:${group.id}`,
            x: ghostPixel.x,
            y: ghostPixel.y,
            weight:
              this.settings.group.ghostSizePx *
              this.settings.group.ghostSizePx *
              ghost.strength,
          })
        }
        const internalCells = computePowerDiagram(memberSites, {
          width: this.width,
          height: this.height,
          boundary: innerBoundary,
        })
        for (const internal of internalCells) {
          const cell = members.find((candidate) => candidate.id === internal.site.id)
          if (cell) cellGeometries.push({ cell, polygon: internal.polygon })
        }
      } else {
        const cell = allCells.find((candidate) => candidate.id === powerCell.site.id)
        if (cell) cellGeometries.push({ cell, polygon: powerCell.polygon })
      }
    }
    const activeIds = new Set<string>()

    for (const { cell, polygon } of cellGeometries) {
      if (polygon.length < 3) continue
      const preview = 'preview' in cell
      const visual = this.ensureVisual(cell, preview)
      const seed = cell.kind === 'seed'
      const gapped = insetConvexPolygon(
        polygon,
        this.settings.geometry.seamGap / 2,
      )
      const rounded = seed
        ? roundedPolygon(gapped, Math.min(4, this.settings.geometry.cornerRadius), 3)
        : roundedPolygon(gapped, this.settings.geometry.cornerRadius, 5)
      if (rounded.length < 3) continue
      activeIds.add(cell.id)
      visual.preview = preview
      const stablePoints = stableSamplePolygon(
        rounded,
        SAMPLE_COUNT,
        visual.targetPoints,
      )
      const stableInnerPoints = stableSamplePolygon(
        rounded,
        SAMPLE_COUNT,
        visual.targetInnerPoints,
      )
      visual.targetPoints = this.applyInteractionEffect(stablePoints, cell.id, time)
      visual.targetInnerPoints = this.applyInteractionEffect(
        stableInnerPoints,
        cell.id,
        time,
      )
      visual.targetOpacity = preview
        ? 0.82
        : seed
          ? seedExpiryVisualState(
              cell.expiry,
              expiryNowMs,
              this.settings.seed.expiryShrinkMs,
            ).opacity
          : 1
      const requiredArea = (textRequirements.get(cell.id) ?? 0) * this.crowdingScale
      const actualArea = polygonArea(rounded)
      const deficit =
        requiredArea > 0 ? clamp((requiredArea - actualArea) / requiredArea, 0, 1) : 0
      const previousBoost = this.textWeightBoost.get(cell.id) ?? 0
      const previousFit = this.textRequirementState.get(cell.id)?.fits
      const fitPressure = previousFit === false && requiredArea > 0 ? 0.04 : 0
      const hysteresisPressure =
        requiredArea > 0 && actualArea < requiredArea * 1.3 ? previousBoost : 0
      const targetBoost = Math.max(deficit * 0.12, fitPressure, hysteresisPressure)
      const boundedTargetBoost = reservingCellSpace
        ? Math.min(0.012, targetBoost)
        : targetBoost
      this.textWeightBoost.set(
        cell.id,
        previousBoost + (boundedTargetBoost - previousBoost) * Math.min(1, delta * 8),
      )
      this.updateVisual(
        visual,
        cell,
        delta,
        minimumFontSize,
        requiredArea,
        actualArea,
      )
    }

    this.removeInactiveVisuals(activeIds, delta)
    this.renderGroups(delta, groupGeometries, time)
    this.renderRelationships(time)
    this.renderHandles()
    this.updateEditorLayout()
    this.updateCanvasState()
    this.callbacks.onWallFrame?.({
      time,
      width: this.width,
      height: this.height,
      field: { center: { ...this.fieldCenter }, radius: this.fieldOuterRadius },
      cells: [...this.visuals.entries()]
        .filter(([, visual]) => !visual.preview && visual.currentPoints.length >= 3)
        .map(([id, visual]) => ({
          id,
          points: visual.currentPoints.map((point) => ({ ...point })),
          grainBoost: this.interactionEffects.get(id)?.grainBoost ?? 1,
        })),
      groups: [...this.groupVisuals.entries()]
        .filter(([, visual]) => visual.currentPoints.length >= 3)
        .map(([id, visual]) => ({
          id,
          points: visual.currentPoints.map((point) => ({ ...point })),
          color:
            this.model.groups.find((group) => group.id === id)?.style.tint ||
            this.settings.palette.groupTint,
          strokeBoost:
            this.activeGroupCue?.groupId === id
              ? this.settings.group.cueStrokeExcitation *
                this.activeGroupCue.strength
              : 0,
        })),
    })
    this.notifyCanvasChanged()
  }

  private notifyCanvasChanged() {
    if (!this.callbacks.onCanvasChanged) return
    let checksum = 2166136261
    let timeDynamic = Boolean(
      this.state.gesture ||
        this.state.hoveredId ||
        this.clusteringWave ||
        (this.settings.motion.ambientEnabled &&
          this.settings.motion.ambientAmplitudePx > 0 &&
          this.settings.motion.ambientCoverage > 0 &&
          !this.reducedMotion),
    )
    let dynamic = timeDynamic
    const mix = (value: number, precision = 0.5) => {
      checksum = Math.imul(checksum ^ Math.round(value * precision), 16777619) >>> 0
    }
    const mixText = (value: string) => {
      for (let index = 0; index < value.length; index += 1) mix(value.charCodeAt(index))
    }
    mix(this.width, 1)
    mix(this.height, 1)
    mix(this.fieldOuterRadius, 1)
    mix(this.sourceDirtyToken, 1)
    mixText(this.state.selectedCellId ?? '')
    for (const id of this.state.selectedCellIds) mixText(id)
    mixText(this.state.selectedGroupId ?? '')
    mixText(this.state.editingId ?? '')
    for (const [id, visual] of this.visuals) {
      mixText(id)
      if (
        Math.abs(visual.fillPath.opacity - visual.targetOpacity) > 0.01 ||
        visual.currentPoints.some(
          (point, index) =>
            distance(point, visual.targetPoints[index] ?? point) > 0.12,
        )
      ) {
        dynamic = true
      }
      for (let index = 0; index < visual.currentPoints.length; index += 4) {
        mix(visual.currentPoints[index].x)
        mix(visual.currentPoints[index].y)
      }
      mix(visual.fillPath.opacity, 100)
      mix(visual.label.visible ? 1 : 0, 1)
      mix(visual.label.opacity, 100)
      for (const line of visual.lineLabels) {
        mixText(line.content)
        mix(line.point.x)
        mix(line.point.y)
        mix(Number(line.fontSize), 100)
      }
    }
    for (const [id, visual] of this.groupVisuals) {
      mixText(id)
      if (
        visual.path.opacity < 0.99 ||
        visual.currentPoints.some(
          (point, index) =>
            distance(point, visual.targetPoints[index] ?? point) > 0.12,
        )
      ) {
        dynamic = true
      }
      for (let index = 0; index < visual.currentPoints.length; index += 4) {
        mix(visual.currentPoints[index].x)
        mix(visual.currentPoints[index].y)
      }
      mix(visual.path.opacity, 100)
      mix(visual.path.strokeWidth, 100)
    }
    for (const handle of this.handlePositions) {
      mix(handle.x)
      mix(handle.y)
    }
    for (const cell of this.model.cells) {
      if (
        cell.incubation.state === 'incubating' &&
        cell.incubation.startedAtMs !== undefined &&
        this.lastFrameTime * 1000 - cell.incubation.startedAtMs <
          this.settings.seed.incubationGrowthMs
      ) {
        timeDynamic = true
        dynamic = true
      }
      if (cell.expiry.state === 'shrinking') {
        timeDynamic = true
        dynamic = true
      }
      if (
        cell.kind === 'seed' &&
        cell.expiry.state === 'scheduled' &&
        cell.expiry.createdAtMs !== undefined &&
        Date.now() - cell.expiry.createdAtMs >= cell.expiry.timeoutMs * 0.68
      ) {
        timeDynamic = true
        dynamic = true
      }
    }
    for (const runtime of this.seedRuntime.values()) {
      if (
        (this.lastFrameTime - runtime.bornAt) * 1000 <
        this.settings.seed.growthMs
      ) {
        timeDynamic = true
        dynamic = true
      }
    }
    this.lastCanvasDynamic = dynamic
    if (checksum === this.lastCanvasChecksum && !dynamic) return
    this.lastCanvasChecksum = checksum
    this.canvasNotificationCount += 1
    this.callbacks.onCanvasChanged(this.getFieldBounds(), dynamic)
  }

  private renderField() {
    this.canvas.style.backgroundColor = this.settings.palette.exterior
    this.fieldPath.position = new this.scope.Point(this.fieldCenter.x, this.fieldCenter.y)
    this.fieldPath.bounds.width = this.fieldOuterRadius * 2
    this.fieldPath.bounds.height = this.fieldOuterRadius * 2
    this.fieldPath.fillColor = new this.scope.Color(this.settings.palette.interior)
    this.seamPath.position = new this.scope.Point(this.fieldCenter.x, this.fieldCenter.y)
    this.seamPath.bounds.width = this.fieldRadius * 2
    this.seamPath.bounds.height = this.fieldRadius * 2
    this.seamPath.fillColor = new this.scope.Color(this.settings.palette.seam)
  }

  private ensureVisual(cell: CellEntity | PreviewCell, preview: boolean) {
    const existing = this.visuals.get(cell.id)
    if (existing) return existing
    const pixel = this.pixelFromSite(cell.site)
    const startPoints = Array.from({ length: SAMPLE_COUNT }, () => ({ ...pixel }))

    this.cellsLayer.activate()
    const fillPath = new this.scope.Path({
      closed: true,
      fillColor: this.cellBaseColor(cell),
      opacity: 0,
    })
    const strokeClipPath = new this.scope.Path({
      closed: true,
      fillColor: '#ffffff',
      clipMask: true,
    })
    const innerPath = new this.scope.Path({
      closed: true,
      fillColor: null,
      strokeColor: this.settings.palette.innerStroke,
      strokeWidth: this.settings.geometry.innerStrokeWidth * 2,
      strokeJoin: 'round',
      strokeCap: 'round',
      opacity: 0,
    })
    for (const point of startPoints) {
      fillPath.add(new this.scope.Point(point.x, point.y))
      strokeClipPath.add(new this.scope.Point(point.x, point.y))
      innerPath.add(new this.scope.Point(point.x, point.y))
    }
    const strokeGroup = new this.scope.Group([strokeClipPath, innerPath])
    strokeGroup.clipped = true
    fillPath.data = { kind: 'cell', cellId: cell.id } satisfies ItemData
    innerPath.data = { kind: 'cell', cellId: cell.id } satisfies ItemData

    this.labelsLayer.activate()
    const label = new this.scope.Group()
    label.pivot = new this.scope.Point(pixel.x, pixel.y)
    label.position = new this.scope.Point(pixel.x, pixel.y)
    label.opacity = 0
    label.data = { kind: 'label', cellId: cell.id } satisfies ItemData
    const caretPath = new this.scope.Path.Line({
      from: [pixel.x, pixel.y - 6],
      to: [pixel.x, pixel.y + 6],
      strokeColor: this.settings.palette.text,
      strokeWidth: 1.35,
      strokeCap: 'round',
      visible: false,
    })
    caretPath.data = { kind: 'label', cellId: cell.id } satisfies ItemData
    label.addChild(caretPath)

    const visual: CellVisual = {
      fillPath,
      innerPath,
      strokeClipPath,
      strokeGroup,
      label,
      lineLabels: [],
      caretPath,
      currentPoints: startPoints.map((point) => ({ ...point })),
      targetPoints: startPoints.map((point) => ({ ...point })),
      currentInnerPoints: startPoints.map((point) => ({ ...point })),
      targetInnerPoints: startPoints.map((point) => ({ ...point })),
      velocities: startPoints.map(() => ({ x: 0, y: 0 })),
      innerVelocities: startPoints.map(() => ({ x: 0, y: 0 })),
      targetOpacity: preview ? 0.82 : 1,
      preview,
      hoverMix: 0,
      lineBreakKey: '',
      pendingLineBreakKey: '',
      pendingLineBreakFrames: 0,
      textLayoutEngine: 'fallback',
      textEffectScale: 1,
      displayVariant: 'M',
    }
    this.visuals.set(cell.id, visual)
    return visual
  }

  private updateVisual(
    visual: CellVisual,
    cell: CellEntity | PreviewCell,
    delta: number,
    minimumFontSize: number,
    requiredArea: number,
    actualArea: number,
  ) {
    this.interpolatePoints(
      visual.currentPoints,
      visual.targetPoints,
      visual.velocities,
      delta,
    )
    this.interpolatePoints(
      visual.currentInnerPoints,
      visual.targetInnerPoints,
      visual.innerVelocities,
      delta,
    )
    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      visual.fillPath.segments[index].point.set(
        visual.currentPoints[index].x,
        visual.currentPoints[index].y,
      )
      visual.innerPath.segments[index].point.set(
        visual.currentInnerPoints[index].x,
        visual.currentInnerPoints[index].y,
      )
      visual.strokeClipPath.segments[index].point.set(
        visual.currentPoints[index].x,
        visual.currentPoints[index].y,
      )
    }

    const opacityResponse = Math.min(1, delta * 15)
    visual.fillPath.opacity +=
      (visual.targetOpacity - visual.fillPath.opacity) * opacityResponse
    visual.innerPath.opacity = visual.fillPath.opacity
    visual.label.opacity = visual.fillPath.opacity
    visual.fillPath.fillColor = this.cellDisplayColor(cell, visual)
    visual.innerPath.strokeColor = new this.scope.Color(
      visual.preview ? this.settings.palette.hoverTint : this.settings.palette.innerStroke,
    )
    visual.innerPath.strokeWidth = visual.preview
      ? Math.max(2, this.settings.geometry.innerStrokeWidth * 2)
      : this.settings.geometry.innerStrokeWidth * 2
    visual.innerPath.strokeJoin = 'round'
    visual.innerPath.strokeCap = 'round'
    visual.innerPath.dashArray = []
    visual.fillPath.data = { kind: 'cell', cellId: cell.id } satisfies ItemData
    visual.innerPath.data = { kind: 'cell', cellId: cell.id } satisfies ItemData

    const effectiveTextInset = Math.max(
      4,
      this.settings.geometry.textInset * Math.sqrt(this.crowdingScale),
    )
    const editingText = this.displayTextForCell(cell)
    const isEditingPlaceholder =
      this.state.editingId === cell.id && editingText.trim().length === 0
    let displayText = isEditingPlaceholder
      ? reflectiveContentProvider.manualGhostPrompt(cell.creation.order)
      : editingText
    let textLayout: WrappedTextLayout
    const canUseAdaptiveVariant =
      this.settings.adaptiveText.enabled &&
      !isEditingPlaceholder &&
      this.state.editingId !== cell.id &&
      cell.kind === 'journal' &&
      !('preview' in cell)
    if (canUseAdaptiveVariant) {
      const fitted = selectFittedTextVariant({
        canonical: cell.text,
        metadata: cell.textVariants,
        polygon: visual.currentPoints,
        safeInset: effectiveTextInset,
        minimumFontSize: Math.max(
          minimumFontSize,
          this.settings.adaptiveText.fitMinimumFontSize,
        ),
        hysteresis: this.settings.adaptiveText.fitHysteresis,
        previousLevel: visual.displayVariant,
      })
      displayText = fitted.text
      textLayout = fitted.layout
      visual.displayVariant = fitted.level
    } else {
      textLayout = layoutTextInPolygon(
        displayText,
        visual.currentPoints,
        effectiveTextInset,
        minimumFontSize,
      )
      visual.displayVariant = 'M'
    }
    visual.textLayoutEngine = textLayout.engine
    const nextLineKey =
      cell.kind === 'seed'
        ? ''
        : `${textLayout.fontSize}:${textLayout.lines.map((line) => line.text).join('\n')}`
    let applyLayout = nextLineKey === visual.lineBreakKey || visual.lineBreakKey === ''
    if (!applyLayout) {
      if (visual.pendingLineBreakKey === nextLineKey) {
        visual.pendingLineBreakFrames += 1
      } else {
        visual.pendingLineBreakKey = nextLineKey
        visual.pendingLineBreakFrames = 1
      }
      applyLayout = this.reducedMotion || visual.pendingLineBreakFrames >= 4
    }
    if (applyLayout) {
      visual.lineBreakKey = nextLineKey
      visual.pendingLineBreakKey = ''
      visual.pendingLineBreakFrames = 0
      this.ensureTextLines(visual, cell.kind === 'seed' ? 0 : textLayout.lines.length, cell.id)
      const positionResponse = Math.min(1, delta * this.settings.motion.morphResponse)
      const incubationWiggle =
        !this.reducedMotion &&
        cell.incubation.state === 'incubating' &&
        this.settings.seed.incubationWigglePx > 0
          ? (easeInteraction(
              (Math.sin(
                this.lastFrameTime *
                  Math.PI *
                  2 *
                  this.settings.seed.incubationWiggleHz +
                  cell.creation.order * 1.37,
              ) +
                1) /
                2,
              this.settings.seed.incubationWiggleEasing,
            ) -
              0.5) *
            2 *
            this.settings.seed.incubationWigglePx
          : 0
      for (let index = 0; index < visual.lineLabels.length; index += 1) {
        const lineLabel = visual.lineLabels[index]
        const line = textLayout.lines[index]
        lineLabel.content = line.text
        lineLabel.fontSize = textLayout.fontSize
        lineLabel.point.x +=
          (line.x + incubationWiggle - lineLabel.point.x) * positionResponse
        lineLabel.point.y +=
          (line.y + incubationWiggle * 0.35 - lineLabel.point.y) * positionResponse
      }
      visual.label.pivot = new this.scope.Point(textLayout.center.x, textLayout.center.y)
    }
    const incubationProgress =
      cell.incubation.state === 'incubating' && cell.incubation.startedAtMs !== undefined
        ? clamp(
            (this.lastFrameTime * 1000 - cell.incubation.startedAtMs) /
              Math.max(1, this.settings.seed.incubationGrowthMs),
            0,
            1,
          )
        : 1
    const emergenceScale =
      cell.incubation.state === 'incubating' ? 0.68 + smoothstep(incubationProgress) * 0.32 : 1
    visual.textEffectScale = emergenceScale
    visual.label.scaling = new this.scope.Point(1, 1)
    const textColor = new this.scope.Color(this.settings.palette.text)
    textColor.alpha =
      cell.incubation.state === 'incubating' ? 0.28 + incubationProgress * 0.58 : 1
    if (isEditingPlaceholder) textColor.alpha = 0.72
    for (const lineLabel of visual.lineLabels) {
      lineLabel.fillColor = textColor
      lineLabel.fontStyle = isEditingPlaceholder ? 'italic' : 'normal'
      lineLabel.scaling = new this.scope.Point(emergenceScale, emergenceScale)
      lineLabel.data = { kind: 'label', cellId: cell.id } satisfies ItemData
    }
    visual.label.opacity =
      visual.fillPath.opacity *
      (cell.incubation.state === 'incubating' ? 0.4 + incubationProgress * 0.6 : 1)
    visual.label.shadowColor =
      cell.incubation.state === 'incubating'
        ? new this.scope.Color(this.settings.palette.text)
        : null
    visual.label.shadowBlur =
      cell.incubation.state === 'incubating' ? this.settings.seed.incubationBlur : 0
    visual.label.visible =
      cell.kind !== 'seed' &&
      polygonArea(visual.currentPoints) > 1000 &&
      textLayout.fits &&
      this.state.editingId !== cell.id
    if (this.state.editingId === cell.id) {
      const editorTextLayout = layoutTextInPolygon(
        editingText,
        visual.currentPoints,
        effectiveTextInset,
        minimumFontSize,
      )
      const caret = caretPointForIndex(editorTextLayout, this.editingSelectionIndex)
      visual.caretPath.segments[0].point.set(caret.x, caret.top)
      visual.caretPath.segments[1].point.set(caret.x, caret.bottom)
      visual.caretPath.strokeColor = new this.scope.Color(this.settings.palette.text)
      visual.caretPath.opacity =
        this.reducedMotion || Math.sin(this.lastFrameTime * Math.PI * 2) > -0.25
          ? 0.92
          : 0.18
      // The active text is rendered by the geometrically aligned native
      // textarea so browser selection, caret, and spellcheck stay exact.
      visual.caretPath.visible = false
    } else {
      visual.caretPath.visible = false
    }
    visual.label.data = { kind: 'label', cellId: cell.id } satisfies ItemData
    this.textRequirementState.set(cell.id, {
      requiredArea,
      actualArea,
      fits: textLayout.fits,
    })
  }

  private ensureTextLines(visual: CellVisual, count: number, cellId: string) {
    while (visual.lineLabels.length > count) {
      visual.lineLabels.pop()?.remove()
    }
    while (visual.lineLabels.length < count) {
      const line = new this.scope.PointText({
        point: [visual.label.pivot.x, visual.label.pivot.y],
        content: '',
        fillColor: this.settings.palette.text,
        fontFamily: 'Helvetica Neue, Arial, sans-serif',
        fontSize: 14,
        fontWeight: '500',
        justification: 'center',
      })
      line.data = { kind: 'label', cellId } satisfies ItemData
      visual.label.addChild(line)
      visual.lineLabels.push(line)
    }
  }

  private interpolatePoints(
    current: Point2[],
    target: readonly Point2[],
    velocities: Point2[],
    delta: number,
    easingOverride?: 'smooth' | 'spring' | 'direct',
  ) {
    const motion = this.settings.motion
    const easing = easingOverride ?? motion.easing
    const direct = this.reducedMotion || easing === 'direct'
    const response = Math.min(1, delta * motion.morphResponse)
    for (let index = 0; index < current.length; index += 1) {
      if (direct) {
        current[index].x = target[index].x
        current[index].y = target[index].y
        velocities[index].x = 0
        velocities[index].y = 0
      } else if (easing === 'spring') {
        const springDelta = Math.min(delta, 0.05)
        velocities[index].x +=
          (target[index].x - current[index].x) * springDelta * 95
        velocities[index].y +=
          (target[index].y - current[index].y) * springDelta * 95
        const damping = Math.exp(-springDelta * 13)
        velocities[index].x *= damping
        velocities[index].y *= damping
        current[index].x += velocities[index].x
        current[index].y += velocities[index].y
      } else {
        current[index].x += (target[index].x - current[index].x) * response
        current[index].y += (target[index].y - current[index].y) * response
      }
    }
  }

  private removeInactiveVisuals(activeIds: Set<string>, delta: number) {
    for (const [id, visual] of this.visuals) {
      if (activeIds.has(id)) continue
      visual.targetOpacity = 0
      visual.fillPath.opacity +=
        (visual.targetOpacity - visual.fillPath.opacity) * Math.min(1, delta * 15)
      visual.innerPath.opacity = visual.fillPath.opacity
      visual.label.opacity = visual.fillPath.opacity
      if (visual.fillPath.opacity < 0.02) {
        visual.fillPath.remove()
        visual.strokeGroup.remove()
        visual.label.remove()
        this.visuals.delete(id)
        this.breathScales.delete(id)
      }
    }
  }

  private renderGroups(
    delta: number,
    geometries: ReadonlyMap<string, Point2[]>,
    time: number,
  ) {
    const active = new Set(this.model.groups.map((group) => group.id))
    for (const group of this.model.groups) {
      const geometry = geometries.get(group.id)
      if (!geometry || geometry.length < 3) continue
      const visual = this.ensureGroupVisual(group, geometry)
      const stablePoints = stableSamplePolygon(
        geometry,
        GROUP_SAMPLE_COUNT,
        visual.targetPoints,
      )
      const cue = this.activeGroupCue?.groupId === group.id
        ? this.activeGroupCue
        : null
      if (cue && !this.reducedMotion) {
        const center = polygonCentroid(stablePoints)
        const phase = groupCuePhase(
          time - cue.oscillatorStartedAt,
          this.settings.group.cueFrequencyHz,
          this.settings.group.cuePhaseOffset,
        )
        visual.targetPoints = stablePoints.map((point, index) => {
          const dx = point.x - center.x
          const dy = point.y - center.y
          const magnitude = Math.hypot(dx, dy) || 1
          const wave = Math.sin(
            phase + (index / Math.max(1, stablePoints.length)) * Math.PI * 8,
          )
          const offset =
            wave * this.settings.group.cueWallAmplitudePx * cue.strength
          return {
            x: point.x + (dx / magnitude) * offset,
            y: point.y + (dy / magnitude) * offset,
          }
        })
      } else {
        visual.targetPoints = stablePoints
      }
      this.interpolatePoints(
        visual.currentPoints,
        visual.targetPoints,
        visual.velocities,
        delta,
        this.settings.group.motionEasing,
      )
      for (let index = 0; index < GROUP_SAMPLE_COUNT; index += 1) {
        visual.path.segments[index].point.set(
          visual.currentPoints[index].x,
          visual.currentPoints[index].y,
        )
      }
      const tint = new this.scope.Color(group.style.tint || this.settings.palette.groupTint)
      tint.red = 0.72 + tint.red * 0.28
      tint.green = 0.72 + tint.green * 0.28
      tint.blue = 0.72 + tint.blue * 0.28
      const emergence = this.reducedMotion
        ? 1
        : clamp(
            (this.lastFrameTime * 1000 - visual.createdAtMs) /
              Math.max(1, this.settings.clustering.animationMs),
            0,
            1,
          )
      const easedEmergence = emergence * emergence * (3 - 2 * emergence)
      tint.alpha =
        (this.state.selectedGroupId === group.id ? 0.32 : 0.2) * easedEmergence
      visual.path.fillColor = tint
      visual.path.strokeColor = new this.scope.Color(
        group.style.tint || this.settings.palette.groupTint,
      )
      visual.path.strokeWidth =
        (this.settings.group.wallThickness +
          (this.state.selectedGroupId === group.id ? 3 : 0) +
          (cue
            ? this.settings.group.cueStrokeExcitation * cue.strength
            : 0)) *
        easedEmergence
      visual.path.opacity = easedEmergence
      visual.path.strokeJoin = 'round'
      visual.path.strokeCap = 'round'
      visual.path.dashArray = []
      visual.path.data = { kind: 'group-wall', groupId: group.id } satisfies ItemData
    }
    for (const [id, visual] of this.groupVisuals) {
      if (!active.has(id)) {
        visual.path.remove()
        this.groupVisuals.delete(id)
      }
    }
  }

  private ensureGroupVisual(group: GroupEntity, points: readonly Point2[]) {
    const existing = this.groupVisuals.get(group.id)
    if (existing) return existing
    const center = polygonCentroid(points)
    const start = Array.from({ length: GROUP_SAMPLE_COUNT }, () => ({ ...center }))
    this.groupLayer.activate()
    const path = new this.scope.Path({
      closed: true,
      fillColor: this.settings.palette.groupTint,
      strokeColor: this.settings.palette.groupTint,
      strokeWidth: this.settings.group.wallThickness,
      strokeJoin: 'round',
      strokeCap: 'round',
    })
    for (const point of start) path.add(new this.scope.Point(point.x, point.y))
    path.data = { kind: 'group-wall', groupId: group.id } satisfies ItemData
    const visual = {
      path,
      currentPoints: start.map((point) => ({ ...point })),
      targetPoints: start.map((point) => ({ ...point })),
      velocities: start.map(() => ({ x: 0, y: 0 })),
      createdAtMs: this.lastFrameTime * 1000,
    }
    this.groupVisuals.set(group.id, visual)
    return visual
  }

  private renderRelationships(time: number) {
    this.relationshipLayer.removeChildren()
    this.relationshipLayer.activate()
    this.stickyBridgeCount = 0
    if (!this.settings.seed.stickyEnabled) return
    for (const relationship of this.model.relationships) {
      const source = this.findCell(relationship.sourceId)
      const target = this.findCell(relationship.targetId)
      if (!source || !target || source.kind !== 'seed') continue
      this.drawStickyBridge(source, target, time, 0.78)
    }
    const mergeGesture = this.state.gesture
    const mergeIntent = mergeGesture ? this.mergeIntentFor(mergeGesture) : undefined
    const sourceId =
      mergeGesture && 'cellId' in mergeGesture ? mergeGesture.cellId : null
    const targetId =
      mergeGesture?.kind === 'merge' ? mergeGesture.targetId : mergeIntent?.targetId
    if (sourceId && targetId) {
      const source = this.findCell(sourceId)
      const target = this.findCell(targetId)
      if (source && target) {
        const strandCount =
          2 + Math.abs(source.creation.order * 31 + target.creation.order * 17) % 3
        this.drawStickyBridge(source, target, time, 1, undefined, strandCount)
      }
    }
    if (mergeGesture?.kind === 'move' && mergeGesture.attachArmedGroupId) {
      const source = this.findCell(mergeGesture.cellId)
      const group = this.model.groups.find(
        (candidate) => candidate.id === mergeGesture.attachArmedGroupId,
      )
      const sourceVisual = source ? this.visuals.get(source.id) : undefined
      const groupVisual = group ? this.groupVisuals.get(group.id) : undefined
      if (source && sourceVisual && group && groupVisual) {
        this.drawStickyPolygonBridge(
          sourceVisual.currentPoints,
          groupVisual.currentPoints,
          time,
          source.creation.order,
          group.order,
          1,
          group.style.tint,
          sourceVisual.innerPath.opacity,
          this.settings.group.attachDistancePx * 1.8,
        )
      }
    }
  }

  private drawStickyBridge(
    source: CellEntity,
    target: CellEntity,
    time: number,
    opacity: number,
    color = this.settings.palette.innerStroke,
    strandCount = 1,
  ) {
    const sourceVisual = this.visuals.get(source.id)
    const targetVisual = this.visuals.get(target.id)
    if (
      !sourceVisual ||
      !targetVisual ||
      sourceVisual.currentPoints.length < 3 ||
      targetVisual.currentPoints.length < 3
    ) {
      return
    }
    this.drawStickyPolygonBridge(
      sourceVisual.currentPoints,
      targetVisual.currentPoints,
      time,
      source.creation.order,
      target.creation.order,
      opacity,
      color,
      Math.min(sourceVisual.innerPath.opacity, targetVisual.innerPath.opacity),
      this.settings.seed.stickyDistancePx,
      source.kind === 'seed',
      strandCount,
    )
  }

  private drawStickyPolygonBridge(
    sourcePoints: readonly Point2[],
    targetPoints: readonly Point2[],
    time: number,
    sourceOrder: number,
    targetOrder: number,
    opacity: number,
    color: string,
    visualOpacity: number,
    maximumGap: number,
    sourceIsSeed = false,
    strandCount = 1,
  ) {
    if (sourcePoints.length < 3 || targetPoints.length < 3) return
    const sourceCenter = polygonCentroid(sourcePoints)
    const targetCenter = polygonCentroid(targetPoints)
    const centerDistance = distance(sourceCenter, targetCenter)
    if (centerDistance < 0.001) return
    const direction = {
      x: (targetCenter.x - sourceCenter.x) / centerDistance,
      y: (targetCenter.y - sourceCenter.y) / centerDistance,
    }
    const inverse = { x: -direction.x, y: -direction.y }
    const sourceEdge = rayPolygonIntersection(
      sourceCenter,
      direction,
      sourcePoints,
    )
    const targetEdge = rayPolygonIntersection(
      targetCenter,
      inverse,
      targetPoints,
    )
    const gap = distance(sourceEdge, targetEdge)
    if (gap > maximumGap) return
    const falloff = clamp(
      1 - gap / Math.max(1, maximumGap),
      0,
      1,
    )
    const sourceInset = Math.min(
      distance(sourceCenter, sourceEdge) * 0.82,
      Math.max(12, this.settings.seed.stickyNeckPx * 2.4),
    )
    const targetInset = Math.min(
      distance(targetCenter, targetEdge) * 0.82,
      Math.max(16, this.settings.seed.stickyNeckPx * 2.8),
    )
    const sourceAnchor = {
      x: sourceEdge.x - direction.x * sourceInset,
      y: sourceEdge.y - direction.y * sourceInset,
    }
    const targetAnchor = {
      x: targetEdge.x + direction.x * targetInset,
      y: targetEdge.y + direction.y * targetInset,
    }
    const perpendicular = { x: -direction.y, y: direction.x }
    const neckHalf =
      (this.settings.seed.stickyNeckPx *
        (0.3 + 0.7 * Math.pow(falloff, 0.65))) /
      2
    const tension = clamp(this.settings.seed.stickyTension, 0.05, 0.95)
    const count = sourceIsSeed ? 1 : Math.max(1, Math.min(4, strandCount))
    for (let strand = 0; strand < count; strand += 1) {
      const randomUnit = (salt: number) => {
        const value = Math.sin(
          (sourceOrder + 1) * 12.9898 +
            (targetOrder + 1) * 78.233 +
            (strand + 1) * 37.719 +
            salt,
        ) * 43758.5453
        return value - Math.floor(value)
      }
      const centeredStrand = count === 1 ? 0 : strand - (count - 1) / 2
      const strandOffset =
        centeredStrand *
        neckHalf *
        (1.3 + randomUnit(3.1) * 0.5)
      const widthScale = 0.68 + randomUnit(7.4) * 0.48
      const longitudinalVariation = (randomUnit(11.8) - 0.5) * neckHalf * 1.4
      const wobblePhase =
        time * this.settings.seed.stickyResponse * 0.12 +
        sourceOrder * 1.71 +
        targetOrder * 0.63 +
        strand * 0.92
      const wobble =
        Math.sin(wobblePhase) *
        this.settings.seed.stickyWobble *
        this.settings.seed.stickyNeckPx
      const variedSourceAnchor = {
        x:
          sourceAnchor.x +
          perpendicular.x * strandOffset -
          direction.x * longitudinalVariation,
        y:
          sourceAnchor.y +
          perpendicular.y * strandOffset -
          direction.y * longitudinalVariation,
      }
      const variedTargetAnchor = {
        x:
          targetAnchor.x +
          perpendicular.x * strandOffset +
          direction.x * longitudinalVariation,
        y:
          targetAnchor.y +
          perpendicular.y * strandOffset +
          direction.y * longitudinalVariation,
      }
      const sourceWidth = neckHalf * (sourceIsSeed ? 0.72 : 1) * widthScale
      const targetWidth = neckHalf * 1.22 * widthScale
      const sourceLeft = {
        x: variedSourceAnchor.x + perpendicular.x * (sourceWidth + wobble),
        y: variedSourceAnchor.y + perpendicular.y * (sourceWidth + wobble),
      }
      const sourceRight = {
        x: variedSourceAnchor.x - perpendicular.x * (sourceWidth - wobble),
        y: variedSourceAnchor.y - perpendicular.y * (sourceWidth - wobble),
      }
      const targetLeft = {
        x: variedTargetAnchor.x + perpendicular.x * targetWidth,
        y: variedTargetAnchor.y + perpendicular.y * targetWidth,
      }
      const targetRight = {
        x: variedTargetAnchor.x - perpendicular.x * targetWidth,
        y: variedTargetAnchor.y - perpendicular.y * targetWidth,
      }
      const handleDistance =
        (gap + sourceInset + targetInset) * tension * (0.9 + randomUnit(19.2) * 0.2)
      const path = new this.scope.Path({
        closed: true,
        fillColor: color,
        opacity:
          opacity *
          visualOpacity *
          (0.42 + falloff * 0.5) *
          (count > 1 ? 0.84 : 1),
      })
      path.moveTo(new this.scope.Point(sourceLeft.x, sourceLeft.y))
      path.cubicCurveTo(
        new this.scope.Point(
          sourceLeft.x + direction.x * handleDistance,
          sourceLeft.y + direction.y * handleDistance,
        ),
        new this.scope.Point(
          targetLeft.x - direction.x * handleDistance,
          targetLeft.y - direction.y * handleDistance,
        ),
        new this.scope.Point(targetLeft.x, targetLeft.y),
      )
      path.lineTo(new this.scope.Point(targetRight.x, targetRight.y))
      path.cubicCurveTo(
        new this.scope.Point(
          targetRight.x - direction.x * handleDistance,
          targetRight.y - direction.y * handleDistance,
        ),
        new this.scope.Point(
          sourceRight.x + direction.x * handleDistance,
          sourceRight.y + direction.y * handleDistance,
        ),
        new this.scope.Point(sourceRight.x, sourceRight.y),
      )
      path.closePath()
      this.stickyBridgeCount += 1
    }
  }

  private renderHandles() {
    this.handlePositions.length = 0
    this.handlesLayer.removeChildren()
    if (this.state.mode !== 'select' || this.state.editingId) return
    const selectedGroupId = this.state.selectedGroupId
    const selectedCellId = this.state.selectedCellId
    const handleCellId = selectedCellId ?? undefined
    const points = selectedGroupId
      ? this.groupVisuals.get(selectedGroupId)?.currentPoints
      : selectedCellId
        ? this.visuals.get(selectedCellId)?.currentPoints
        : undefined
    if (!points || points.length < 3) return
    const center = polygonCentroid(points)
    this.handlesLayer.activate()
    for (const direction of HANDLE_DIRECTIONS) {
      const position = rayPolygonIntersection(center, direction, points)
      const boundaryClearance =
        this.settings.geometry.seamGap / 2 + this.settings.geometry.innerStrokeWidth + 6
      if (
        distance(position, this.fieldCenter) >=
        this.fieldRadius - boundaryClearance
      ) {
        continue
      }
      this.handlePositions.push(position)
      const halo = new this.scope.Path.Circle({
        center: [position.x, position.y],
        radius: 10,
        fillColor: new this.scope.Color(1, 1, 1, 0.01),
      })
      halo.data = {
        kind: selectedGroupId ? 'group-handle' : 'handle',
        ...(selectedGroupId ? { groupId: selectedGroupId } : { cellId: handleCellId }),
        direction,
      } satisfies ItemData
      const handle = new this.scope.Path.Circle({
        center: [position.x, position.y],
        radius: 4.8,
        fillColor: this.settings.palette.handles,
        strokeColor: this.settings.palette.seam,
        strokeWidth: 1.2,
      })
      handle.data = {
        kind: selectedGroupId ? 'group-handle' : 'handle',
        ...(selectedGroupId ? { groupId: selectedGroupId } : { cellId: handleCellId }),
        direction,
      } satisfies ItemData
    }
  }

  private updateEditorLayout() {
    if (!this.state.editingId) return
    const visual = this.visuals.get(this.state.editingId)
    const cell = this.findCell(this.state.editingId)
    if (!visual || !cell) return
    const center = polygonCentroid(visual.currentPoints)
    const bounds = polygonBounds(visual.currentPoints)
    const safeRadius = Math.max(
      1,
      distanceToPolygonEdges(center, visual.currentPoints) -
        Math.max(2, this.settings.geometry.textInset * 0.18),
    )
    const safeSide =
      safeRadius *
      Math.SQRT2 *
      (this.editingPresentation === 'inline' ? 0.9 : 0.94)
    const fontSize = Number(visual.lineLabels[0]?.fontSize ?? 10)
    const editorTextLayout = layoutTextInPolygon(
      this.displayTextForCell(cell),
      visual.currentPoints,
      Math.max(
        4,
        this.settings.geometry.textInset * Math.sqrt(this.crowdingScale),
      ),
      Math.max(6, Math.min(8, fontSize)),
    )
    this.callbacks.onEditorLayout({
      cellId: cell.id,
      x: center.x,
      y: center.y,
      width: Math.min(bounds.width * 0.82, safeSide),
      height: Math.min(bounds.height * 0.82, safeSide),
      polygonWidth: bounds.width,
      fontSize,
      points: visual.currentPoints.map((point) => ({ ...point })),
      text: this.displayTextForCell(cell),
      textLayout: editorTextLayout,
    })
  }

  private cellBaseColor(cell: CellEntity | PreviewCell) {
    const palette = [
      this.settings.palette.cellLight,
      this.settings.palette.cellMid,
      this.settings.palette.cellDark,
      this.settings.palette.cellDeep,
    ]
    return palette[cell.style.paletteIndex % palette.length]
  }

  private cellDisplayColor(cell: CellEntity | PreviewCell, visual: CellVisual) {
    const base = this.cellBaseColor(cell)
    if (visual.preview) return this.mixColor(base, this.settings.palette.hoverTint, 0.48)
    const interactionTint = this.interactionEffects.get(cell.id)?.tint ?? 0
    if (interactionTint > 0) {
      return this.mixColor(
        base,
        this.settings.palette.selectedTint,
        interactionTint,
      )
    }
    if (this.state.selectedCellIds.includes(cell.id)) {
      return this.mixColor(base, this.settings.palette.selectedTint, 0.48)
    }
    if (cell.groupId && this.state.selectedGroupId === cell.groupId) {
      const groupTint =
        this.model.groups.find((group) => group.id === cell.groupId)?.style.tint ??
        this.settings.palette.groupTint
      return this.mixColor(base, groupTint, 0.38)
    }
    if (cell.id === this.state.hoveredId || (this.state.mode === 'group' && visual.hoverMix > 0.02)) {
      const tint =
        this.state.mode === 'group'
          ? this.settings.palette.groupTint
          : this.settings.palette.hoverTint
      return this.mixColor(base, tint, 0.26 * visual.hoverMix)
    }
    return new this.scope.Color(base)
  }

  private mixColor(firstValue: string, secondValue: string, amount: number) {
    const first = new this.scope.Color(firstValue)
    const second = new this.scope.Color(secondValue)
    const ratio = clamp(amount, 0, 1)
    return new this.scope.Color(
      first.red + (second.red - first.red) * ratio,
      first.green + (second.green - first.green) * ratio,
      first.blue + (second.blue - first.blue) * ratio,
      first.alpha + (second.alpha - first.alpha) * ratio,
    )
  }

  private hitTest(point: paper.Point): ItemData | null {
    const result = this.scope.project.hitTest(point, {
      fill: true,
      stroke: true,
      tolerance: 11,
    })
    if (!result) return null
    const data = result.item.data as ItemData | undefined
    return data?.kind ? data : null
  }

  private hitSeed(point: paper.Point): ItemData | null {
    const results = this.scope.project.hitTestAll(point, {
      fill: true,
      stroke: true,
      tolerance: 9,
    })
    for (const result of results) {
      const data = result.item.data as ItemData | undefined
      if (data?.cellId && this.findCell(data.cellId)?.kind === 'seed') return data
    }
    return null
  }

  private hitGroupWall(point: paper.Point): ItemData | null {
    const results = this.scope.project.hitTestAll(point, {
      fill: false,
      stroke: true,
      tolerance: 7,
    })
    for (const result of results) {
      const data = result.item.data as ItemData | undefined
      if (data?.kind === 'group-wall') return data
    }
    return null
  }

  private findCell(cellId: string) {
    return this.model.cells.find((cell) => cell.id === cellId)
  }

  private selectCell(cellId: string) {
    const cell = this.findCell(cellId)
    if (cell && this.state.mode === 'select') this.revealIncubation(cell)
    this.state.selectedCellId = cellId
    this.state.selectedCellIds = [cellId]
    this.state.selectedGroupId = null
    this.notifySelectionChanged()
  }

  private toggleCellSelection(cellId: string) {
    const cell = this.findCell(cellId)
    if (!cell || cell.kind === 'seed') return
    const selected = new Set(this.state.selectedCellIds)
    if (selected.has(cellId)) selected.delete(cellId)
    else selected.add(cellId)
    this.state.selectedCellIds = [...selected]
    this.state.selectedCellId =
      this.state.selectedCellIds.length === 1 ? this.state.selectedCellIds[0] : null
    this.state.selectedGroupId = null
    this.notifySelectionChanged()
  }

  private selectGroup(groupId: string) {
    this.state.selectedGroupId = groupId
    this.state.selectedCellId = null
    this.state.selectedCellIds = []
    this.notifySelectionChanged()
  }

  private clearSelection() {
    this.touchMultiSelect = false
    this.state.selectedCellId = null
    this.state.selectedCellIds = []
    this.state.selectedGroupId = null
    this.notifySelectionChanged()
  }

  private notifySelectionChanged() {
    const selection =
      this.state.selectedCellIds.length > 1
        ? `multi:${this.state.selectedCellIds.join(',')}`
        : this.state.selectedCellId ??
          (this.state.selectedGroupId ? `group:${this.state.selectedGroupId}` : null)
    this.callbacks.onSelectionChanged(selection, [...this.state.selectedCellIds])
  }

  private resizeCursor(direction?: Point2) {
    if (!direction) return 'nwse-resize'
    return direction.x === 0 ? 'ns-resize' : 'ew-resize'
  }

  private updateCanvasState() {
    this.canvas.dataset.mode = this.state.mode
    this.canvas.dataset.cellCount = String(this.model.cells.length)
    this.canvas.dataset.groupCount = String(this.model.groups.length)
    this.canvas.dataset.seedCount = String(
      this.model.cells.filter((cell) => cell.kind === 'seed').length,
    )
    this.canvas.dataset.preview = this.state.preview ? 'true' : 'false'
    this.canvas.dataset.selected = this.state.selectedCellId ?? ''
    this.canvas.dataset.selectedCount = String(this.state.selectedCellIds.length)
    this.canvas.dataset.selectedGroup = this.state.selectedGroupId ?? ''
    this.canvas.dataset.editing = this.state.editingId ?? ''
    this.canvas.dataset.autoGrowth = String(this.autoGrowth)
    this.canvas.setAttribute(
      'aria-label',
      `Circular journal canvas with ${this.model.cells.length} cells. ${this.state.mode} tool active.`,
    )
  }
}

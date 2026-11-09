import {
  SETTINGS_SCHEMA_VERSION,
  cloneSettings,
  defaultSettings,
  migrateSettings,
  type CanvasSettings,
} from './settings'
import {
  reflectiveContentProvider,
  type ContentProvenance,
} from './reflective-content'

export const CANVAS_SCHEMA_VERSION = 4

export type CellKind = 'journal' | 'seed'
export type IncubationState = 'empty' | 'incubating' | 'revealed'
export type RelationshipType = 'emergent-source' | 'related'

export interface NormalizedPoint {
  x: number
  y: number
}

export interface CellEntity {
  id: string
  text: string
  site: NormalizedPoint
  weight: number
  kind: CellKind
  groupId?: string
  style: {
    paletteIndex: number
  }
  creation: {
    source: 'seeded' | 'manual' | 'auto-growth' | 'merge' | 'split'
    order: number
    promoted: boolean
    sourceCellIds?: string[]
  }
  transformation?: {
    kind: 'merge' | 'split'
    sourceIds: string[]
  }
  contentProvenance: ContentProvenance
  incubation: {
    state: IncubationState
    sourceIds: string[]
    restStartedAtMs?: number
    startedAtMs?: number
    generatedText?: string
  }
  expiry: {
    state: 'none' | 'scheduled' | 'shrinking' | 'cancelled'
    timeoutMs: number
    createdAtMs?: number
    shrinkStartedAtMs?: number
  }
}

export interface RelationshipEntity {
  id: string
  sourceId: string
  targetId: string
  type: RelationshipType
  weight: number
  provenance: 'local-delaunay' | 'manual' | 'seeded'
}

export interface GroupEntity {
  id: string
  memberIds: string[]
  wall: {
    gap: number
    thickness: number
  }
  style: {
    tint: string
  }
  container: {
    site: NormalizedPoint
    weight: number
    preferredWeight?: number
  }
  title: string
  provenance: {
    source: 'manual' | 'autogroup'
    algorithm?: string
    algorithmVersion?: string
    provider?: string
    seed?: number
    settings?: Record<string, number | boolean>
  }
  order: number
}

export interface ClusteringProvenance {
  runId: string
  algorithm: string
  algorithmVersion: string
  provider: string
  providerVersion: string
  seed: number
  k: number
  score: number
  settings: Record<string, number | boolean>
}

export interface LayoutMetadata {
  schemaVersion: number
  settingsVersion: number
  seed: number
  circle: {
    center: NormalizedPoint
    radius: number
  }
  zOrder: string[]
  nextCellNumber: number
  nextGroupNumber: number
  nextRelationshipNumber: number
  listOrder: string[]
  history: {
    revision: number
    lastCommand?: string
  }
  clustering?: ClusteringProvenance
}

export interface VoronoiDocument {
  cells: CellEntity[]
  relationships: RelationshipEntity[]
  groups: GroupEntity[]
  layout: LayoutMetadata
  settings: CanvasSettings
}

const INITIAL_SITES: NormalizedPoint[] = [
  { x: -0.52, y: -0.61 },
  { x: -0.09, y: -0.67 },
  { x: 0.37, y: -0.59 },
  { x: 0.68, y: -0.25 },
  { x: 0.3, y: -0.16 },
  { x: -0.18, y: -0.25 },
  { x: -0.64, y: -0.16 },
  { x: -0.48, y: 0.34 },
  { x: -0.04, y: 0.2 },
  { x: 0.47, y: 0.25 },
  { x: 0.36, y: 0.68 },
  { x: -0.29, y: 0.66 },
]

export function createDefaultDocument(): VoronoiDocument {
  const fixtures = reflectiveContentProvider.initialFixtures()
  const cells = fixtures.map<CellEntity>((content, index) => ({
    id: `cell-${index + 1}`,
    text: content.text,
    site: { ...INITIAL_SITES[index] },
    weight: 0.008 + (index % 4) * 0.0014,
    kind: 'journal',
    style: { paletteIndex: index % 4 },
    creation: {
      source: 'seeded',
      order: index + 1,
      promoted: true,
    },
    contentProvenance: content.provenance,
    incubation: {
      state: 'revealed',
      sourceIds: [],
    },
    expiry: {
      state: 'none',
      timeoutMs: defaultSettings.seed.expirySeconds * 1000,
    },
  }))

  return {
    cells,
    relationships: [],
    groups: [],
    layout: {
      schemaVersion: CANVAS_SCHEMA_VERSION,
      settingsVersion: SETTINGS_SCHEMA_VERSION,
      seed: 20261109,
      circle: {
        center: { x: 0.5, y: 0.5 },
        radius: 0.46,
      },
      zOrder: cells.map((cell) => cell.id),
      nextCellNumber: cells.length + 1,
      nextGroupNumber: 1,
      nextRelationshipNumber: 1,
      listOrder: cells.map((cell) => cell.id),
      history: {
        revision: 0,
      },
    },
    settings: cloneSettings(defaultSettings),
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid Voronoi document: ${message}`)
}

export function validateDocument(document: VoronoiDocument) {
  assert(document.layout.schemaVersion === CANVAS_SCHEMA_VERSION, 'unsupported schema version')
  const cellIds = new Set(document.cells.map((cell) => cell.id))
  const groupIds = new Set(document.groups.map((group) => group.id))
  const relationshipIds = new Set(document.relationships.map((relationship) => relationship.id))
  assert(cellIds.size === document.cells.length, 'duplicate cell id')
  assert(groupIds.size === document.groups.length, 'duplicate group id')
  assert(relationshipIds.size === document.relationships.length, 'duplicate relationship id')

  for (const cell of document.cells) {
    assert(Number.isFinite(cell.site.x) && Number.isFinite(cell.site.y), `invalid site for ${cell.id}`)
    assert(Number.isFinite(cell.weight), `invalid weight for ${cell.id}`)
    assert(cell.weight >= -0.05 && cell.weight <= 0.2, `weight out of range for ${cell.id}`)
    assert(cell.site.x >= -1.25 && cell.site.x <= 1.25, `site x out of range for ${cell.id}`)
    assert(cell.site.y >= -1.25 && cell.site.y <= 1.25, `site y out of range for ${cell.id}`)
    if (cell.groupId) assert(groupIds.has(cell.groupId), `missing group ${cell.groupId}`)
    assert(
      ['empty', 'incubating', 'revealed'].includes(cell.incubation.state),
      `invalid incubation state for ${cell.id}`,
    )
    assert(
      ['none', 'scheduled', 'shrinking', 'cancelled'].includes(cell.expiry.state),
      `invalid expiry state for ${cell.id}`,
    )
    assert(Number.isFinite(cell.expiry.timeoutMs), `invalid expiry timeout for ${cell.id}`)
    if (cell.kind === 'seed' && cell.expiry.state === 'scheduled') {
      assert(
        Number.isFinite(cell.expiry.createdAtMs),
        `scheduled seed ${cell.id} must have a creation timestamp`,
      )
    }
    if (cell.kind === 'seed' && cell.expiry.state === 'shrinking') {
      assert(
        Number.isFinite(cell.expiry.shrinkStartedAtMs),
        `shrinking seed ${cell.id} must have a shrink timestamp`,
      )
    }
    assert(Boolean(cell.contentProvenance?.provider), `missing content provenance for ${cell.id}`)
    for (const sourceId of cell.incubation.sourceIds) {
      assert(cellIds.has(sourceId), `missing incubation source ${sourceId}`)
    }
  }

  for (const relationship of document.relationships) {
    assert(cellIds.has(relationship.sourceId), `missing relationship source ${relationship.sourceId}`)
    assert(cellIds.has(relationship.targetId), `missing relationship target ${relationship.targetId}`)
  }

  const groupedMembers = new Set<string>()
  for (const group of document.groups) {
    assert(group.memberIds.length > 0, `empty group ${group.id}`)
    assert(
      new Set(group.memberIds).size === group.memberIds.length,
      `duplicate member in group ${group.id}`,
    )
    assert(
      Number.isFinite(group.container.site.x) &&
        Number.isFinite(group.container.site.y) &&
        Number.isFinite(group.container.weight),
      `invalid container for ${group.id}`,
    )
    if (group.container.preferredWeight !== undefined) {
      assert(
        Number.isFinite(group.container.preferredWeight),
        `invalid preferred container weight for ${group.id}`,
      )
    }
    assert(Boolean(group.provenance?.source), `missing provenance for ${group.id}`)
    for (const memberId of group.memberIds) {
      assert(cellIds.has(memberId), `missing group member ${memberId}`)
      assert(!groupedMembers.has(memberId), `cell ${memberId} appears in multiple groups`)
      groupedMembers.add(memberId)
      assert(
        document.cells.find((cell) => cell.id === memberId)?.groupId === group.id,
        `cell ${memberId} has inconsistent groupId`,
      )
    }
  }
  for (const cell of document.cells) {
    if (cell.groupId) {
      assert(groupedMembers.has(cell.id), `cell ${cell.id} missing from its group`)
    }
  }

  assert(
    new Set(document.layout.zOrder).size === document.layout.zOrder.length,
    'duplicate z-order entry',
  )
  assert(document.layout.zOrder.length === document.cells.length, 'z-order is incomplete')
  for (const cellId of document.layout.zOrder) {
    assert(cellIds.has(cellId), `missing z-order cell ${cellId}`)
  }
  assert(
    new Set(document.layout.listOrder).size === document.layout.listOrder.length,
    'duplicate list-order entry',
  )
  for (const cellId of document.layout.listOrder) {
    assert(cellIds.has(cellId), `missing list-order cell ${cellId}`)
  }
  assert(
    document.layout.settingsVersion === SETTINGS_SCHEMA_VERSION,
    'unsupported settings version',
  )
  assert(document.settings.schemaVersion === SETTINGS_SCHEMA_VERSION, 'invalid settings schema')
  return document
}

export function serializeDocument(document: VoronoiDocument) {
  validateDocument(document)
  return JSON.stringify(document, null, 2)
}

export function deserializeDocument(serialized: string): VoronoiDocument {
  const parsed = migrateDocument(JSON.parse(serialized))
  validateDocument(parsed)
  return structuredClone(parsed)
}

export function cloneDocument(document: VoronoiDocument) {
  return deserializeDocument(serializeDocument(document))
}

export function enforceSingleEmptyCell(
  document: VoronoiDocument,
  preferredCellId?: string,
) {
  const emptyCells = document.cells.filter(
    (cell) => cell.kind === 'journal' && cell.text.trim() === '',
  )
  if (emptyCells.length <= 1) return document
  const keep =
    emptyCells.find((cell) => cell.id === preferredCellId) ??
    emptyCells
      .slice()
      .sort(
        (first, second) =>
          document.layout.listOrder.indexOf(first.id) -
            document.layout.listOrder.indexOf(second.id) ||
          first.creation.order - second.creation.order,
      )[0]
  const removedIds = new Set(
    emptyCells.filter((cell) => cell.id !== keep.id).map((cell) => cell.id),
  )
  document.cells = document.cells.filter((cell) => !removedIds.has(cell.id))
  document.relationships = document.relationships.filter(
    (relationship) =>
      !removedIds.has(relationship.sourceId) && !removedIds.has(relationship.targetId),
  )
  document.layout.zOrder = document.layout.zOrder.filter((id) => !removedIds.has(id))
  document.layout.listOrder = document.layout.listOrder.filter((id) => !removedIds.has(id))
  document.groups = document.groups.filter((group) => {
    group.memberIds = group.memberIds.filter((id) => !removedIds.has(id))
    if (group.memberIds.length >= 2) return true
    for (const memberId of group.memberIds) {
      const member = document.cells.find((cell) => cell.id === memberId)
      if (member) delete member.groupId
    }
    return false
  })
  return document
}

interface LegacyDocument {
  cells?: Array<Partial<CellEntity> & { id?: string; text?: string }>
  relationships?: RelationshipEntity[]
  groups?: Array<Partial<GroupEntity> & { id?: string; memberIds?: string[] }>
  layout?: Partial<LayoutMetadata> & { schemaVersion?: number }
  settings?: Partial<CanvasSettings>
}

export function migrateDocument(input: unknown): VoronoiDocument {
  assert(Boolean(input && typeof input === 'object'), 'document must be an object')
  const legacy = input as LegacyDocument
  const version = legacy.layout?.schemaVersion ?? 1
  const migratedAtMs = Date.now()
  assert(
    version === 1 ||
      version === 2 ||
      version === 3 ||
      version === CANVAS_SCHEMA_VERSION,
    'unsupported schema version',
  )
  const cells = (legacy.cells ?? []).map((cell, index) => {
    const text = cell.text ?? ''
    const expiry = {
      ...(cell.expiry ?? {
        state: cell.kind === 'seed' ? 'scheduled' : 'none',
        timeoutMs: defaultSettings.seed.expirySeconds * 1000,
      }),
    }
    if (cell.kind === 'seed' && expiry.state === 'scheduled' && expiry.createdAtMs === undefined) {
      expiry.createdAtMs = migratedAtMs
    }
    if (
      cell.kind === 'seed' &&
      expiry.state === 'shrinking' &&
      expiry.shrinkStartedAtMs === undefined
    ) {
      expiry.shrinkStartedAtMs = migratedAtMs
    }
    return {
      ...cell,
      text,
      contentProvenance: cell.contentProvenance ?? {
        provider: 'legacy-import',
        operation: text ? 'initial' : 'manual',
        sourceIds: cell.creation?.sourceCellIds ?? [],
        themes: [],
        tensions: [],
        horizon: 'today',
      },
      incubation: cell.incubation ?? {
        state: text ? 'revealed' : 'empty',
        sourceIds: [],
      },
      expiry,
      creation: cell.creation ?? {
        source: 'seeded',
        order: index + 1,
        promoted: cell.kind !== 'seed',
      },
    } as CellEntity
  })
  const cellById = new Map(cells.map((cell) => [cell.id, cell]))
  const groups = (legacy.groups ?? []).map((group, index) => {
    const memberIds = group.memberIds ?? []
    const members = memberIds
      .map((id) => cellById.get(id))
      .filter((cell): cell is CellEntity => Boolean(cell))
    const site = members.length
      ? members.reduce(
          (sum, cell) => ({
            x: sum.x + cell.site.x / members.length,
            y: sum.y + cell.site.y / members.length,
          }),
          { x: 0, y: 0 },
        )
      : { x: 0, y: 0 }
    return {
      ...group,
      id: group.id ?? `group-${index + 1}`,
      memberIds,
      container: group.container ?? {
        site,
        weight: Math.max(0.015, members.length * 0.012),
      },
      title:
        group.title ??
        reflectiveContentProvider.groupTitle(
          members.map((member) => ({ id: member.id, text: member.text })),
        ).text,
      provenance: group.provenance ?? {
        source: 'manual',
      },
    } as GroupEntity
  })
  const layout = {
    ...legacy.layout,
    schemaVersion: CANVAS_SCHEMA_VERSION,
    settingsVersion: SETTINGS_SCHEMA_VERSION,
    listOrder:
      legacy.layout?.listOrder ??
      (legacy.layout?.zOrder as string[] | undefined) ??
      cells.map((cell) => cell.id),
    history: legacy.layout?.history ?? { revision: 0 },
  } as LayoutMetadata
  const document = {
    cells,
    relationships: legacy.relationships ?? [],
    groups,
    layout,
    settings: migrateSettings(legacy.settings),
  }
  return enforceSingleEmptyCell(document)
}

export function extractiveSynthesis(texts: readonly string[]) {
  return reflectiveContentProvider.synthesize(
    texts.map((text, index) => ({ id: `source-${index + 1}`, text })),
  ).text
}

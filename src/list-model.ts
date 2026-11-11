import {
  cloneDocument,
  enforceSingleEmptyCell,
  type CellEntity,
  type GroupEntity,
  type VoronoiDocument,
} from './model'
import { reflectiveContentProvider } from './reflective-content'
import { groupColorFor } from './settings'

export interface ListRow {
  cellId: string
  groupId?: string
  depth: 0 | 1
  isGroupTitle: boolean
}

function listRank(document: VoronoiDocument, cellId: string) {
  const index = document.layout.listOrder.indexOf(cellId)
  return index < 0 ? Number.MAX_SAFE_INTEGER : index
}

function distance(first: CellEntity, second: CellEntity) {
  return Math.hypot(first.site.x - second.site.x, first.site.y - second.site.y)
}

export function orderCellsForList(
  document: VoronoiDocument,
  cells: readonly CellEntity[],
) {
  if (cells.length < 2) return [...cells]
  const sourceOrder = new Map(cells.map((cell, index) => [cell.id, index]))
  const remaining = [...cells]
  remaining.sort(
    (first, second) =>
      second.weight - first.weight ||
      (sourceOrder.get(first.id) ?? 0) - (sourceOrder.get(second.id) ?? 0) ||
      listRank(document, first.id) - listRank(document, second.id) ||
      first.id.localeCompare(second.id),
  )
  const ordered = [remaining.shift() as CellEntity]
  while (remaining.length) {
    const previous = ordered[ordered.length - 1]
    remaining.sort((first, second) => {
      const weightDelta = second.weight - first.weight
      if (Math.abs(weightDelta) > 0.0015) return weightDelta
      return (
        distance(previous, first) - distance(previous, second) ||
        (sourceOrder.get(first.id) ?? 0) - (sourceOrder.get(second.id) ?? 0) ||
        listRank(document, first.id) - listRank(document, second.id) ||
        first.id.localeCompare(second.id)
      )
    })
    ordered.push(remaining.shift() as CellEntity)
  }
  return ordered
}

export function buildListRows(document: VoronoiDocument): ListRow[] {
  const cellsById = new Map(document.cells.map((cell) => [cell.id, cell]))
  const grouped = new Set(document.groups.flatMap((group) => group.memberIds))
  const topLevel: Array<
    | { type: 'cell'; weight: number; order: number; cell: CellEntity }
    | { type: 'group'; weight: number; order: number; group: GroupEntity; cells: CellEntity[] }
  > = []
  for (const cell of document.cells) {
    if (!grouped.has(cell.id) && cell.kind === 'journal') {
      topLevel.push({
        type: 'cell',
        weight: cell.weight,
        order: listRank(document, cell.id),
        cell,
      })
    }
  }
  for (const group of document.groups) {
    const cells = orderCellsForList(
      document,
      group.memberIds
        .map((id) => cellsById.get(id))
        .filter((cell): cell is CellEntity => Boolean(cell && cell.kind === 'journal')),
    )
    if (!cells.length) continue
    topLevel.push({
      type: 'group',
      weight: Math.max(...cells.map((cell) => cell.weight)),
      order: Math.min(...cells.map((cell) => listRank(document, cell.id))),
      group,
      cells,
    })
  }
  topLevel.sort(
    (first, second) =>
      second.weight - first.weight ||
      first.order - second.order ||
      (first.type === 'cell' ? first.cell.id : first.group.id).localeCompare(
        second.type === 'cell' ? second.cell.id : second.group.id,
      ),
  )
  const orderedTopLevel = topLevel.length ? [topLevel.shift()!] : []
  const siteFor = (entry: (typeof orderedTopLevel)[number]) =>
    entry.type === 'cell' ? entry.cell.site : entry.group.container.site
  while (topLevel.length) {
    const previous = orderedTopLevel[orderedTopLevel.length - 1]
    const previousSite = siteFor(previous)
    topLevel.sort((first, second) => {
      const weightDelta = second.weight - first.weight
      if (Math.abs(weightDelta) > 0.0015) return weightDelta
      const firstSite = siteFor(first)
      const secondSite = siteFor(second)
      return (
        Math.hypot(firstSite.x - previousSite.x, firstSite.y - previousSite.y) -
          Math.hypot(secondSite.x - previousSite.x, secondSite.y - previousSite.y) ||
        first.order - second.order
      )
    })
    orderedTopLevel.push(topLevel.shift()!)
  }
  return orderedTopLevel.flatMap<ListRow>((entry) => {
    if (entry.type === 'cell') {
      return [{ cellId: entry.cell.id, depth: 0, isGroupTitle: false }]
    }
    return entry.cells.map((cell, index) => ({
      cellId: cell.id,
      groupId: entry.group.id,
      depth: index === 0 ? 0 : 1,
      isGroupTitle: index === 0,
    }))
  })
}

function nextListSite(order: number) {
  const angle = order * 2.399963229728653
  const radius = Math.min(0.82, 0.22 + (order % 7) * 0.09)
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  }
}

function moveListCellToBottom(document: VoronoiDocument, cellId: string) {
  document.layout.listOrder = [
    ...document.layout.listOrder.filter((id) => id !== cellId),
    cellId,
  ]
}

function createListCell(
  document: VoronoiDocument,
  text: string,
  sourceCell?: CellEntity,
) {
  const id = `cell-${document.layout.nextCellNumber}`
  const order = document.layout.nextCellNumber
  document.layout.nextCellNumber += 1
  const cell: CellEntity = {
    id,
    text,
    site: nextListSite(order),
    weight: -0.02,
    kind: 'journal',
    groupId: sourceCell?.groupId,
    style: { paletteIndex: order % 4 },
    creation: {
      source: 'manual',
      order,
      promoted: true,
    },
    contentProvenance: {
      provider: reflectiveContentProvider.id,
      operation: 'manual',
      sourceIds: sourceCell ? [sourceCell.id] : [],
      themes: [],
      tensions: [],
      horizon: 'today',
    },
    incubation: {
      state: text.trim() ? 'revealed' : 'empty',
      sourceIds: sourceCell ? [sourceCell.id] : [],
    },
    expiry: {
      state: 'none',
      timeoutMs: document.settings.seed.expirySeconds * 1000,
    },
  }
  document.cells.push(cell)
  document.layout.zOrder.push(id)
  moveListCellToBottom(document, id)
  if (cell.groupId) {
    const group = document.groups.find((candidate) => candidate.id === cell.groupId)
    if (group) {
      const sourceIndex = sourceCell ? group.memberIds.indexOf(sourceCell.id) : -1
      group.memberIds.splice(sourceIndex >= 0 ? sourceIndex + 1 : group.memberIds.length, 0, id)
      refreshGroupTitle(document, group)
    } else {
      delete cell.groupId
    }
  }
  return cell
}

export function addListCell(document: VoronoiDocument) {
  const next = cloneDocument(document)
  const existing = next.cells.find(
    (cell) => cell.kind === 'journal' && cell.text.trim() === '',
  )
  if (existing) {
    moveListCellToBottom(next, existing.id)
    return { document: next, cellId: existing.id, reused: true }
  }
  const cell = createListCell(next, '')
  return { document: next, cellId: cell.id, reused: false }
}

function placeExistingCellAfterSource(
  document: VoronoiDocument,
  cell: CellEntity,
  source: CellEntity,
) {
  if (cell.groupId && cell.groupId !== source.groupId) {
    const priorGroup = document.groups.find((group) => group.id === cell.groupId)
    if (priorGroup) {
      priorGroup.memberIds = priorGroup.memberIds.filter((id) => id !== cell.id)
      if (priorGroup.memberIds.length < 2) {
        for (const memberId of priorGroup.memberIds) {
          const member = document.cells.find((candidate) => candidate.id === memberId)
          if (member) delete member.groupId
        }
        document.groups = document.groups.filter((group) => group.id !== priorGroup.id)
      } else {
        refreshGroupTitle(document, priorGroup)
      }
    }
    delete cell.groupId
  }
  if (!source.groupId) return
  const group = document.groups.find((candidate) => candidate.id === source.groupId)
  if (!group) return
  cell.groupId = group.id
  group.memberIds = group.memberIds.filter((id) => id !== cell.id)
  const sourceIndex = group.memberIds.indexOf(source.id)
  group.memberIds.splice(sourceIndex + 1, 0, cell.id)
  refreshGroupTitle(document, group)
}

export function splitListCellAt(
  document: VoronoiDocument,
  cellId: string,
  selectionStart: number,
  selectionEnd = selectionStart,
) {
  const next = cloneDocument(document)
  const source = next.cells.find((candidate) => candidate.id === cellId)
  if (!source) return { document: next, cellId }
  const start = Math.max(0, Math.min(source.text.length, selectionStart))
  const end = Math.max(start, Math.min(source.text.length, selectionEnd))
  const before = source.text.slice(0, start).trimEnd()
  const after = source.text.slice(end).trimStart()
  source.text = before
  delete source.textVariants
  source.incubation = before
    ? { state: 'revealed', sourceIds: [] }
    : { state: 'empty', sourceIds: [] }

  if (!before && !after) {
    moveListCellToBottom(next, source.id)
    return { document: next, cellId: source.id }
  }

  if (!after) {
    const existing = next.cells.find(
      (cell) => cell.id !== source.id && cell.kind === 'journal' && cell.text.trim() === '',
    )
    if (existing) {
      placeExistingCellAfterSource(next, existing, source)
      moveListCellToBottom(next, existing.id)
      return {
        document: enforceSingleEmptyCell(next, existing.id),
        cellId: existing.id,
      }
    }
  }

  const created = createListCell(next, after, source)
  return {
    document: enforceSingleEmptyCell(next, after ? source.id : created.id),
    cellId: created.id,
  }
}

export function updateListCellText(
  document: VoronoiDocument,
  cellId: string,
  text: string,
) {
  const next = cloneDocument(document)
  const cell = next.cells.find((candidate) => candidate.id === cellId)
  if (!cell) return next
  cell.text = text
  delete cell.textVariants
  cell.incubation = cell.text.trim()
    ? { state: 'revealed', sourceIds: [] }
    : { state: 'empty', sourceIds: [] }
  cell.contentProvenance = {
    provider: reflectiveContentProvider.id,
    operation: 'manual',
    sourceIds: [],
    themes: [],
    tensions: [],
    horizon: 'today',
  }
  return enforceSingleEmptyCell(next, cell.id)
}

function refreshGroupTitle(document: VoronoiDocument, group: GroupEntity) {
  const sources = group.memberIds
    .map((id) => document.cells.find((cell) => cell.id === id))
    .filter((cell): cell is CellEntity => Boolean(cell))
    .map((cell) => ({ id: cell.id, text: cell.text }))
  group.title = reflectiveContentProvider.groupTitle(sources).text
}

export function indentListCell(document: VoronoiDocument, cellId: string) {
  const next = cloneDocument(document)
  const cell = next.cells.find((candidate) => candidate.id === cellId)
  if (!cell || cell.groupId) return next
  const rows = buildListRows(next)
  const rowIndex = rows.findIndex((row) => row.cellId === cellId)
  if (rowIndex <= 0) return next
  let previous = rows[rowIndex - 1]
  while (previous.depth === 1 && rowIndex > 0) {
    const previousIndex = rows.findIndex((row) => row.cellId === previous.cellId)
    previous = rows[Math.max(0, previousIndex - 1)]
  }
  if (previous.groupId) {
    const group = next.groups.find((candidate) => candidate.id === previous.groupId)
    if (!group) return next
    group.memberIds.push(cell.id)
    cell.groupId = group.id
    refreshGroupTitle(next, group)
    return next
  }
  const previousCell = next.cells.find((candidate) => candidate.id === previous.cellId)
  if (!previousCell || previousCell.groupId) return next
  if (next.groups.length >= 8) return next
  const groupId = `group-${next.layout.nextGroupNumber}`
  next.layout.nextGroupNumber += 1
  const title = reflectiveContentProvider.groupTitle([
    { id: previousCell.id, text: previousCell.text },
    { id: cell.id, text: cell.text },
  ])
  const group: GroupEntity = {
    id: groupId,
    memberIds: [previousCell.id, cell.id],
    wall: {
      gap: next.settings.group.wallGap,
      thickness: next.settings.group.wallThickness,
    },
    style: {
      tint: groupColorFor(next.settings, next.layout.nextGroupNumber - 1),
    },
    container: {
      site: {
        x: (previousCell.site.x + cell.site.x) / 2,
        y: (previousCell.site.y + cell.site.y) / 2,
      },
      weight: 0.024,
    },
    title: title.text,
    provenance: { source: 'manual' },
    order: next.layout.nextGroupNumber - 1,
  }
  previousCell.groupId = groupId
  cell.groupId = groupId
  next.groups.push(group)
  return next
}

export function outdentListCell(document: VoronoiDocument, cellId: string) {
  const next = cloneDocument(document)
  const cell = next.cells.find((candidate) => candidate.id === cellId)
  if (!cell?.groupId) return next
  const group = next.groups.find((candidate) => candidate.id === cell.groupId)
  if (!group) {
    delete cell.groupId
    return next
  }
  group.memberIds = group.memberIds.filter((id) => id !== cell.id)
  delete cell.groupId
  if (group.memberIds.length < 2) {
    for (const memberId of group.memberIds) {
      const member = next.cells.find((candidate) => candidate.id === memberId)
      if (member) delete member.groupId
    }
    next.groups = next.groups.filter((candidate) => candidate.id !== group.id)
  } else {
    refreshGroupTitle(next, group)
  }
  return next
}

export function prepareListDocumentForMicroscope(document: VoronoiDocument) {
  const next = cloneDocument(document)
  for (const [index, cell] of next.cells.entries()) {
    const radius = Math.hypot(cell.site.x, cell.site.y)
    if (!Number.isFinite(radius) || radius > 0.9) {
      cell.site = nextListSite(index + 1)
    }
  }
  next.layout.listOrder = [
    ...next.layout.listOrder.filter((id) => next.cells.some((cell) => cell.id === id)),
    ...next.cells
      .map((cell) => cell.id)
      .filter((id) => !next.layout.listOrder.includes(id)),
  ]
  return next
}

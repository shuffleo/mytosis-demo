import { describe, expect, it } from 'vitest'
import {
  CANVAS_SCHEMA_VERSION,
  cloneDocument,
  createDefaultDocument,
  createEmptyDocument,
  deserializeDocument,
  extractiveSynthesis,
  serializeDocument,
  validateDocument,
} from './model'
import { defaultSettings } from './settings'

describe('versioned canvas document', () => {
  it('creates a valid empty day without carrying fixture content', () => {
    const document = createEmptyDocument()

    expect(document.cells).toHaveLength(1)
    expect(document.cells[0].text).toBe('')
    expect(document.cells[0].incubation.state).toBe('empty')
    expect(document.groups).toEqual([])
    expect(document.relationships).toEqual([])
    expect(document.layout.listOrder).toEqual([document.cells[0].id])
    expect(() => validateDocument(document)).not.toThrow()
  })

  it('round-trips deterministically without duplicating relationship data', () => {
    const document = createDefaultDocument()
    document.cells[0].transformation = {
      kind: 'merge',
      sourceIds: ['historical-cell-a', 'historical-cell-b'],
    }
    document.relationships.push({
      id: 'relationship-1',
      sourceId: 'cell-1',
      targetId: 'cell-2',
      type: 'related',
      weight: 0.72,
      provenance: 'manual',
    })
    document.cells[0].expiry = {
      state: 'scheduled',
      timeoutMs: 180_000,
      createdAtMs: 450,
    }
    document.layout.clustering = {
      runId: 'cluster-1',
      algorithm: 'cosine-kmeans',
      algorithmVersion: '1.0.0',
      provider: 'local-tfidf',
      providerVersion: '1.0.0',
      seed: 42,
      k: 3,
      score: 0.54,
      settings: { autoK: true, minK: 2, maxK: 4 },
    }
    document.layout.history = { revision: 3, lastCommand: 'autogroup' }

    const serialized = serializeDocument(document)
    const restored = deserializeDocument(serialized)

    expect(serializeDocument(restored)).toBe(serialized)
    expect(restored.relationships).toHaveLength(1)
    expect(restored.cells[0]).not.toHaveProperty('connections')
    expect(restored.cells[0].transformation).toEqual({
      kind: 'merge',
      sourceIds: ['historical-cell-a', 'historical-cell-b'],
    })
    expect(restored.cells[0].expiry.createdAtMs).toBe(450)
    expect(restored.layout.clustering?.provider).toBe('local-tfidf')
    expect(restored.layout.history.lastCommand).toBe('autogroup')
    expect(restored).not.toBe(document)
  })

  it('rejects dangling group and relationship references', () => {
    const document = cloneDocument(createDefaultDocument())
    document.relationships.push({
      id: 'relationship-1',
      sourceId: 'cell-1',
      targetId: 'missing-cell',
      type: 'related',
      weight: 1,
      provenance: 'manual',
    })

    expect(() => validateDocument(document)).toThrow(/missing relationship target/)
  })

  it('produces a deterministic local extractive synthesis', () => {
    const texts = createDefaultDocument().cells.slice(0, 3).map((cell) => cell.text)
    const first = extractiveSynthesis(texts)
    const second = extractiveSynthesis(texts)

    expect(first).toBe(second)
    expect(first.split(/\s+/u).length).toBeGreaterThanOrEqual(5)
    expect(first.split(/\s+/u).length).toBeLessThanOrEqual(20)
    expect(first.length).toBeGreaterThan(20)
  })

  it('migrates v1 cells, groups, and settings to current defaults', () => {
    const current = createDefaultDocument()
    current.cells[0].groupId = 'group-1'
    current.groups.push({
      id: 'group-1',
      memberIds: ['cell-1'],
      wall: { gap: 16, thickness: 8 },
      style: { tint: '#888888' },
      container: { site: { x: 0, y: 0 }, weight: 0.02 },
      title: 'A legacy group',
      provenance: { source: 'manual' },
      order: 1,
    })
    const legacy = JSON.parse(JSON.stringify(current)) as {
      cells: Array<Record<string, unknown>>
      groups: Array<Record<string, unknown>>
      layout: Record<string, unknown>
      settings?: unknown
    }
    legacy.layout.schemaVersion = 1
    delete legacy.layout.settingsVersion
    delete legacy.settings
    for (const cell of legacy.cells) {
      delete cell.incubation
      delete cell.expiry
      delete cell.contentProvenance
    }
    for (const group of legacy.groups) delete group.container

    const migrated = deserializeDocument(JSON.stringify(legacy))

    expect(migrated.layout.schemaVersion).toBe(CANVAS_SCHEMA_VERSION)
    expect(migrated.settings).toEqual(defaultSettings)
    expect(migrated.cells[0].incubation.state).toBe('revealed')
    expect(migrated.cells[0].expiry.state).toBe('none')
    expect(migrated.cells[0].contentProvenance.provider).toBeTruthy()
    expect(migrated.groups[0].container.site).toEqual(migrated.cells[0].site)
    expect(migrated.layout.listOrder).toContain('cell-1')
    expect(migrated.layout.history.revision).toBe(0)
  })

  it('anchors restored seed expiry once when legacy timestamps are missing', () => {
    const legacy = JSON.parse(serializeDocument(createDefaultDocument())) as {
      cells: Array<Record<string, unknown>>
    }
    legacy.cells[0].kind = 'seed'
    legacy.cells[0].expiry = {
      state: 'scheduled',
      timeoutMs: 120,
    }
    const before = Date.now()
    const migrated = deserializeDocument(JSON.stringify(legacy))
    const after = Date.now()
    const createdAtMs = migrated.cells[0].expiry.createdAtMs

    expect(createdAtMs).toBeGreaterThanOrEqual(before)
    expect(createdAtMs).toBeLessThanOrEqual(after)
    expect(
      (legacy.cells[0].expiry as { createdAtMs?: number }).createdAtMs,
    ).toBeUndefined()
    expect(deserializeDocument(serializeDocument(migrated)).cells[0].expiry.createdAtMs).toBe(
      createdAtMs,
    )
  })

  it('migrates duplicate empty journals down to one without dangling references', () => {
    const legacy = createDefaultDocument()
    for (const cell of legacy.cells.slice(0, 2)) {
      cell.text = ''
      cell.incubation = { state: 'empty', sourceIds: [] }
    }
    const migrated = deserializeDocument(JSON.stringify(legacy))

    expect(
      migrated.cells.filter((cell) => cell.kind === 'journal' && cell.text.trim() === ''),
    ).toHaveLength(1)
    validateDocument(migrated)
  })
})

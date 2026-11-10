import { describe, expect, it } from 'vitest'
import {
  JOURNAL_STORAGE_KEY,
  JOURNAL_STORE_VERSION,
  JournalStoreVersionError,
  createJournalStore,
} from './journal-store'
import {
  CANVAS_SCHEMA_VERSION,
  createDefaultDocument,
  serializeDocument,
  type VoronoiDocument,
} from './model'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value))
  }
}

function documentWithFirstText(text: string) {
  const document = createDefaultDocument()
  document.cells[0].text = text
  return document
}

describe('versioned day journal store', () => {
  it('persists documents as serialized, independent day pages', () => {
    const storage = new MemoryStorage()
    const store = createJournalStore({
      storage,
      now: () => new Date('2026-11-10T08:00:00.000Z'),
    })

    store.savePage('2026-11-09', documentWithFirstText('Monday page'))
    store.savePage('2026-11-10', documentWithFirstText('Tuesday page'))
    store.savePage('2026-11-09', documentWithFirstText('Monday revised'))

    expect(store.listDayKeys()).toEqual(['2026-11-09', '2026-11-10'])
    expect(store.loadPage('2026-11-09')?.cells[0].text).toBe('Monday revised')
    expect(store.loadPage('2026-11-10')?.cells[0].text).toBe('Tuesday page')

    const storedPage = JSON.parse(
      storage.getItem(`${JOURNAL_STORAGE_KEY}:page:2026-11-10`) ?? '',
    ) as { version: number; document: unknown }
    expect(storedPage.version).toBe(JOURNAL_STORE_VERSION)
    expect(typeof storedPage.document).toBe('string')
  })

  it('migrates an unversioned day map and each legacy Voronoi document', () => {
    const storage = new MemoryStorage()
    const legacy = JSON.parse(
      JSON.stringify(documentWithFirstText('Legacy entry')),
    ) as Record<string, unknown> & {
      layout: Record<string, unknown>
      cells: Array<Record<string, unknown>>
    }
    legacy.layout.schemaVersion = 1
    delete legacy.layout.settingsVersion
    delete legacy.settings
    delete legacy.cells[0].incubation
    delete legacy.cells[0].contentProvenance
    storage.setItem(
      JOURNAL_STORAGE_KEY,
      JSON.stringify({
        pages: {
          '2026-11-08': legacy,
        },
      }),
    )

    const store = createJournalStore({
      storage,
      now: () => new Date(2026, 10, 10, 9),
    })
    const migrated = store.loadPage('2026-11-08')

    expect(migrated?.layout.schemaVersion).toBe(CANVAS_SCHEMA_VERSION)
    expect(migrated?.cells[0].contentProvenance.provider).toBeTruthy()
    expect(store.listDayKeys()).toEqual(['2026-11-08'])
    expect(storage.getItem(`${JOURNAL_STORAGE_KEY}:legacy-backup`)).not.toBeNull()
    expect(
      JSON.parse(storage.getItem(JOURNAL_STORAGE_KEY) ?? '').version,
    ).toBe(JOURNAL_STORE_VERSION)
  })

  it('migrates a legacy single document onto the current local day', () => {
    const storage = new MemoryStorage()
    storage.setItem(
      JOURNAL_STORAGE_KEY,
      JSON.stringify(documentWithFirstText('Undated legacy page')),
    )
    const store = createJournalStore({
      storage,
      now: () => new Date(2026, 10, 10, 23, 30),
    })

    expect(store.listDayKeys()).toEqual(['2026-11-10'])
    expect(store.loadPage('2026-11-10')?.cells[0].text).toBe('Undated legacy page')
  })

  it('keeps a damaged page isolated from intact days', () => {
    const storage = new MemoryStorage()
    const store = createJournalStore({ storage })
    store.savePage('2026-11-08', documentWithFirstText('Intact'))
    storage.setItem(`${JOURNAL_STORAGE_KEY}:page:2026-11-09`, '{bad json')
    const manifest = JSON.parse(storage.getItem(JOURNAL_STORAGE_KEY) ?? '') as {
      version: number
      days: string[]
    }
    storage.setItem(
      JOURNAL_STORAGE_KEY,
      JSON.stringify({ ...manifest, days: [...manifest.days, '2026-11-09'] }),
    )

    expect(store.loadPage('2026-11-09')).toBeNull()
    expect(
      storage.getItem(`${JOURNAL_STORAGE_KEY}:recovery:2026-11-09`),
    ).toBe('{bad json')
    expect(store.loadPage('2026-11-08')?.cells[0].text).toBe('Intact')
    store.savePage('2026-11-10', documentWithFirstText('Still writable'))
    expect(store.listDayKeys()).toEqual([
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
    ])
  })

  it('preserves a future-version page before allowing a compatible replacement', () => {
    const storage = new MemoryStorage()
    const store = createJournalStore({ storage })
    store.savePage('2026-11-10', documentWithFirstText('Current'))
    const futurePage = JSON.stringify({
      version: JOURNAL_STORE_VERSION + 1,
      dayKey: '2026-11-10',
      updatedAt: '2026-11-10T00:00:00.000Z',
      document: serializeDocument(documentWithFirstText('Future version')),
    })
    storage.setItem(`${JOURNAL_STORAGE_KEY}:page:2026-11-10`, futurePage)

    expect(store.loadPage('2026-11-10')).toBeNull()
    expect(
      storage.getItem(`${JOURNAL_STORAGE_KEY}:recovery:2026-11-10`),
    ).toBe(futurePage)
  })

  it('refuses to downgrade an unknown future store version', () => {
    const storage = new MemoryStorage()
    const future = JSON.stringify({ version: 99, days: ['2026-11-10'] })
    storage.setItem(JOURNAL_STORAGE_KEY, future)
    const store = createJournalStore({ storage })

    expect(() => store.listDayKeys()).toThrow(JournalStoreVersionError)
    expect(storage.getItem(JOURNAL_STORAGE_KEY)).toBe(future)
  })

  it('reports content from journal cells and returns cloned documents', () => {
    const storage = new MemoryStorage()
    const store = createJournalStore({ storage })
    const empty = createDefaultDocument()
    for (const cell of empty.cells) {
      if (cell.kind === 'journal') cell.text = ''
    }
    store.savePage('2026-11-09', empty)
    store.savePage('2026-11-10', documentWithFirstText('Content'))

    expect(store.hasContent('2026-11-09')).toBe(false)
    expect(store.hasContent('2026-11-10')).toBe(true)
    expect(store.contentDayKeys()).toEqual(new Set(['2026-11-10']))

    const loaded = store.loadPage('2026-11-10') as VoronoiDocument
    loaded.cells[0].text = 'Mutated in memory'
    expect(store.loadPage('2026-11-10')?.cells[0].text).toBe('Content')
  })
})

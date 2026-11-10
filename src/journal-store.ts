import {
  deserializeDocument,
  serializeDocument,
  type VoronoiDocument,
} from './model'
import { isDayKey, toLocalDayKey, type DayKey } from './local-day'

export const JOURNAL_STORE_VERSION = 1
export const JOURNAL_STORAGE_KEY = 'mytosis.daily-journal'

interface JournalManifestV1 {
  version: typeof JOURNAL_STORE_VERSION
  days: DayKey[]
}

interface StoredJournalPageV1 {
  version: typeof JOURNAL_STORE_VERSION
  dayKey: DayKey
  updatedAt: string
  document: string
}

interface LegacyJournalRoot {
  version?: number
  pages?: Record<string, unknown>
}

export interface JournalStorage {
  readonly length: number
  clear(): void
  getItem(key: string): string | null
  key(index: number): string | null
  removeItem(key: string): void
  setItem(key: string, value: string): void
}

export interface JournalStoreOptions {
  storage?: JournalStorage
  storageKey?: string
  now?: () => Date
}

export interface JournalStore {
  loadPage(dayKey: DayKey): VoronoiDocument | null
  savePage(dayKey: DayKey, document: VoronoiDocument): void
  removePage(dayKey: DayKey): void
  hasPage(dayKey: DayKey): boolean
  hasContent(dayKey: DayKey): boolean
  listDayKeys(): DayKey[]
  contentDayKeys(): Set<DayKey>
  clearAll(): void
}

export class JournalStoreVersionError extends Error {
  constructor(version: number) {
    super(`Journal store version ${version} is newer than supported version ${JOURNAL_STORE_VERSION}`)
    this.name = 'JournalStoreVersionError'
  }
}

function defaultStorage() {
  if (!globalThis.localStorage) {
    throw new Error('localStorage is not available in this environment')
  }
  return globalThis.localStorage
}

function pageStorageKey(storageKey: string, dayKey: DayKey) {
  return `${storageKey}:page:${dayKey}`
}

function legacyBackupKey(storageKey: string) {
  return `${storageKey}:legacy-backup`
}

function pageRecoveryKey(storageKey: string, dayKey: DayKey) {
  return `${storageKey}:recovery:${dayKey}`
}

function emptyManifest(): JournalManifestV1 {
  return { version: JOURNAL_STORE_VERSION, days: [] }
}

function parseJson(serialized: string, label: string): unknown {
  try {
    return JSON.parse(serialized)
  } catch {
    throw new Error(`Invalid JSON in ${label}`)
  }
}

function decodeDocument(value: unknown): VoronoiDocument {
  if (typeof value === 'string') return deserializeDocument(value)
  if (value && typeof value === 'object' && 'document' in value) {
    return decodeDocument((value as { document: unknown }).document)
  }
  return deserializeDocument(JSON.stringify(value))
}

function isDocumentLike(value: unknown) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'cells' in value &&
      'layout' in value,
  )
}

function normalizeManifest(input: unknown): JournalManifestV1 | null {
  if (!input || typeof input !== 'object') return null
  const candidate = input as Partial<JournalManifestV1>
  if (candidate.version !== JOURNAL_STORE_VERSION || !Array.isArray(candidate.days)) {
    return null
  }
  return {
    version: JOURNAL_STORE_VERSION,
    days: [...new Set(candidate.days.filter(isDayKey))].sort(),
  }
}

function migrateLegacyRoot(
  storage: JournalStorage,
  storageKey: string,
  serializedRoot: string,
  input: unknown,
  todayDayKey: DayKey,
  now: Date,
) {
  const legacy = input as LegacyJournalRoot
  const candidates: Record<string, unknown> = legacy.pages
    ? legacy.pages
    : isDocumentLike(input)
      ? { [todayDayKey]: input }
      : {}
  const pages: Array<{ dayKey: DayKey; document: VoronoiDocument }> = []

  for (const [candidateDayKey, value] of Object.entries(candidates)) {
    if (!isDayKey(candidateDayKey)) continue
    try {
      pages.push({ dayKey: candidateDayKey, document: decodeDocument(value) })
    } catch {
      // A damaged legacy day must not prevent intact days from migrating.
    }
  }

  if (storage.getItem(legacyBackupKey(storageKey)) === null) {
    storage.setItem(legacyBackupKey(storageKey), serializedRoot)
  }
  for (const page of pages) {
    const envelope: StoredJournalPageV1 = {
      version: JOURNAL_STORE_VERSION,
      dayKey: page.dayKey,
      updatedAt: now.toISOString(),
      document: serializeDocument(page.document),
    }
    storage.setItem(pageStorageKey(storageKey, page.dayKey), JSON.stringify(envelope))
  }
  const manifest: JournalManifestV1 = {
    version: JOURNAL_STORE_VERSION,
    days: pages.map((page) => page.dayKey).sort(),
  }
  storage.setItem(storageKey, JSON.stringify(manifest))
  return manifest
}

export function documentHasJournalContent(document: VoronoiDocument) {
  return document.cells.some(
    (cell) => cell.kind === 'journal' && cell.text.trim().length > 0,
  )
}

export function createJournalStore(options: JournalStoreOptions = {}): JournalStore {
  const storage = options.storage ?? defaultStorage()
  const storageKey = options.storageKey ?? JOURNAL_STORAGE_KEY
  const now = options.now ?? (() => new Date())

  const readManifest = (): JournalManifestV1 => {
    const serialized = storage.getItem(storageKey)
    if (serialized === null) return emptyManifest()
    const input = parseJson(serialized, 'journal manifest')
    const candidateVersion =
      input && typeof input === 'object' && 'version' in input
        ? Number((input as { version: unknown }).version)
        : 0
    if (candidateVersion > JOURNAL_STORE_VERSION) {
      throw new JournalStoreVersionError(candidateVersion)
    }
    const manifest = normalizeManifest(input)
    if (manifest) return manifest
    const migrationNow = now()
    return migrateLegacyRoot(
      storage,
      storageKey,
      serialized,
      input,
      toLocalDayKey(migrationNow),
      migrationNow,
    )
  }

  const writeManifest = (manifest: JournalManifestV1) => {
    storage.setItem(
      storageKey,
      JSON.stringify({
        version: JOURNAL_STORE_VERSION,
        days: [...new Set(manifest.days)].sort(),
      } satisfies JournalManifestV1),
    )
  }

  const loadPage = (dayKey: DayKey) => {
    readManifest()
    const serialized = storage.getItem(pageStorageKey(storageKey, dayKey))
    if (serialized === null) return null
    const preserveForRecovery = () => {
      const recoveryKey = pageRecoveryKey(storageKey, dayKey)
      if (storage.getItem(recoveryKey) === null) {
        storage.setItem(recoveryKey, serialized)
      }
    }
    try {
      const input = parseJson(serialized, `journal page ${dayKey}`)
      const envelope = input as Partial<StoredJournalPageV1>
      if (
        typeof envelope.version === 'number' &&
        envelope.version > JOURNAL_STORE_VERSION
      ) {
        preserveForRecovery()
        return null
      }
      const document = decodeDocument(input)
      const canonicalDocument = serializeDocument(document)
      if (
        envelope.version !== JOURNAL_STORE_VERSION ||
        envelope.dayKey !== dayKey ||
        envelope.document !== canonicalDocument
      ) {
        storage.setItem(
          pageStorageKey(storageKey, dayKey),
          JSON.stringify({
            version: JOURNAL_STORE_VERSION,
            dayKey,
            updatedAt:
              typeof envelope.updatedAt === 'string'
                ? envelope.updatedAt
                : now().toISOString(),
            document: canonicalDocument,
          } satisfies StoredJournalPageV1),
        )
      }
      return document
    } catch {
      preserveForRecovery()
      return null
    }
  }

  return {
    loadPage,
    savePage(dayKey, document) {
      const manifest = readManifest()
      const envelope: StoredJournalPageV1 = {
        version: JOURNAL_STORE_VERSION,
        dayKey,
        updatedAt: now().toISOString(),
        document: serializeDocument(document),
      }
      storage.setItem(pageStorageKey(storageKey, dayKey), JSON.stringify(envelope))
      if (!manifest.days.includes(dayKey)) {
        writeManifest({ ...manifest, days: [...manifest.days, dayKey] })
      }
    },
    removePage(dayKey) {
      const manifest = readManifest()
      storage.removeItem(pageStorageKey(storageKey, dayKey))
      if (manifest.days.includes(dayKey)) {
        writeManifest({
          ...manifest,
          days: manifest.days.filter((candidate) => candidate !== dayKey),
        })
      }
    },
    hasPage(dayKey) {
      return readManifest().days.includes(dayKey)
    },
    hasContent(dayKey) {
      const document = loadPage(dayKey)
      return document ? documentHasJournalContent(document) : false
    },
    listDayKeys() {
      return [...readManifest().days]
    },
    contentDayKeys() {
      return new Set(
        readManifest().days.filter((dayKey) => {
          const document = loadPage(dayKey)
          return document ? documentHasJournalContent(document) : false
        }),
      )
    },
    clearAll() {
      const ownedKeys: string[] = []
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index)
        if (key === storageKey || key?.startsWith(`${storageKey}:`)) {
          ownedKeys.push(key)
        }
      }
      for (const key of ownedKeys) storage.removeItem(key)
    },
  }
}

export interface HistoryEntry<T> {
  state: T
  command: string
  revision: number
}

export class BoundedCommandHistory<T> {
  private readonly undoEntries: HistoryEntry<T>[] = []
  private readonly redoEntries: HistoryEntry<T>[] = []
  private readonly cloneState: (state: T) => T
  private readonly limit: number

  constructor(clone: (state: T) => T, limit = 80) {
    this.cloneState = clone
    this.limit = limit
  }

  checkpoint(state: T, command: string, revision: number) {
    this.undoEntries.push({
      state: this.cloneState(state),
      command,
      revision,
    })
    if (this.undoEntries.length > this.limit) this.undoEntries.shift()
    this.redoEntries.length = 0
  }

  undo(current: T, command: string, revision: number) {
    const previous = this.undoEntries.pop()
    if (!previous) return null
    this.redoEntries.push({
      state: this.cloneState(current),
      command,
      revision,
    })
    return this.cloneState(previous.state)
  }

  redo(current: T, command: string, revision: number) {
    const next = this.redoEntries.pop()
    if (!next) return null
    this.undoEntries.push({
      state: this.cloneState(current),
      command,
      revision,
    })
    return this.cloneState(next.state)
  }

  clear() {
    this.undoEntries.length = 0
    this.redoEntries.length = 0
  }

  discardLastCheckpoint() {
    return this.undoEntries.pop() ?? null
  }

  get canUndo() {
    return this.undoEntries.length > 0
  }

  get canRedo() {
    return this.redoEntries.length > 0
  }

  get depths() {
    return { undoDepth: this.undoEntries.length, redoDepth: this.redoEntries.length }
  }
}

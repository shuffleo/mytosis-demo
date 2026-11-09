import { describe, expect, it } from 'vitest'
import { BoundedCommandHistory } from './history'

describe('bounded command history', () => {
  it('undoes and redoes cloned snapshots without aliasing', () => {
    const history = new BoundedCommandHistory<{ value: number }>(
      (state) => structuredClone(state),
      3,
    )
    const state = { value: 1 }
    history.checkpoint(state, 'add', 0)
    state.value = 2
    const previous = history.undo(state, 'undo', 1)
    expect(previous).toEqual({ value: 1 })
    if (previous) previous.value = 99
    expect(history.redo({ value: 1 }, 'redo', 2)).toEqual({ value: 2 })
  })

  it('clears redo on a new command and enforces its bound', () => {
    const history = new BoundedCommandHistory<number>((state) => state, 2)
    history.checkpoint(0, 'first', 0)
    history.checkpoint(1, 'second', 1)
    history.checkpoint(2, 'third', 2)
    expect(history.depths).toEqual({ undoDepth: 2, redoDepth: 0 })
    expect(history.undo(3, 'undo', 3)).toBe(2)
    expect(history.canRedo).toBe(true)
    history.checkpoint(9, 'replacement', 4)
    expect(history.canRedo).toBe(false)
  })
})

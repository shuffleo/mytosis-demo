import { describe, expect, it } from 'vitest'
import {
  addListCell,
  buildListRows,
  indentListCell,
  outdentListCell,
  prepareListDocumentForMicroscope,
  splitListCellAt,
  updateListCellText,
} from './list-model'
import {
  createDefaultDocument,
  deserializeDocument,
  serializeDocument,
  validateDocument,
} from './model'

describe('shared-model bullet list', () => {
  it('orders larger cells first and preserves deterministic IDs', () => {
    const document = createDefaultDocument()
    document.cells[4].weight = 0.08
    const first = buildListRows(document)
    const second = buildListRows(document)
    expect(first).toEqual(second)
    expect(first[0].cellId).toBe(document.cells[4].id)
  })

  it('edits, adds, indents one level, and outdents without losing data', () => {
    let document = createDefaultDocument()
    const anchorId = buildListRows(document)[0].cellId
    const added = addListCell(document)
    document = updateListCellText(
      added.document,
      added.cellId,
      'I made the next step concrete before adding another task.',
    )
    expect(document.cells.find((cell) => cell.id === added.cellId)?.text).toContain(
      'next step',
    )
    document = indentListCell(document, added.cellId)
    const indented = buildListRows(document).find((row) => row.cellId === added.cellId)
    expect(indented?.depth).toBe(1)
    expect(indented?.groupId).toBeTruthy()
    document = outdentListCell(document, added.cellId)
    expect(document.cells.find((cell) => cell.id === added.cellId)?.groupId).toBeUndefined()
    expect(document.cells.find((cell) => cell.id === anchorId)?.groupId).toBeUndefined()
    validateDocument(document)
  })

  it('always edits canonical M and invalidates derived variants after a list edit', () => {
    const document = createDefaultDocument()
    const cell = document.cells[0]
    cell.textVariants = {
      sourceHash: 'old',
      status: 'ready',
      values: { S: 'Short.', XS: 'Shorter.', XXS: 'Tiny.' },
      provenance: 'on-device-model',
      provider: 'test',
      promptVersion: 'test',
      generatedAtMs: 1,
    }
    const next = updateListCellText(document, cell.id, 'Canonical M changed')
    expect(next.cells.find((candidate) => candidate.id === cell.id)?.text).toBe(
      'Canonical M changed',
    )
    expect(
      next.cells.find((candidate) => candidate.id === cell.id)?.textVariants,
    ).toBeUndefined()
  })

  it('round-trips list order and repairs invalid sites before microscope return', () => {
    const document = createDefaultDocument()
    document.layout.listOrder.reverse()
    document.cells[0].site = { x: 1.2, y: 0 }
    const prepared = prepareListDocumentForMicroscope(document)
    expect(Math.hypot(prepared.cells[0].site.x, prepared.cells[0].site.y)).toBeLessThan(1)
    const restored = deserializeDocument(serializeDocument(prepared))
    expect(restored.layout.listOrder).toEqual(prepared.layout.listOrder)
  })

  it('splits at the caret, appends the new bullet, and keeps at most one empty idea', () => {
    const document = createDefaultDocument()
    const source = document.cells[0]
    source.text = 'I named the risk before choosing the smallest useful experiment.'
    const splitAt = source.text.indexOf('before')
    const split = splitListCellAt(document, source.id, splitAt)
    const created = split.document.cells.find((cell) => cell.id === split.cellId)

    expect(split.document.cells.find((cell) => cell.id === source.id)?.text).toBe(
      'I named the risk',
    )
    expect(created?.text).toBe('before choosing the smallest useful experiment.')
    expect(buildListRows(split.document).at(-1)?.cellId).toBe(created?.id)

    const firstEmpty = addListCell(split.document)
    const secondEmpty = addListCell(firstEmpty.document)
    expect(secondEmpty.cellId).toBe(firstEmpty.cellId)
    expect(
      secondEmpty.document.cells.filter(
        (cell) => cell.kind === 'journal' && cell.text.trim() === '',
      ),
    ).toHaveLength(1)
  })
})

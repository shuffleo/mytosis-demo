import { useEffect, useMemo, useRef } from 'react'
import {
  buildListRows,
  indentListCell,
  outdentListCell,
  splitListCellAt,
  updateListCellText,
} from './list-model'
import type { VoronoiDocument } from './model'
import { reflectiveContentProvider } from './reflective-content'

interface ListEditorProps {
  document: VoronoiDocument
  onChange: (document: VoronoiDocument) => void
  onCommit: (document: VoronoiDocument, command: string) => void
}

export function ListEditor({ document, onChange, onCommit }: ListEditorProps) {
  const rows = useMemo(() => buildListRows(document), [document])
  const focusNextRef = useRef<{ id: string; caret: number } | null>(null)

  useEffect(() => {
    const target = focusNextRef.current
    if (!target) return
    focusNextRef.current = null
    requestAnimationFrame(() => {
      const editor = globalThis.document.querySelector<HTMLTextAreaElement>(
        `[data-list-cell="${CSS.escape(target.id)}"]`,
      )
      if (!editor) return
      editor.focus()
      const caret = Math.min(target.caret, editor.value.length)
      editor.setSelectionRange(caret, caret)
    })
  }, [document])

  useEffect(() => {
    if (rows.length !== 1) return
    const cell = document.cells.find((candidate) => candidate.id === rows[0].cellId)
    if (!cell || cell.text.trim()) return
    const editor = globalThis.document.querySelector<HTMLTextAreaElement>(
      `[data-list-cell="${CSS.escape(cell.id)}"]`,
    )
    if (!editor || globalThis.document.activeElement === editor) return
    requestAnimationFrame(() => {
      editor.focus()
      editor.setSelectionRange(editor.value.length, editor.value.length)
    })
  }, [document, rows])

  useEffect(() => {
    const keepActiveRowVisible = () => {
      const active = globalThis.document.activeElement
      if (!(active instanceof HTMLTextAreaElement) || !active.dataset.listCell) return
      active.scrollIntoView({ block: 'nearest' })
    }
    window.visualViewport?.addEventListener('resize', keepActiveRowVisible)
    window.visualViewport?.addEventListener('scroll', keepActiveRowVisible)
    return () => {
      window.visualViewport?.removeEventListener('resize', keepActiveRowVisible)
      window.visualViewport?.removeEventListener('scroll', keepActiveRowVisible)
    }
  }, [])

  const focusAdjacent = (cellId: string, direction: -1 | 1, caret: number) => {
    const currentIndex = rows.findIndex((row) => row.cellId === cellId)
    const target = rows[currentIndex + direction]
    if (!target) return false
    const editor = globalThis.document.querySelector<HTMLTextAreaElement>(
      `[data-list-cell="${CSS.escape(target.cellId)}"]`,
    )
    if (!editor) return false
    editor.focus()
    const nextCaret = Math.min(caret, editor.value.length)
    editor.setSelectionRange(nextCaret, nextCaret)
    return true
  }

  const moveByWord = (editor: HTMLTextAreaElement, direction: -1 | 1) => {
    const position = editor.selectionStart
    const text = editor.value
    let next = position
    if (direction < 0) {
      const prefix = text.slice(0, position).replace(/\s+$/u, '')
      const match = prefix.match(/(?:^|\s)(\S+)$/u)
      next = match ? prefix.length - match[1].length : 0
    } else {
      const suffix = text.slice(position)
      const match = suffix.match(/^\s*\S+/u)
      next = match ? position + match[0].length : text.length
      while (next < text.length && /\s/u.test(text[next])) next += 1
    }
    editor.setSelectionRange(next, next)
  }

  return (
    <main className="list-editor" data-testid="list-view">
      <div className="list-editor-column" role="list" aria-label="Journal ideas">
        {rows.map((row) => {
          const cell = document.cells.find((candidate) => candidate.id === row.cellId)
          if (!cell) return null
          const groupColor = row.groupId
            ? document.groups.find((group) => group.id === row.groupId)?.style.tint
            : undefined
          return (
            <div
              className={`list-block depth-${row.depth} ${row.isGroupTitle ? 'is-group-title' : ''}`}
              key={cell.id}
              role="listitem"
              data-testid={`list-row-${cell.id}`}
              data-depth={row.depth}
              data-group-id={row.groupId ?? ''}
            >
              <span
                className="list-bullet"
                aria-hidden="true"
                style={groupColor ? { color: groupColor } : undefined}
              >
                ●
              </span>
              <textarea
                data-list-cell={cell.id}
                data-testid={`list-cell-${cell.id}`}
                aria-label={`${row.isGroupTitle ? 'Group title idea' : 'Journal idea'} ${cell.id}`}
                value={cell.text}
                rows={1}
                placeholder={reflectiveContentProvider.manualGhostPrompt(cell.creation.order)}
                onFocus={(event) =>
                  event.currentTarget.scrollIntoView({ block: 'nearest' })
                }
                onChange={(event) =>
                  onChange(updateListCellText(document, cell.id, event.currentTarget.value))
                }
                onBlur={() => onCommit(document, 'list-text-edit')}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault()
                    const result = splitListCellAt(
                      document,
                      cell.id,
                      event.currentTarget.selectionStart,
                      event.currentTarget.selectionEnd,
                    )
                    focusNextRef.current = { id: result.cellId, caret: 0 }
                    onChange(result.document)
                    onCommit(result.document, 'list-add-cell')
                    return
                  }
                  if (
                    event.altKey &&
                    !event.metaKey &&
                    !event.ctrlKey &&
                    (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
                  ) {
                    event.preventDefault()
                    moveByWord(event.currentTarget, event.key === 'ArrowLeft' ? -1 : 1)
                    return
                  }
                  if (
                    !event.altKey &&
                    !event.metaKey &&
                    !event.ctrlKey &&
                    event.key === 'ArrowUp'
                  ) {
                    if (
                      focusAdjacent(
                        cell.id,
                        -1,
                        event.currentTarget.selectionStart,
                      )
                    ) {
                      event.preventDefault()
                    }
                    return
                  }
                  if (
                    !event.altKey &&
                    !event.metaKey &&
                    !event.ctrlKey &&
                    event.key === 'ArrowDown'
                  ) {
                    if (
                      focusAdjacent(
                        cell.id,
                        1,
                        event.currentTarget.selectionStart,
                      )
                    ) {
                      event.preventDefault()
                    }
                    return
                  }
                  if (event.key === 'Tab') {
                    event.preventDefault()
                    const next = event.shiftKey
                      ? outdentListCell(document, cell.id)
                      : indentListCell(document, cell.id)
                    onChange(next)
                    onCommit(next, event.shiftKey ? 'list-ungroup' : 'list-group')
                  }
                }}
              />
              <span className="list-row-actions" aria-label="Row grouping actions">
                {row.depth > 0 ? (
                  <button
                    type="button"
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => {
                      const next = outdentListCell(document, cell.id)
                      onChange(next)
                      onCommit(next, 'list-ungroup')
                    }}
                  >
                    Ungroup
                  </button>
                ) : (
                  <button
                    type="button"
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => {
                      const next = indentListCell(document, cell.id)
                      onChange(next)
                      onCommit(next, 'list-group')
                    }}
                  >
                    Group
                  </button>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </main>
  )
}

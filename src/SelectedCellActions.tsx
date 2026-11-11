import { useState } from 'react'

interface SelectedCellActionsProps {
  selectionCount: number
  recommendedSplitCount: number | null
  onEdit: () => void
  onSplit: (count: number) => void
  onMergeNearest: () => void
  onGroup: () => void
  onDone: () => void
}

export function SelectedCellActions({
  selectionCount,
  recommendedSplitCount,
  onEdit,
  onSplit,
  onMergeNearest,
  onGroup,
  onDone,
}: SelectedCellActionsProps) {
  const [splitOpen, setSplitOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  if (selectionCount > 1) {
    return (
      <div
        className="selection-status-chip"
        data-testid="multi-select-status"
        role="status"
        aria-live="polite"
      >
        <span>{selectionCount} selected</span>
        <button type="button" onClick={onGroup}>Group</button>
        <button type="button" onClick={onDone}>Done</button>
      </div>
    )
  }

  if (selectionCount !== 1) return null
  return (
    <div
      className="selected-cell-actions"
      data-testid="selected-cell-actions"
      role="toolbar"
      aria-label="Selected cell actions"
    >
      <button type="button" onClick={onEdit}>Edit</button>
      <button
        type="button"
        aria-expanded={splitOpen}
        aria-controls="split-count-menu"
        onClick={() => {
          setSplitOpen((current) => !current)
          setMoreOpen(false)
        }}
      >
        Split
      </button>
      <button
        type="button"
        aria-expanded={moreOpen}
        aria-controls="selected-cell-more-menu"
        onClick={() => {
          setMoreOpen((current) => !current)
          setSplitOpen(false)
        }}
      >
        More
      </button>
      {splitOpen ? (
        <div id="split-count-menu" className="selected-cell-actions__menu" role="menu">
          {[2, 3, 4].map((count) => (
            <button
              key={count}
              type="button"
              role="menuitem"
              className={count === recommendedSplitCount ? 'is-recommended' : ''}
              onClick={() => onSplit(count)}
            >
              {count} cells{count === recommendedSplitCount ? ' · suggested' : ''}
            </button>
          ))}
        </div>
      ) : null}
      {moreOpen ? (
        <div
          id="selected-cell-more-menu"
          className="selected-cell-actions__menu"
          role="menu"
        >
          <button type="button" role="menuitem" onClick={onMergeNearest}>
            Merge with nearest
          </button>
        </div>
      ) : null}
    </div>
  )
}

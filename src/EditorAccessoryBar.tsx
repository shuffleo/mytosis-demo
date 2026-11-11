interface EditorAccessoryBarProps {
  onCancel: () => void
  onUndo: () => void
  onRedo: () => void
  onDone: () => void
}

export function EditorAccessoryBar({
  onCancel,
  onUndo,
  onRedo,
  onDone,
}: EditorAccessoryBarProps) {
  return (
    <div
      className="editor-accessory-bar"
      data-testid="editor-accessory-bar"
      role="toolbar"
      aria-label="Text editing controls"
    >
      <button type="button" onClick={onCancel}>Cancel</button>
      <span role="group" aria-label="Draft history">
        <button type="button" aria-label="Undo text edit" onClick={onUndo}>Undo</button>
        <button type="button" aria-label="Redo text edit" onClick={onRedo}>Redo</button>
      </span>
      <button type="button" className="is-primary" onClick={onDone}>Done</button>
    </div>
  )
}

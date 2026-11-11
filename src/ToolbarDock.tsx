import { deriveToolbarState, type ToolbarActiveTool } from './toolbar-state'

const TOOLBAR_ASSETS = {
  select: 'select tool.svg',
  addCell: 'add cell.svg',
  autoGroup: 'auto group.svg',
  group: 'group as group cell.svg',
  cultivate: 'cultivate : auto seed.svg',
  list: 'list view.svg',
  microscope: 'microscope view.svg',
  undo: 'undo.svg',
  redo: 'redo.svg',
} as const

function assetUrl(filename: (typeof TOOLBAR_ASSETS)[keyof typeof TOOLBAR_ASSETS]) {
  return encodeURI(`/assets/toolbar/${filename}`)
}

function ToolbarIcon({
  asset,
  size = 24,
}: {
  asset: keyof typeof TOOLBAR_ASSETS
  size?: number
}) {
  return (
    <span className="toolbar-icon" aria-hidden="true">
      <img
        alt=""
        draggable={false}
        src={assetUrl(TOOLBAR_ASSETS[asset])}
        width={size}
        height={size}
      />
    </span>
  )
}

interface ToolbarDockProps {
  viewMode: 'microscope' | 'list'
  activeTool: ToolbarActiveTool
  cultivateOn: boolean
  selectionCount: number
  clusteringActive: boolean
  transitionActive: boolean
  canUndo: boolean
  canRedo: boolean
  listDirty: boolean
  onSelect: () => void
  onAddCell: () => void
  onGroupAction: () => void
  onCultivate: () => void
  onUndo: () => void
  onRedo: () => void
  onOpenList: () => void
  onReturnMicroscope: () => void
}

export function ToolbarDock({
  viewMode,
  activeTool,
  cultivateOn,
  selectionCount,
  clusteringActive,
  transitionActive,
  canUndo,
  canRedo,
  listDirty,
  onSelect,
  onAddCell,
  onGroupAction,
  onCultivate,
  onUndo,
  onRedo,
  onOpenList,
  onReturnMicroscope,
}: ToolbarDockProps) {
  const state = deriveToolbarState({
    viewMode,
    activeTool,
    cultivateOn,
    selectionCount,
    clusteringActive,
    transitionActive,
  })
  const historyDisabled = clusteringActive || transitionActive
  const undoDisabled =
    viewMode === 'list'
      ? (!canUndo && !listDirty) || transitionActive
      : !canUndo || historyDisabled
  const redoDisabled =
    viewMode === 'list'
      ? !canRedo || listDirty || transitionActive
      : !canRedo || historyDisabled

  return (
    <nav aria-label="Journal controls">
      <div
        className={`toolbar-dock toolbar-dock--${viewMode}`}
        role="toolbar"
        aria-label={viewMode === 'list' ? 'List view controls' : 'Canvas tools'}
        onKeyDown={(event) => {
          if (
            event.key !== 'ArrowLeft' &&
            event.key !== 'ArrowRight' &&
            event.key !== 'ArrowUp' &&
            event.key !== 'ArrowDown'
          ) {
            return
          }
          const buttons = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              'button:not(:disabled)',
            ),
          )
          const currentIndex = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          )
          if (currentIndex < 0 || buttons.length < 2) return
          event.preventDefault()
          const backwards =
            event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          const nextIndex =
            (currentIndex + (backwards ? -1 : 1) + buttons.length) %
            buttons.length
          buttons[nextIndex]?.focus()
        }}
      >
      <div className="toolbar-capsule toolbar-capsule--history" role="group" aria-label="History">
        <button
          className="toolbar-icon-button"
          data-testid="history-undo"
          type="button"
          aria-label="Undo"
          aria-keyshortcuts="Control+Z Meta+Z"
          disabled={undoDisabled}
          onClick={onUndo}
        >
          <ToolbarIcon asset="undo" />
        </button>
        <button
          className="toolbar-icon-button"
          data-testid="history-redo"
          type="button"
          aria-label="Redo"
          aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
          disabled={redoDisabled}
          onClick={onRedo}
        >
          <ToolbarIcon asset="redo" />
        </button>
      </div>

      {viewMode === 'microscope' ? (
        <>
          <div className="toolbar-capsule toolbar-capsule--tools" role="group" aria-label="Tools">
            <button
              className={`toolbar-labeled-button ${
                state.activeTool === 'select' ? 'is-active-tool' : ''
              }`}
              data-testid="tool-select"
              type="button"
              aria-label="Select"
              aria-pressed={state.activeTool === 'select'}
              disabled={state.selectDisabled}
              onClick={onSelect}
            >
              <ToolbarIcon asset="select" />
              <span>Select</span>
            </button>
            <button
              className={`toolbar-labeled-button ${
                state.activeTool === 'addCell' ? 'is-active-tool' : ''
              }`}
              data-testid="tool-add"
              type="button"
              aria-label="Add cell"
              aria-pressed={state.activeTool === 'addCell'}
              disabled={state.addCellDisabled}
              onClick={onAddCell}
            >
              <ToolbarIcon asset="addCell" />
              <span>Add cell</span>
            </button>
            <button
              className="toolbar-labeled-button"
              data-testid={
                state.groupAction === 'group' ? 'tool-group' : 'autogroup-toggle'
              }
              type="button"
              aria-label={
                clusteringActive
                  ? 'Cancel Auto Group'
                  : state.groupLabel
              }
              aria-disabled={state.groupActionDisabled}
              disabled={state.groupActionDisabled}
              onClick={onGroupAction}
            >
              <ToolbarIcon
                asset={state.groupAction === 'group' ? 'group' : 'autoGroup'}
                size={state.groupAction === 'autoGroup' ? 20 : 24}
              />
              <span>{clusteringActive ? 'Cancel' : state.groupLabel}</span>
            </button>
            <button
              className={`toolbar-labeled-button ${
                state.cultivateOn ? 'is-toggle-on' : ''
              }`}
              data-testid="sprout-toggle"
              type="button"
              aria-label={state.cultivateLabel}
              aria-pressed={state.cultivateOn}
              disabled={state.cultivateDisabled}
              onClick={onCultivate}
            >
              <ToolbarIcon asset="cultivate" />
              <span>{state.cultivateLabel}</span>
            </button>
          </div>
          <div className="toolbar-capsule toolbar-capsule--view" role="group" aria-label="View">
            <button
              className="toolbar-icon-button"
              data-testid="list-view-toggle"
              type="button"
              aria-label="Open bullet list view"
              disabled={state.viewDisabled}
              onClick={onOpenList}
            >
              <ToolbarIcon asset="list" />
            </button>
          </div>
        </>
      ) : (
        <div className="toolbar-capsule toolbar-capsule--view" role="group" aria-label="View">
          <button
            className="toolbar-icon-button"
            data-testid="return-microscope"
            type="button"
            aria-label="Return to microscope view"
            disabled={transitionActive}
            onClick={onReturnMicroscope}
          >
            <ToolbarIcon asset="microscope" />
          </button>
        </div>
      )}
      </div>
    </nav>
  )
}

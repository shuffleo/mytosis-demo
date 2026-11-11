export type ToolbarViewMode = 'microscope' | 'list'
export type ToolbarActiveTool = 'select' | 'addCell'

export interface ToolbarStateInput {
  viewMode: ToolbarViewMode
  activeTool: ToolbarActiveTool
  cultivateOn: boolean
  selectionCount: number
  clusteringActive: boolean
  transitionActive: boolean
}

export interface ToolbarState extends ToolbarStateInput {
  groupAction: 'autoGroup' | 'group'
  groupLabel: 'Auto Group' | 'Group'
  cultivateLabel: 'Cultivate' | 'Cultivating'
  addCellDisabled: boolean
  groupActionDisabled: boolean
  selectDisabled: boolean
  cultivateDisabled: boolean
  viewDisabled: boolean
}

export function deriveToolbarState(input: ToolbarStateInput): ToolbarState {
  const groupAction = input.selectionCount > 1 ? 'group' : 'autoGroup'
  return {
    ...input,
    groupAction,
    groupLabel: groupAction === 'group' ? 'Group' : 'Auto Group',
    cultivateLabel: input.cultivateOn ? 'Cultivating' : 'Cultivate',
    addCellDisabled:
      input.selectionCount > 1 ||
      input.clusteringActive ||
      input.transitionActive,
    groupActionDisabled: input.transitionActive,
    selectDisabled: input.clusteringActive || input.transitionActive,
    cultivateDisabled: input.clusteringActive || input.transitionActive,
    viewDisabled: input.clusteringActive || input.transitionActive,
  }
}

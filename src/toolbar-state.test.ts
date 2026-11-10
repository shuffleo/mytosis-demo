import { describe, expect, it } from 'vitest'
import { deriveToolbarState, type ToolbarStateInput } from './toolbar-state'

const base: ToolbarStateInput = {
  viewMode: 'microscope',
  activeTool: 'select',
  cultivateOn: false,
  selectionCount: 0,
  clusteringActive: false,
  transitionActive: false,
}

describe('toolbar state', () => {
  it('starts with Select active and exposes the one-shot Auto Group action', () => {
    expect(deriveToolbarState(base)).toMatchObject({
      activeTool: 'select',
      groupAction: 'autoGroup',
      groupLabel: 'Auto Group',
      cultivateLabel: 'Cultivate',
      addCellDisabled: false,
    })
  })

  it('turns a multi-selection into a Group action and blocks Add cell', () => {
    expect(deriveToolbarState({ ...base, selectionCount: 3 })).toMatchObject({
      groupAction: 'group',
      groupLabel: 'Group',
      addCellDisabled: true,
      groupActionDisabled: false,
    })
  })

  it('keeps the cultivate label and pressed state independent from selection', () => {
    expect(
      deriveToolbarState({ ...base, cultivateOn: true, selectionCount: 2 }),
    ).toMatchObject({
      cultivateOn: true,
      cultivateLabel: 'Cultivating',
      groupLabel: 'Group',
    })
  })

  it('blocks toolbar actions during clustering and transitions', () => {
    expect(deriveToolbarState({ ...base, clusteringActive: true })).toMatchObject({
      selectDisabled: true,
      addCellDisabled: true,
      cultivateDisabled: true,
      viewDisabled: true,
    })
    expect(deriveToolbarState({ ...base, transitionActive: true })).toMatchObject({
      selectDisabled: true,
      addCellDisabled: true,
      groupActionDisabled: true,
      cultivateDisabled: true,
      viewDisabled: true,
    })
  })
})

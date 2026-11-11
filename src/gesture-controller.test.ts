import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  GestureController,
  type GestureControllerCallbacks,
} from './gesture-controller'

function harness() {
  const callbacks: GestureControllerCallbacks = {
    onTap: vi.fn(),
    onHold: vi.fn(),
    onDragStart: vi.fn(),
    onDragMove: vi.fn(),
    onDragEnd: vi.fn(),
    onCancel: vi.fn(),
  }
  return {
    callbacks,
    controller: new GestureController(callbacks),
  }
}

describe('gesture controller', () => {
  afterEach(() => vi.useRealTimers())

  it('maps a stationary touch to one tap', () => {
    const { callbacks, controller } = harness()
    const event = {
      pointerId: 1,
      pointerType: 'touch' as const,
      point: { x: 20, y: 30 },
      timeStamp: 0,
    }
    controller.pointerDown(event)
    controller.pointerUp({ ...event, timeStamp: 80 })
    expect(callbacks.onTap).toHaveBeenCalledOnce()
    expect(callbacks.onDragStart).not.toHaveBeenCalled()
  })

  it('uses pointer-specific slop before dragging', () => {
    const { callbacks, controller } = harness()
    controller.pointerDown({
      pointerId: 2,
      pointerType: 'touch',
      point: { x: 10, y: 10 },
      timeStamp: 0,
    })
    controller.pointerMove({
      pointerId: 2,
      pointerType: 'touch',
      point: { x: 18, y: 10 },
      timeStamp: 20,
    })
    expect(callbacks.onDragStart).not.toHaveBeenCalled()
    controller.pointerMove({
      pointerId: 2,
      pointerType: 'touch',
      point: { x: 22, y: 10 },
      timeStamp: 30,
    })
    expect(callbacks.onDragStart).toHaveBeenCalledOnce()
    expect(callbacks.onDragMove).toHaveBeenCalledOnce()
  })

  it('turns a 500ms hold into multi-select intent without a tap', () => {
    vi.useFakeTimers()
    const { callbacks, controller } = harness()
    const event = {
      pointerId: 3,
      pointerType: 'pen' as const,
      point: { x: 40, y: 50 },
      timeStamp: 0,
    }
    controller.pointerDown(event)
    vi.advanceTimersByTime(500)
    controller.pointerUp({ ...event, timeStamp: 520 })
    expect(callbacks.onHold).toHaveBeenCalledOnce()
    expect(callbacks.onTap).not.toHaveBeenCalled()
  })

  it('cancels the entire pending gesture when a second pointer arrives', () => {
    const { callbacks, controller } = harness()
    controller.pointerDown({
      pointerId: 4,
      pointerType: 'touch',
      point: { x: 0, y: 0 },
      timeStamp: 0,
    })
    expect(
      controller.pointerDown({
        pointerId: 5,
        pointerType: 'touch',
        point: { x: 4, y: 4 },
        timeStamp: 10,
      }),
    ).toBe(false)
    expect(callbacks.onCancel).toHaveBeenCalledWith('second-pointer')
  })
})

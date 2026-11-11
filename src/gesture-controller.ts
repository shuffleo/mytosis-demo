import type { Point2 } from './geometry'

export type PointerKind = 'mouse' | 'touch' | 'pen'

export interface GesturePointerEvent {
  pointerId: number
  pointerType: PointerKind
  point: Point2
  timeStamp: number
}

export interface GestureControllerCallbacks {
  onTap: (event: GesturePointerEvent) => void
  onHold: (event: GesturePointerEvent) => void
  onDragStart: (event: GesturePointerEvent, origin: Point2) => void
  onDragMove: (event: GesturePointerEvent, origin: Point2) => void
  onDragEnd: (event: GesturePointerEvent, origin: Point2) => void
  onCancel: (reason: 'pointer-cancel' | 'second-pointer') => void
}

interface ActivePointer {
  id: number
  pointerType: PointerKind
  origin: Point2
  latest: Point2
  startedAt: number
  dragging: boolean
  held: boolean
  timer: number | null
}

const SLOP: Record<PointerKind, number> = {
  mouse: 4,
  pen: 6,
  touch: 10,
}

export class GestureController {
  private active: ActivePointer | null = null
  private readonly callbacks: GestureControllerCallbacks
  private readonly holdMs: number

  constructor(callbacks: GestureControllerCallbacks, holdMs = 500) {
    this.callbacks = callbacks
    this.holdMs = holdMs
  }

  pointerDown(event: GesturePointerEvent) {
    if (this.active) {
      this.clearTimer()
      this.active = null
      this.callbacks.onCancel('second-pointer')
      return false
    }
    this.active = {
      id: event.pointerId,
      pointerType: event.pointerType,
      origin: { ...event.point },
      latest: { ...event.point },
      startedAt: event.timeStamp,
      dragging: false,
      held: false,
      timer: globalThis.setTimeout(() => {
        const active = this.active
        if (!active || active.id !== event.pointerId || active.dragging) return
        active.held = true
        this.callbacks.onHold({
          ...event,
          point: { ...active.latest },
          timeStamp: performance.now(),
        })
      }, this.holdMs),
    }
    return true
  }

  pointerMove(event: GesturePointerEvent) {
    const active = this.active
    if (!active || active.id !== event.pointerId || active.held) return
    active.latest = { ...event.point }
    const travel = Math.hypot(
      active.latest.x - active.origin.x,
      active.latest.y - active.origin.y,
    )
    if (!active.dragging && travel > SLOP[active.pointerType]) {
      active.dragging = true
      this.clearTimer()
      this.callbacks.onDragStart(event, active.origin)
    }
    if (active.dragging) this.callbacks.onDragMove(event, active.origin)
  }

  pointerUp(event: GesturePointerEvent) {
    const active = this.active
    if (!active || active.id !== event.pointerId) return
    this.clearTimer()
    this.active = null
    if (active.held) return
    if (active.dragging) this.callbacks.onDragEnd(event, active.origin)
    else this.callbacks.onTap(event)
  }

  pointerCancel(pointerId: number) {
    if (!this.active || this.active.id !== pointerId) return
    this.clearTimer()
    this.active = null
    this.callbacks.onCancel('pointer-cancel')
  }

  dispose() {
    this.clearTimer()
    this.active = null
  }

  private clearTimer() {
    if (this.active?.timer !== null && this.active?.timer !== undefined) {
      globalThis.clearTimeout(this.active.timer)
      this.active.timer = null
    }
  }
}

export function mobilePointerGesturesEnabled() {
  const query = new URLSearchParams(window.location.search).get('pointerGestures')
  if (query === '1') return true
  if (query === '0') return false
  return window.localStorage.getItem('mytosis.pointer-gestures') === 'enabled'
}

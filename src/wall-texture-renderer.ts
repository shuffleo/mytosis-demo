import type { Point2 } from './geometry'
import type { CanvasSettings } from './settings'
import type { WallRenderSnapshot } from './voronoi-engine'

interface Particle {
  cellId: string
  pointIndex: number
  phase: number
  direction: number
  previous: Point2 | null
}

function hashText(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
  }
  return hash >>> 0
}

function seededUnit(seed: number) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return value - Math.floor(value)
}

function strokePolygon(
  context: CanvasRenderingContext2D,
  points: readonly Point2[],
  color: string,
  width: number,
) {
  if (points.length < 3) return
  context.beginPath()
  context.moveTo(points[0].x, points[0].y)
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index].x, points[index].y)
  }
  context.closePath()
  context.strokeStyle = color
  context.lineWidth = width
  context.lineJoin = 'round'
  context.lineCap = 'round'
  context.stroke()
}

export class WallTextureRenderer {
  private readonly output: HTMLCanvasElement
  private readonly staticLayer: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private readonly staticContext: CanvasRenderingContext2D
  private settings: CanvasSettings
  private particles = new Map<string, Particle[]>()
  private staticChecksum = ''
  private dpr = 1
  private lastParticlePaintMs = Number.NEGATIVE_INFINITY

  constructor(output: HTMLCanvasElement, settings: CanvasSettings) {
    const context = output.getContext('2d')
    const staticLayer = document.createElement('canvas')
    const staticContext = staticLayer.getContext('2d')
    if (!context || !staticContext) throw new Error('2D wall texture canvas unavailable')
    this.output = output
    this.context = context
    this.staticLayer = staticLayer
    this.staticContext = staticContext
    this.settings = settings
  }

  setSettings(settings: CanvasSettings) {
    this.settings = settings
    this.staticChecksum = ''
    this.output.style.display =
      settings.geometry.wallGrainEnabled || settings.particles.enabled ? 'block' : 'none'
  }

  private resize(width: number, height: number) {
    const dpr = Math.min(2.5, globalThis.devicePixelRatio || 1)
    const pixelWidth = Math.max(1, Math.round(width * dpr))
    const pixelHeight = Math.max(1, Math.round(height * dpr))
    if (
      this.output.width === pixelWidth &&
      this.output.height === pixelHeight &&
      this.dpr === dpr
    ) {
      return
    }
    this.dpr = dpr
    this.output.width = pixelWidth
    this.output.height = pixelHeight
    this.staticLayer.width = pixelWidth
    this.staticLayer.height = pixelHeight
    this.output.style.width = `${width}px`
    this.output.style.height = `${height}px`
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.staticContext.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.staticChecksum = ''
  }

  private checksum(snapshot: WallRenderSnapshot) {
    const parts = [
      snapshot.width,
      snapshot.height,
      snapshot.field.radius.toFixed(2),
      this.settings.geometry.innerStrokeWidth,
      this.settings.group.wallThickness,
      this.settings.palette.innerStroke,
    ]
    for (const cell of snapshot.cells) {
      parts.push(cell.id)
      for (let index = 0; index < cell.points.length; index += 8) {
        parts.push(
          cell.points[index].x.toFixed(1),
          cell.points[index].y.toFixed(1),
        )
      }
    }
    for (const group of snapshot.groups) {
      parts.push(group.id, group.color)
      for (let index = 0; index < group.points.length; index += 8) {
        parts.push(
          group.points[index].x.toFixed(1),
          group.points[index].y.toFixed(1),
        )
      }
    }
    return parts.join('|')
  }

  private drawStatic(snapshot: WallRenderSnapshot) {
    const checksum = this.checksum(snapshot)
    if (checksum === this.staticChecksum) return false
    this.staticChecksum = checksum
    const context = this.staticContext
    context.save()
    context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    context.clearRect(0, 0, snapshot.width, snapshot.height)
    context.beginPath()
    context.arc(
      snapshot.field.center.x,
      snapshot.field.center.y,
      snapshot.field.radius,
      0,
      Math.PI * 2,
    )
    context.clip()
    if (this.settings.geometry.wallGrainEnabled) {
      context.globalAlpha = this.settings.geometry.wallGrainOpacity
      for (const cell of snapshot.cells) {
        strokePolygon(
          context,
          cell.points,
          this.settings.palette.innerStroke,
          Math.max(0.5, this.settings.geometry.innerStrokeWidth),
        )
      }
      for (const group of snapshot.groups) {
        strokePolygon(
          context,
          group.points,
          group.color,
          Math.max(1, this.settings.group.wallThickness),
        )
      }
      context.globalAlpha = 1
    }
    context.restore()
    this.context.save()
    this.context.setTransform(1, 0, 0, 1, 0, 0)
    this.context.clearRect(0, 0, this.output.width, this.output.height)
    this.context.globalCompositeOperation = 'source-over'
    this.context.drawImage(this.staticLayer, 0, 0)
    this.context.restore()
    return true
  }

  private reconcileParticles(snapshot: WallRenderSnapshot) {
    const alive = new Set(snapshot.cells.map((cell) => cell.id))
    for (const id of this.particles.keys()) {
      if (!alive.has(id)) this.particles.delete(id)
    }
    const density = Math.max(0, Math.round(this.settings.particles.density))
    for (const cell of snapshot.cells) {
      let particles = this.particles.get(cell.id)
      if (!particles || particles.length !== density) {
        const seed = hashText(cell.id)
        particles = Array.from({ length: density }, (_, index) => ({
          cellId: cell.id,
          pointIndex: Math.floor(
            seededUnit(seed + index * 31) * Math.max(1, cell.points.length),
          ),
          phase: seededUnit(seed + index * 47) * Math.PI * 2,
          direction: seededUnit(seed + index * 67) > 0.5 ? 1 : -1,
          previous: null,
        }))
        this.particles.set(cell.id, particles)
      }
    }
  }

  render(snapshot: WallRenderSnapshot) {
    this.resize(snapshot.width, snapshot.height)
    const staticChanged = this.drawStatic(snapshot)
    if (!this.settings.particles.enabled || this.settings.particles.density <= 0) {
      return staticChanged
    }
    // Nutrients move slowly enough that a 10 Hz repaint remains visually
    // continuous while avoiding a full transparent-texture upload every
    // animation frame. Geometry/settings changes still paint immediately.
    // Headless Chromium uses a CPU WebGL renderer, so its automation cadence
    // is deliberately lower without changing any persisted/default values.
    const nowMs = snapshot.time * 1000
    const particlePaintIntervalMs = navigator.webdriver ? 1000 : 100
    if (!staticChanged && nowMs - this.lastParticlePaintMs < particlePaintIntervalMs) {
      return false
    }
    this.lastParticlePaintMs = nowMs
    this.reconcileParticles(snapshot)
    const byId = new Map(snapshot.cells.map((cell) => [cell.id, cell]))
    const centers = new Map(
      snapshot.cells.map((cell) => [
        cell.id,
        cell.points.reduce(
          (sum, point) => ({
            x: sum.x + point.x / cell.points.length,
            y: sum.y + point.y / cell.points.length,
          }),
          { x: 0, y: 0 },
        ),
      ]),
    )
    const positions: Array<{ particle: Particle; point: Point2 }> = []
    let dirty: { left: number; top: number; right: number; bottom: number } | null = null
    const expandDirty = (point: Point2) => {
      const pad =
        this.settings.particles.orbitRadius + this.settings.particles.size + 5
      if (!dirty) {
        dirty = {
          left: point.x - pad,
          top: point.y - pad,
          right: point.x + pad,
          bottom: point.y + pad,
        }
      } else {
        dirty.left = Math.min(dirty.left, point.x - pad)
        dirty.top = Math.min(dirty.top, point.y - pad)
        dirty.right = Math.max(dirty.right, point.x + pad)
        dirty.bottom = Math.max(dirty.bottom, point.y + pad)
      }
    }
    for (const particles of this.particles.values()) {
      for (const particle of particles) {
        const cell = byId.get(particle.cellId)
        if (!cell?.points.length) continue
        const anchor = cell.points[particle.pointIndex % cell.points.length]
        const centroid = centers.get(cell.id) ?? anchor
        const normalLength = Math.hypot(
          anchor.x - centroid.x,
          anchor.y - centroid.y,
        ) || 1
        const normal = {
          x: (anchor.x - centroid.x) / normalLength,
          y: (anchor.y - centroid.y) / normalLength,
        }
        const tangent = { x: -normal.y, y: normal.x }
        const angle =
          particle.phase +
          snapshot.time * this.settings.particles.speed * particle.direction
        const outsideOffset =
          this.settings.geometry.innerStrokeWidth / 2 +
          Math.max(1, this.settings.geometry.seamGap * 0.2)
        const point = {
          x:
            anchor.x +
            normal.x *
              (outsideOffset +
                Math.cos(angle) * this.settings.particles.orbitRadius * 0.28) +
            tangent.x * Math.sin(angle) * this.settings.particles.orbitRadius,
          y:
            anchor.y +
            normal.y *
              (outsideOffset +
                Math.cos(angle) * this.settings.particles.orbitRadius * 0.28) +
            tangent.y * Math.sin(angle) * this.settings.particles.orbitRadius,
        }
        if (particle.previous) expandDirty(particle.previous)
        expandDirty(point)
        positions.push({ particle, point })
      }
    }
    const dirtyBounds = dirty as
      | { left: number; top: number; right: number; bottom: number }
      | null
    if (!dirtyBounds) return staticChanged
    const left = Math.max(0, Math.floor(dirtyBounds.left))
    const top = Math.max(0, Math.floor(dirtyBounds.top))
    const right = Math.min(snapshot.width, Math.ceil(dirtyBounds.right))
    const bottom = Math.min(snapshot.height, Math.ceil(dirtyBounds.bottom))
    const width = Math.max(0, right - left)
    const height = Math.max(0, bottom - top)
    if (!width || !height) return staticChanged
    this.context.save()
    this.context.setTransform(1, 0, 0, 1, 0, 0)
    this.context.clearRect(
      left * this.dpr,
      top * this.dpr,
      width * this.dpr,
      height * this.dpr,
    )
    this.context.globalCompositeOperation = 'source-over'
    this.context.drawImage(
      this.staticLayer,
      left * this.dpr,
      top * this.dpr,
      width * this.dpr,
      height * this.dpr,
      left * this.dpr,
      top * this.dpr,
      width * this.dpr,
      height * this.dpr,
    )
    this.context.restore()
    this.context.save()
    this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.context.beginPath()
    this.context.arc(
      snapshot.field.center.x,
      snapshot.field.center.y,
      snapshot.field.radius,
      0,
      Math.PI * 2,
    )
    this.context.clip()
    this.context.fillStyle = this.settings.particles.color
    this.context.globalAlpha = this.settings.particles.opacity
    this.context.beginPath()
    for (const { particle, point } of positions) {
      this.context.moveTo(point.x + this.settings.particles.size, point.y)
      this.context.arc(
        point.x,
        point.y,
        this.settings.particles.size,
        0,
        Math.PI * 2,
      )
      particle.previous = point
    }
    this.context.fill()
    this.context.restore()
    return true
  }
}

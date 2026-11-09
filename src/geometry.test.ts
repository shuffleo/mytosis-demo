import { describe, expect, it } from 'vitest'
import {
  circlePolygon,
  clipConvexPolygon,
  computePowerDiagram,
  findDelaunayTriples,
  insetConvexPolygon,
  normalizeWinding,
  polygonArea,
  polygonCentroid,
  polygonSignedArea,
  rayPolygonIntersection,
  roundedPolygon,
  samplePolygon,
  stableSamplePolygon,
} from './geometry'

describe('power diagram geometry', () => {
  it('splits an unweighted pair at the perpendicular bisector', () => {
    const cells = computePowerDiagram(
      [
        { id: 'left', x: 25, y: 50, weight: 0 },
        { id: 'right', x: 75, y: 50, weight: 0 },
      ],
      { width: 100, height: 100 },
    )

    expect(polygonArea(cells[0].polygon)).toBeCloseTo(5000)
    expect(polygonArea(cells[1].polygon)).toBeCloseTo(5000)
    expect(Math.max(...cells[0].polygon.map((point) => point.x))).toBeCloseTo(50)
  })

  it('grows a site by moving the shared power boundary', () => {
    const cells = computePowerDiagram(
      [
        { id: 'left', x: 25, y: 50, weight: 1000 },
        { id: 'right', x: 75, y: 50, weight: 0 },
      ],
      { width: 100, height: 100 },
    )

    expect(Math.max(...cells[0].polygon.map((point) => point.x))).toBeCloseTo(60)
    expect(polygonArea(cells[0].polygon)).toBeGreaterThan(polygonArea(cells[1].polygon))
  })

  it('resamples cells and locates cardinal resize handles', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]
    const center = polygonCentroid(square)
    const samples = samplePolygon(square, 32)
    const right = rayPolygonIntersection(center, { x: 1, y: 0 }, square)

    expect(center).toEqual({ x: 50, y: 50 })
    expect(samples).toHaveLength(32)
    expect(right).toEqual({ x: 100, y: 50 })
  })

  it('clips every power cell to the circular field', () => {
    const center = { x: 80, y: 80 }
    const boundary = circlePolygon(center, 60, 96)
    const cells = computePowerDiagram(
      [
        { id: 'a', x: 50, y: 60, weight: 0 },
        { id: 'b', x: 105, y: 55, weight: 0 },
        { id: 'c', x: 82, y: 112, weight: 0 },
      ],
      { width: 160, height: 160, boundary },
    )

    for (const cell of cells) {
      for (const point of cell.polygon) {
        expect(Math.hypot(point.x - center.x, point.y - center.y)).toBeLessThanOrEqual(60.01)
      }
    }
  })

  it('clips expanded group walls back inside the circular field', () => {
    const center = { x: 50, y: 50 }
    const clipped = clipConvexPolygon(
      [
        { x: -20, y: 20 },
        { x: 120, y: 20 },
        { x: 120, y: 80 },
        { x: -20, y: 80 },
      ],
      circlePolygon(center, 48, 96),
    )

    expect(clipped.length).toBeGreaterThan(4)
    for (const point of clipped) {
      expect(Math.hypot(point.x - center.x, point.y - center.y)).toBeLessThanOrEqual(48.01)
    }
  })

  it('creates genuine inset gaps and rounded geometry', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]
    const inset = insetConvexPolygon(square, 8)
    const rounded = roundedPolygon(inset, 10, 5)

    expect(polygonArea(inset)).toBeLessThan(polygonArea(square))
    expect(rounded.length).toBeGreaterThan(inset.length)
    expect(polygonArea(rounded)).toBeLessThan(polygonArea(inset))
  })

  it('clips acute insets without unbounded miter spikes', () => {
    const acuteTriangle = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0.1, y: 1 },
    ]
    const inset = insetConvexPolygon(acuteTriangle, 4)

    // Half-plane clipping collapses an impossible inset instead of
    // intersecting offset lines into a hundreds-of-pixels miter spike.
    expect(inset).toEqual([])
  })

  it('keeps winding and point correspondence stable through topology changes', () => {
    const previous = stableSamplePolygon(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      48,
    )
    const changed = [
      { x: 101, y: 101 },
      { x: 49, y: 106 },
      { x: -1, y: 101 },
      { x: -2, y: -1 },
      { x: 102, y: -2 },
    ].reverse()
    const next = stableSamplePolygon(changed, 48, previous)
    const averageMotion =
      next.reduce(
        (total, point, index) =>
          total + Math.hypot(point.x - previous[index].x, point.y - previous[index].y),
        0,
      ) / next.length

    expect(polygonSignedArea(normalizeWinding(changed))).toBeGreaterThan(0)
    expect(next).toHaveLength(previous.length)
    expect(averageMotion).toBeLessThan(12)
  })

  it('identifies empty-circumcircle Delaunay triples', () => {
    const triples = findDelaunayTriples([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 100, y: 0 },
      { id: 'c', x: 50, y: 80 },
      { id: 'd', x: 50, y: 35 },
    ])

    expect(triples.length).toBeGreaterThan(0)
    expect(
      triples.every((triple) => triple.ids.length === 3 && Number.isFinite(triple.circumcenter.x)),
    ).toBe(true)
  })
})

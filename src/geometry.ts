export interface Point2 {
  x: number
  y: number
}

export interface WeightedSite extends Point2 {
  id: string
  weight: number
}

export interface DiagramBounds {
  width: number
  height: number
  boundary?: readonly Point2[]
}

export interface PowerCell {
  site: WeightedSite
  polygon: Point2[]
}

const EPSILON = 1e-7

function clipToHalfPlane(
  polygon: readonly Point2[],
  normalX: number,
  normalY: number,
  limit: number,
) {
  if (polygon.length === 0) return []

  const clipped: Point2[] = []
  const signedDistance = (point: Point2) => normalX * point.x + normalY * point.y - limit

  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]
    const end = polygon[(index + 1) % polygon.length]
    const startDistance = signedDistance(start)
    const endDistance = signedDistance(end)
    const startInside = startDistance <= EPSILON
    const endInside = endDistance <= EPSILON

    if (startInside) clipped.push(start)
    if (startInside === endInside) continue

    const denominator = startDistance - endDistance
    if (Math.abs(denominator) <= EPSILON) continue
    const ratio = startDistance / denominator
    clipped.push({
      x: start.x + (end.x - start.x) * ratio,
      y: start.y + (end.y - start.y) * ratio,
    })
  }

  return clipped
}

export function computePowerDiagram(
  sites: readonly WeightedSite[],
  bounds: DiagramBounds,
): PowerCell[] {
  const rectangle: Point2[] = bounds.boundary
    ? normalizeWinding(bounds.boundary)
    : [
        { x: 0, y: 0 },
        { x: bounds.width, y: 0 },
        { x: bounds.width, y: bounds.height },
        { x: 0, y: bounds.height },
      ]

  return sites.map((site, siteIndex) => {
    let polygon = rectangle

    for (let otherIndex = 0; otherIndex < sites.length; otherIndex += 1) {
      if (otherIndex === siteIndex || polygon.length === 0) continue
      const other = sites[otherIndex]
      const normalX = 2 * (other.x - site.x)
      const normalY = 2 * (other.y - site.y)
      const limit =
        other.x * other.x +
        other.y * other.y -
        other.weight -
        (site.x * site.x + site.y * site.y) +
        site.weight
      polygon = clipToHalfPlane(polygon, normalX, normalY, limit)
    }

    return { site, polygon }
  })
}

export function clipConvexPolygon(
  polygon: readonly Point2[],
  boundary: readonly Point2[],
): Point2[] {
  const normalizedBoundary = normalizeWinding(boundary)
  let clipped = normalizeWinding(polygon)
  for (let index = 0; index < normalizedBoundary.length; index += 1) {
    const start = normalizedBoundary[index]
    const end = normalizedBoundary[(index + 1) % normalizedBoundary.length]
    const edgeX = end.x - start.x
    const edgeY = end.y - start.y
    clipped = clipToHalfPlane(
      clipped,
      edgeY,
      -edgeX,
      edgeY * start.x - edgeX * start.y,
    )
    if (clipped.length === 0) break
  }
  return clipped
}

export function polygonCentroid(polygon: readonly Point2[]): Point2 {
  if (polygon.length === 0) return { x: 0, y: 0 }

  let signedArea = 0
  let centerX = 0
  let centerY = 0

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]
    const next = polygon[(index + 1) % polygon.length]
    const cross = current.x * next.y - next.x * current.y
    signedArea += cross
    centerX += (current.x + next.x) * cross
    centerY += (current.y + next.y) * cross
  }

  if (Math.abs(signedArea) <= EPSILON) {
    return polygon.reduce(
      (sum, point) => ({ x: sum.x + point.x / polygon.length, y: sum.y + point.y / polygon.length }),
      { x: 0, y: 0 },
    )
  }

  return {
    x: centerX / (3 * signedArea),
    y: centerY / (3 * signedArea),
  }
}

export function polygonArea(polygon: readonly Point2[]) {
  return Math.abs(polygonSignedArea(polygon))
}

export function polygonSignedArea(polygon: readonly Point2[]) {
  let twiceArea = 0
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]
    const next = polygon[(index + 1) % polygon.length]
    twiceArea += current.x * next.y - next.x * current.y
  }
  return twiceArea / 2
}

export function normalizeWinding(polygon: readonly Point2[]): Point2[] {
  const normalized = polygon.map((point) => ({ ...point }))
  return polygonSignedArea(normalized) < 0 ? normalized.reverse() : normalized
}

export function polygonBounds(polygon: readonly Point2[]) {
  if (polygon.length === 0) {
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }
  }

  const xs = polygon.map((point) => point.x)
  const ys = polygon.map((point) => point.y)
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  const right = Math.max(...xs)
  const bottom = Math.max(...ys)
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

export function samplePolygon(polygon: readonly Point2[], sampleCount: number): Point2[] {
  if (polygon.length === 0) return []
  if (polygon.length === 1) return Array.from({ length: sampleCount }, () => ({ ...polygon[0] }))

  const edgeLengths = polygon.map((point, index) => {
    const next = polygon[(index + 1) % polygon.length]
    return Math.hypot(next.x - point.x, next.y - point.y)
  })
  const perimeter = edgeLengths.reduce((sum, length) => sum + length, 0)
  if (perimeter <= EPSILON) return Array.from({ length: sampleCount }, () => ({ ...polygon[0] }))

  const samples: Point2[] = []
  let edgeIndex = 0
  let edgeStartDistance = 0

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const targetDistance = (perimeter * sampleIndex) / sampleCount
    while (
      edgeIndex < edgeLengths.length - 1 &&
      edgeStartDistance + edgeLengths[edgeIndex] < targetDistance
    ) {
      edgeStartDistance += edgeLengths[edgeIndex]
      edgeIndex += 1
    }
    const start = polygon[edgeIndex]
    const end = polygon[(edgeIndex + 1) % polygon.length]
    const edgeLength = edgeLengths[edgeIndex]
    const ratio = edgeLength <= EPSILON ? 0 : (targetDistance - edgeStartDistance) / edgeLength
    samples.push({
      x: start.x + (end.x - start.x) * ratio,
      y: start.y + (end.y - start.y) * ratio,
    })
  }

  return samples
}

export function pointToSegmentDistance(point: Point2, start: Point2, end: Point2) {
  const edgeX = end.x - start.x
  const edgeY = end.y - start.y
  const lengthSquared = edgeX * edgeX + edgeY * edgeY
  if (lengthSquared <= EPSILON) return Math.hypot(point.x - start.x, point.y - start.y)
  const ratio = clamp(
    ((point.x - start.x) * edgeX + (point.y - start.y) * edgeY) / lengthSquared,
    0,
    1,
  )
  return Math.hypot(point.x - (start.x + edgeX * ratio), point.y - (start.y + edgeY * ratio))
}

export function pointInPolygon(point: Point2, polygon: readonly Point2[]) {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index]
    const previousPoint = polygon[previous]
    const crosses =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y || Number.EPSILON) +
          currentPoint.x
    if (crosses) inside = !inside
  }
  return inside
}

export function distanceToPolygonEdges(point: Point2, polygon: readonly Point2[]) {
  if (polygon.length < 2) return Number.POSITIVE_INFINITY
  return Math.min(
    ...polygon.map((start, index) =>
      pointToSegmentDistance(point, start, polygon[(index + 1) % polygon.length]),
    ),
  )
}

export function alignSampledPolygon(
  points: readonly Point2[],
  previous: readonly Point2[] | undefined,
) {
  if (!previous || previous.length !== points.length || points.length === 0) {
    return points.map((point) => ({ ...point }))
  }

  let bestOffset = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (let offset = 0; offset < points.length; offset += 1) {
    let total = 0
    for (let index = 0; index < points.length; index += 1) {
      const point = points[(index + offset) % points.length]
      const oldPoint = previous[index]
      const dx = point.x - oldPoint.x
      const dy = point.y - oldPoint.y
      total += dx * dx + dy * dy
    }
    if (total < bestDistance) {
      bestDistance = total
      bestOffset = offset
    }
  }

  return points.map((_, index) => ({ ...points[(index + bestOffset) % points.length] }))
}

export function stableSamplePolygon(
  polygon: readonly Point2[],
  sampleCount: number,
  previous?: readonly Point2[],
) {
  if (polygon.length < 3) return samplePolygon(polygon, sampleCount)
  const normalized = normalizeWinding(polygon)
  const center = polygonCentroid(normalized)
  const anchor = rayPolygonIntersection(center, { x: 1, y: 0 }, normalized)
  let anchorEdge = 0
  let anchorDistance = Number.POSITIVE_INFINITY

  for (let index = 0; index < normalized.length; index += 1) {
    const edgeDistance = pointToSegmentDistance(
      anchor,
      normalized[index],
      normalized[(index + 1) % normalized.length],
    )
    if (edgeDistance < anchorDistance) {
      anchorDistance = edgeDistance
      anchorEdge = index
    }
  }

  const anchored = [
    anchor,
    ...Array.from(
      { length: normalized.length },
      (_, index) => normalized[(anchorEdge + 1 + index) % normalized.length],
    ),
  ]
  return alignSampledPolygon(samplePolygon(anchored, sampleCount), previous)
}

export function insetConvexPolygon(polygon: readonly Point2[], inset: number): Point2[] {
  const normalized = normalizeWinding(polygon)
  if (normalized.length < 3 || Math.abs(inset) <= EPSILON) return normalized
  let clipped = normalized.map((point) => ({ ...point }))
  for (let edgeIndex = 0; edgeIndex < normalized.length; edgeIndex += 1) {
    const start = normalized[edgeIndex]
    const end = normalized[(edgeIndex + 1) % normalized.length]
    const edgeX = end.x - start.x
    const edgeY = end.y - start.y
    const length = Math.max(EPSILON, Math.hypot(edgeX, edgeY))
    const normal = { x: -edgeY / length, y: edgeX / length }
    const shifted = {
      x: start.x + normal.x * inset,
      y: start.y + normal.y * inset,
    }
    const distanceToPlane = (point: Point2) =>
      (point.x - shifted.x) * normal.x + (point.y - shifted.y) * normal.y
    const output: Point2[] = []
    for (let index = 0; index < clipped.length; index += 1) {
      const current = clipped[index]
      const previous = clipped[(index - 1 + clipped.length) % clipped.length]
      const currentDistance = distanceToPlane(current)
      const previousDistance = distanceToPlane(previous)
      const currentInside = currentDistance >= -EPSILON
      const previousInside = previousDistance >= -EPSILON
      if (currentInside !== previousInside) {
        const denominator = previousDistance - currentDistance
        const ratio =
          Math.abs(denominator) <= EPSILON ? 0 : previousDistance / denominator
        output.push({
          x: previous.x + (current.x - previous.x) * ratio,
          y: previous.y + (current.y - previous.y) * ratio,
        })
      }
      if (currentInside) output.push({ ...current })
    }
    clipped = output
    if (clipped.length < 3) return []
  }
  return clipped
}

export function roundedPolygon(
  polygon: readonly Point2[],
  radius: number,
  cornerSteps = 4,
): Point2[] {
  const normalized = normalizeWinding(polygon)
  if (normalized.length < 3 || radius <= EPSILON) return normalized
  const rounded: Point2[] = []

  for (let index = 0; index < normalized.length; index += 1) {
    const previous = normalized[(index - 1 + normalized.length) % normalized.length]
    const corner = normalized[index]
    const next = normalized[(index + 1) % normalized.length]
    const previousLength = Math.hypot(previous.x - corner.x, previous.y - corner.y)
    const nextLength = Math.hypot(next.x - corner.x, next.y - corner.y)
    const amount = Math.min(radius, previousLength * 0.34, nextLength * 0.34)
    const entry = {
      x: corner.x + ((previous.x - corner.x) / Math.max(EPSILON, previousLength)) * amount,
      y: corner.y + ((previous.y - corner.y) / Math.max(EPSILON, previousLength)) * amount,
    }
    const exit = {
      x: corner.x + ((next.x - corner.x) / Math.max(EPSILON, nextLength)) * amount,
      y: corner.y + ((next.y - corner.y) / Math.max(EPSILON, nextLength)) * amount,
    }

    for (let step = 0; step <= cornerSteps; step += 1) {
      const ratio = step / cornerSteps
      const inverse = 1 - ratio
      rounded.push({
        x: inverse * inverse * entry.x + 2 * inverse * ratio * corner.x + ratio * ratio * exit.x,
        y: inverse * inverse * entry.y + 2 * inverse * ratio * corner.y + ratio * ratio * exit.y,
      })
    }
  }
  return rounded
}

export function circlePolygon(center: Point2, radius: number, segments = 96): Point2[] {
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2
    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    }
  })
}

export function convexHull(points: readonly Point2[]) {
  if (points.length <= 3) return normalizeWinding(points)
  const sorted = [...points].sort((first, second) => first.x - second.x || first.y - second.y)
  const cross = (origin: Point2, first: Point2, second: Point2) =>
    (first.x - origin.x) * (second.y - origin.y) -
    (first.y - origin.y) * (second.x - origin.x)
  const lower: Point2[] = []
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop()
    }
    lower.push(point)
  }
  const upper: Point2[] = []
  for (const point of sorted.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop()
    }
    upper.push(point)
  }
  lower.pop()
  upper.pop()
  return normalizeWinding([...lower, ...upper])
}

interface DelaunaySite extends Point2 {
  id: string
}

export interface DelaunayTriple {
  ids: [string, string, string]
  circumcenter: Point2
  radius: number
}

function triangleCircumcircle(first: Point2, second: Point2, third: Point2) {
  const denominator =
    2 *
    (first.x * (second.y - third.y) +
      second.x * (third.y - first.y) +
      third.x * (first.y - second.y))
  if (Math.abs(denominator) <= EPSILON) return null
  const firstSquared = first.x * first.x + first.y * first.y
  const secondSquared = second.x * second.x + second.y * second.y
  const thirdSquared = third.x * third.x + third.y * third.y
  const center = {
    x:
      (firstSquared * (second.y - third.y) +
        secondSquared * (third.y - first.y) +
        thirdSquared * (first.y - second.y)) /
      denominator,
    y:
      (firstSquared * (third.x - second.x) +
        secondSquared * (first.x - third.x) +
        thirdSquared * (second.x - first.x)) /
      denominator,
  }
  return { center, radius: Math.hypot(center.x - first.x, center.y - first.y) }
}

export function findDelaunayTriples(sites: readonly DelaunaySite[]): DelaunayTriple[] {
  const triples: DelaunayTriple[] = []
  for (let firstIndex = 0; firstIndex < sites.length - 2; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < sites.length - 1; secondIndex += 1) {
      for (let thirdIndex = secondIndex + 1; thirdIndex < sites.length; thirdIndex += 1) {
        const circle = triangleCircumcircle(
          sites[firstIndex],
          sites[secondIndex],
          sites[thirdIndex],
        )
        if (!circle) continue
        const empty = sites.every((site, index) => {
          if (index === firstIndex || index === secondIndex || index === thirdIndex) return true
          return (
            Math.hypot(site.x - circle.center.x, site.y - circle.center.y) >=
            circle.radius - 1e-5
          )
        })
        if (!empty) continue
        triples.push({
          ids: [sites[firstIndex].id, sites[secondIndex].id, sites[thirdIndex].id],
          circumcenter: circle.center,
          radius: circle.radius,
        })
      }
    }
  }
  return triples.sort(
    (first, second) =>
      first.radius - second.radius || first.ids.join('-').localeCompare(second.ids.join('-')),
  )
}

export function horizontalIntervalAtY(
  polygon: readonly Point2[],
  y: number,
): [number, number] | null {
  const intersections: number[] = []
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]
    const end = polygon[(index + 1) % polygon.length]
    if ((start.y <= y && end.y > y) || (end.y <= y && start.y > y)) {
      const ratio = (y - start.y) / (end.y - start.y)
      intersections.push(start.x + (end.x - start.x) * ratio)
    }
  }
  intersections.sort((first, second) => first - second)
  if (intersections.length < 2) return null
  return [intersections[0], intersections[intersections.length - 1]]
}

export function horizontalSpanAtY(polygon: readonly Point2[], y: number) {
  const interval = horizontalIntervalAtY(polygon, y)
  return interval ? interval[1] - interval[0] : 0
}

export function rayPolygonIntersection(
  origin: Point2,
  direction: Point2,
  polygon: readonly Point2[],
): Point2 {
  let nearestDistance = Number.POSITIVE_INFINITY
  let intersection = origin

  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]
    const end = polygon[(index + 1) % polygon.length]
    const edgeX = end.x - start.x
    const edgeY = end.y - start.y
    const determinant = direction.x * edgeY - direction.y * edgeX
    if (Math.abs(determinant) <= EPSILON) continue

    const offsetX = start.x - origin.x
    const offsetY = start.y - origin.y
    const rayDistance = (offsetX * edgeY - offsetY * edgeX) / determinant
    const edgeRatio = (offsetX * direction.y - offsetY * direction.x) / determinant

    if (
      rayDistance >= 0 &&
      edgeRatio >= -EPSILON &&
      edgeRatio <= 1 + EPSILON &&
      rayDistance < nearestDistance
    ) {
      nearestDistance = rayDistance
      intersection = {
        x: origin.x + direction.x * rayDistance,
        y: origin.y + direction.y * rayDistance,
      }
    }
  }

  return intersection
}

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

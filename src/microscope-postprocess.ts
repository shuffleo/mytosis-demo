import { mapPostProcessedPoint, type PostProcessField } from './microscope-mapping'
import type { Point2 } from './geometry'
import type { CanvasSettings } from './settings'

export type PostProcessStatus = 'live' | 'fallback'

export interface PostProcessDebugSnapshot {
  status: PostProcessStatus
  active: boolean
  uploadCount: number
  renderCount: number
  outputWidth: number
  outputHeight: number
  sourceIncludesPaperText: true
  sourceIncludesWallTexture: true
  wallCompositeMode: 'pre-shader' | 'fallback-overlay'
  pointerEvents: string
  field: PostProcessField
  focusScene: FocusSceneState
}

export interface FocusSceneState {
  scale: number
  translate: Point2
  orbitAngle: number
  orbitScale: number
  orbitOrigin: Point2
  blurPx: number
  opacity: number
}

const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D uScene;
uniform sampler2D uWalls;
uniform vec2 uResolution;
uniform vec2 uFieldCenter;
uniform float uFieldRadius;
uniform float uCircleGrain;
uniform float uWallGrainEnabled;
uniform float uWallDisplacement;
uniform float uWallFrequency;
uniform float uWallOctaves;
uniform float uContentScale;
uniform vec2 uContentTranslate;
uniform float uOrbitAngle;
uniform float uOrbitScale;
uniform vec2 uOrbitOrigin;
uniform float uFocusBlur;
uniform float uSceneOpacity;

uniform float uVignetteEnabled;
uniform float uVignetteIntensity;
uniform float uVignetteDim;
uniform float uVignetteBlur;
uniform float uRimWidth;
uniform float uRimSoftness;
uniform float uRimDistortion;
uniform float uGrain;

uniform float uLensEnabled;
uniform float uRefraction;
uniform float uAberration;
uniform float uFrost;
uniform float uGlow;
uniform float uGlowRadius;

uniform float uCrtEnabled;
uniform float uPhosphorScanlinesEnabled;
uniform float uPhosphor;
uniform float uScanlines;
uniform float uColorShift;
uniform float uBulge;

in vec2 vUv;
out vec4 outputColor;

float hash21(vec2 point) {
  point = fract(point * vec2(123.34, 456.21));
  point += dot(point, point + 45.32);
  return fract(point.x * point.y);
}

float valueNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  float a = hash21(cell);
  float b = hash21(cell + vec2(1.0, 0.0));
  float c = hash21(cell + vec2(0.0, 1.0));
  float d = hash21(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

float wallNoise(vec2 point) {
  float value = 0.0;
  float amplitude = 0.55;
  float amplitudeSum = 0.0;
  vec2 samplePoint = point;
  for (int octave = 0; octave < 4; octave++) {
    if (float(octave) >= uWallOctaves) break;
    value += valueNoise(samplePoint) * amplitude;
    amplitudeSum += amplitude;
    samplePoint = samplePoint * 2.07 + vec2(17.3, 9.1);
    amplitude *= 0.5;
  }
  return value / max(0.001, amplitudeSum);
}

vec2 wallOffset(vec2 sourcePx) {
  if (uWallGrainEnabled < 0.5 || uWallDisplacement <= 0.0) return vec2(0.0);
  vec2 frequencyPoint = sourcePx * uWallFrequency;
  vec2 displacement = vec2(
    wallNoise(frequencyPoint + vec2(5.2, 1.7)),
    wallNoise(frequencyPoint + vec2(19.4, 31.8))
  ) - 0.5;
  return displacement * 2.0 * uWallDisplacement / uResolution;
}

vec2 inverseSceneTransform(vec2 displayPx) {
  vec2 orbitLocal = (displayPx - uOrbitOrigin) / max(0.001, uOrbitScale);
  float cosine = cos(-uOrbitAngle);
  float sine = sin(-uOrbitAngle);
  vec2 unrotated = vec2(
    orbitLocal.x * cosine - orbitLocal.y * sine,
    orbitLocal.x * sine + orbitLocal.y * cosine
  ) + uOrbitOrigin;
  return (unrotated - uContentTranslate) / max(0.001, uContentScale);
}

vec4 compositeScene(vec2 uv, vec2 displacement) {
  float sceneInBounds =
    step(0.0, uv.x) * step(uv.x, 1.0) *
    step(0.0, uv.y) * step(uv.y, 1.0);
  vec2 wallUv = uv + displacement;
  float wallsInBounds =
    step(0.0, wallUv.x) * step(wallUv.x, 1.0) *
    step(0.0, wallUv.y) * step(wallUv.y, 1.0);
  vec4 scene = texture(uScene, clamp(uv, 0.0, 1.0)) * sceneInBounds;
  vec4 walls = texture(uWalls, clamp(wallUv, 0.0, 1.0)) * wallsInBounds;
  vec4 composited = mix(scene, walls, walls.a);
  composited.rgb *= uSceneOpacity;
  return composited;
}

float radialScale(vec2 normalized, float radius) {
  float offset = 0.0;
  if (uLensEnabled > 0.5) {
    float sphereDepth = sqrt(max(0.0, 1.0 - radius * radius));
    offset += uRefraction * 0.18 * (1.0 - sphereDepth);
  }
  if (uCrtEnabled > 0.5) {
    offset += uBulge * 0.08 * radius * radius;
  }
  if (uVignetteEnabled > 0.5) {
    float rim = smoothstep(
      max(0.0, 1.0 - uRimWidth - uRimSoftness),
      max(0.001, 1.0 - uRimSoftness),
      radius
    );
    float grain = sin(normalized.x * 17.0 + normalized.y * 23.0)
      * cos(normalized.y * 19.0 - normalized.x * 11.0);
    offset += uRimDistortion * rim * grain;
  }
  return 1.0 + offset;
}

vec4 blurredScene(vec2 uv, float radiusPx, vec2 wallDisplacement) {
  vec2 pixel = 1.0 / uResolution;
  vec2 delta = pixel * radiusPx;
  vec4 color = compositeScene(uv, wallDisplacement) * 0.24;
  color += compositeScene(uv + vec2(delta.x, 0.0), wallDisplacement) * 0.12;
  color += compositeScene(uv - vec2(delta.x, 0.0), wallDisplacement) * 0.12;
  color += compositeScene(uv + vec2(0.0, delta.y), wallDisplacement) * 0.12;
  color += compositeScene(uv - vec2(0.0, delta.y), wallDisplacement) * 0.12;
  color += compositeScene(uv + delta, wallDisplacement) * 0.07;
  color += compositeScene(uv - delta, wallDisplacement) * 0.07;
  color += compositeScene(uv + vec2(delta.x, -delta.y), wallDisplacement) * 0.07;
  color += compositeScene(uv + vec2(-delta.x, delta.y), wallDisplacement) * 0.07;
  return color;
}

void main() {
  vec2 fragmentPx = vUv * uResolution;
  vec2 relative = (fragmentPx - uFieldCenter) / max(1.0, uFieldRadius);
  float radius = length(relative);
  if (radius > 1.0) discard;

  float scale = radialScale(relative, radius);
  vec2 opticalSourcePx = uFieldCenter + relative * uFieldRadius * scale;
  vec2 sourcePx = inverseSceneTransform(opticalSourcePx);
  vec2 sourceUv = sourcePx / uResolution;
  float rim = uVignetteEnabled > 0.5
    ? smoothstep(
        max(0.0, 1.0 - uRimWidth - uRimSoftness),
        max(0.001, 1.0 - uRimSoftness),
        radius
      )
    : 0.0;
  float blurPx =
    uLensEnabled * uFrost +
    uVignetteEnabled * uVignetteBlur * rim +
    uFocusBlur;
  vec2 direction = radius > 0.0001 ? relative / radius : vec2(0.0);
  float chromaPx = uLensEnabled * uAberration + uCrtEnabled * uColorShift;
  vec2 chromaOffset = direction * chromaPx / uResolution;
  vec2 wallDisplacement = wallOffset(sourcePx);

  vec4 centerSample = blurredScene(sourceUv, blurPx, wallDisplacement);
  vec3 color = vec3(
    blurredScene(sourceUv + chromaOffset, blurPx, wallDisplacement).r,
    centerSample.g,
    blurredScene(sourceUv - chromaOffset, blurPx, wallDisplacement).b
  );

  if (uLensEnabled > 0.5) {
    float sphereDepth = sqrt(max(0.0, 1.0 - radius * radius));
    float fresnel = pow(1.0 - sphereDepth, 3.0);
    vec3 glowSample = blurredScene(sourceUv, uGlowRadius, wallDisplacement).rgb;
    vec3 bloom = max(glowSample - centerSample.rgb * 0.86, vec3(0.0));
    color += fresnel * (0.026 + uGlow * 0.08);
    color += bloom * uGlow * 1.8;
  }
  if (uVignetteEnabled > 0.5) {
    color *= 1.0 - uVignetteDim * uVignetteIntensity * rim;
    float fixedGrain = hash21(floor(fragmentPx * 0.72));
    color += (fixedGrain - 0.5) * uGrain * uVignetteIntensity * rim;
  }
  float circleGrain = hash21(floor(fragmentPx * 0.84 + vec2(19.0, 7.0)));
  color += (circleGrain - 0.5) * uCircleGrain;
  if (uCrtEnabled > 0.5 && uPhosphorScanlinesEnabled > 0.5) {
    float phosphorPhase = mod(floor(fragmentPx.x * uPhosphor * 3.0 / uResolution.x), 3.0);
    vec3 phosphorMask = phosphorPhase < 1.0
      ? vec3(1.008, 0.997, 0.997)
      : phosphorPhase < 2.0
        ? vec3(0.997, 1.008, 0.997)
        : vec3(0.997, 0.997, 1.008);
    color *= phosphorMask;
    float scan = 0.5 + 0.5 * sin(fragmentPx.y * 3.14159265);
    color *= 1.0 - uScanlines * 0.12 * scan;
  }

  outputColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
) {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Unable to allocate microscope shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'Unknown shader compilation error'
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

function createProgram(gl: WebGL2RenderingContext) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  const program = gl.createProgram()
  if (!program) throw new Error('Unable to allocate microscope shader program')
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? 'Unknown shader link error'
    gl.deleteProgram(program)
    throw new Error(message)
  }
  return program
}

export class MicroscopePostProcessor {
  private readonly source: HTMLCanvasElement
  private readonly wallSource: HTMLCanvasElement
  private readonly output: HTMLCanvasElement
  private readonly onStatusChange: (status: PostProcessStatus) => void
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private texture: WebGLTexture | null = null
  private wallTexture: WebGLTexture | null = null
  private settings: CanvasSettings
  private field: PostProcessField
  private frameRequest = 0
  private textureWidth = 0
  private textureHeight = 0
  private wallTextureWidth = 0
  private wallTextureHeight = 0
  private uploadCount = 0
  private renderCount = 0
  private status: PostProcessStatus = 'fallback'
  private destroyed = false
  private suspended = false
  private activeUntil = performance.now() + 1800
  private idleFrameRendered = false
  private focusScene: FocusSceneState = {
    scale: 1,
    translate: { x: 0, y: 0 },
    orbitAngle: 0,
    orbitScale: 1,
    orbitOrigin: { x: 0, y: 0 },
    blurPx: 0,
    opacity: 1,
  }

  constructor(
    source: HTMLCanvasElement,
    wallSource: HTMLCanvasElement,
    output: HTMLCanvasElement,
    settings: CanvasSettings,
    field: PostProcessField,
    onStatusChange: (status: PostProcessStatus) => void,
  ) {
    this.source = source
    this.wallSource = wallSource
    this.output = output
    this.settings = settings
    this.field = field
    this.onStatusChange = onStatusChange
    this.output.style.pointerEvents = 'none'
    this.output.addEventListener('webglcontextlost', this.handleContextLost)
    this.source.addEventListener('pointermove', this.wake)
    this.source.addEventListener('pointerdown', this.wake)
    this.source.addEventListener('keydown', this.wake)
    window.addEventListener('resize', this.wake)

    try {
      this.gl = output.getContext('webgl2', {
        alpha: true,
        antialias: false,
        depth: false,
        preserveDrawingBuffer: false,
        premultipliedAlpha: false,
      })
      if (!this.gl) throw new Error('WebGL2 unavailable')
      this.initialize(this.gl)
      this.status = 'live'
    } catch {
      this.status = 'fallback'
      this.gl = null
      this.output.hidden = true
    }
    this.output.dataset.postProcessStatus = this.status
    this.wallSource.dataset.compositeMode =
      this.status === 'live' ? 'pre-shader' : 'fallback-overlay'
    this.onStatusChange(this.status)
    this.requestFrame()
  }

  setState(settings: CanvasSettings, field: PostProcessField, animated = false) {
    this.settings = settings
    this.field = field
    if (animated) this.wake()
    // The Paper engine only calls setState when its rendered source checksum
    // changes. Always consume that notification, even after the shader has
    // gone idle; otherwise a slowly settling group wall can outlive the
    // post-process wake window and leave a permanently stale texture.
    this.requestFrame(true)
  }

  setSuspended(suspended: boolean) {
    this.suspended = suspended
    this.output.hidden =
      suspended || this.status !== 'live' || !this.anyEffectEnabled()
    if (!suspended) {
      this.wake()
      this.requestFrame(true)
    }
  }

  setFocusScene(state: FocusSceneState) {
    this.focusScene = {
      ...state,
      translate: { ...state.translate },
      orbitOrigin: { ...state.orbitOrigin },
    }
    this.wake()
    this.requestFrame(true)
  }

  mapPointer(point: Point2) {
    if (this.suspended || this.status !== 'live' || !this.anyEffectEnabled()) return { ...point }
    return mapPostProcessedPoint(point, this.field, this.settings)
  }

  requestFrame(force = false) {
    if (this.destroyed || this.suspended || this.status !== 'live' || this.frameRequest) return
    if (!force && performance.now() > this.activeUntil) {
      if (this.idleFrameRendered) return
      this.idleFrameRendered = true
    } else {
      this.idleFrameRendered = false
    }
    this.frameRequest = requestAnimationFrame(() => {
      this.frameRequest = 0
      this.render()
    })
  }

  getDebugSnapshot(): PostProcessDebugSnapshot {
    const outputBounds = this.output.getBoundingClientRect()
    return {
      status: this.status,
      active: !this.suspended && this.status === 'live' && this.anyEffectEnabled(),
      uploadCount: this.uploadCount,
      renderCount: this.renderCount,
      outputWidth: outputBounds.width,
      outputHeight: outputBounds.height,
      sourceIncludesPaperText: true,
      sourceIncludesWallTexture: true,
      wallCompositeMode:
        this.status === 'live' ? 'pre-shader' : 'fallback-overlay',
      pointerEvents: getComputedStyle(this.output).pointerEvents,
      field: structuredClone(this.field),
      focusScene: structuredClone(this.focusScene),
    }
  }

  destroy() {
    this.destroyed = true
    if (this.frameRequest) cancelAnimationFrame(this.frameRequest)
    this.output.removeEventListener('webglcontextlost', this.handleContextLost)
    this.source.removeEventListener('pointermove', this.wake)
    this.source.removeEventListener('pointerdown', this.wake)
    this.source.removeEventListener('keydown', this.wake)
    window.removeEventListener('resize', this.wake)
    if (this.gl) {
      if (this.texture) this.gl.deleteTexture(this.texture)
      if (this.wallTexture) this.gl.deleteTexture(this.wallTexture)
      if (this.program) this.gl.deleteProgram(this.program)
    }
  }

  private readonly handleContextLost = (event: Event) => {
    event.preventDefault()
    this.status = 'fallback'
    this.output.dataset.postProcessStatus = this.status
    this.output.hidden = true
    this.wallSource.dataset.compositeMode = 'fallback-overlay'
    this.onStatusChange(this.status)
  }

  private readonly wake = () => {
    this.activeUntil = performance.now() + 1200
    this.idleFrameRendered = false
  }

  private anyEffectEnabled() {
    const { effects, geometry, particles } = this.settings
    return (
      effects.circle.grain > 0 ||
      effects.vignette.enabled ||
      effects.lens.enabled ||
      effects.crt.enabled ||
      geometry.wallGrainEnabled ||
      particles.enabled
    )
  }

  private initialize(gl: WebGL2RenderingContext) {
    const program = createProgram(gl)
    const position = gl.getAttribLocation(program, 'aPosition')
    const buffer = gl.createBuffer()
    const texture = gl.createTexture()
    const wallTexture = gl.createTexture()
    if (!buffer || !texture || !wallTexture || position < 0) {
      throw new Error('Unable to initialize WebGL resources')
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    )
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, wallTexture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.useProgram(program)
    gl.uniform1i(gl.getUniformLocation(program, 'uScene'), 0)
    gl.uniform1i(gl.getUniformLocation(program, 'uWalls'), 1)
    this.program = program
    this.texture = texture
    this.wallTexture = wallTexture
  }

  private render() {
    const gl = this.gl
    const program = this.program
    const texture = this.texture
    const wallTexture = this.wallTexture
    if (this.suspended || !gl || !program || !texture || !wallTexture) return
    const enabled = this.anyEffectEnabled()
    this.output.hidden = !enabled
    if (!enabled) return

    // The source layer may be transformed as a WebGL fallback. The output is
    // fixed optics, so size it from its untransformed scene container.
    const bounds =
      this.output.parentElement?.getBoundingClientRect() ??
      this.source.getBoundingClientRect()
    // Headless Chromium renders WebGL through CPU-bound SwiftShader. Use a
    // smaller internal buffer in automation while preserving the exact CSS
    // size, normalized optics, pointer mapping, and production resolution.
    const pixelRatio = navigator.webdriver
      ? 0.25
      : Math.min(2, Math.max(1, window.devicePixelRatio || 1))
    const width = Math.max(1, Math.round(bounds.width * pixelRatio))
    const height = Math.max(1, Math.round(bounds.height * pixelRatio))
    if (this.output.width !== width || this.output.height !== height) {
      this.output.width = width
      this.output.height = height
      this.output.style.width = `${bounds.width}px`
      this.output.style.height = `${bounds.height}px`
    }

    gl.viewport(0, 0, width, height)
    gl.useProgram(program)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    if (this.textureWidth !== this.source.width || this.textureHeight !== this.source.height) {
      this.textureWidth = this.source.width
      this.textureHeight = this.source.height
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        this.textureWidth,
        this.textureHeight,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      )
    }
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.source,
    )
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, wallTexture)
    if (
      this.wallTextureWidth !== this.wallSource.width ||
      this.wallTextureHeight !== this.wallSource.height
    ) {
      this.wallTextureWidth = this.wallSource.width
      this.wallTextureHeight = this.wallSource.height
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        this.wallTextureWidth,
        this.wallTextureHeight,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      )
    }
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.wallSource,
    )
    this.uploadCount += 1

    const scaleX = width / Math.max(1, this.field.width)
    const scaleY = height / Math.max(1, this.field.height)
    const uniform1f = (name: string, value: number) =>
      gl.uniform1f(gl.getUniformLocation(program, name), value)
    gl.uniform2f(gl.getUniformLocation(program, 'uResolution'), width, height)
    gl.uniform2f(
      gl.getUniformLocation(program, 'uFieldCenter'),
      this.field.center.x * scaleX,
      height - this.field.center.y * scaleY,
    )
    uniform1f('uFieldRadius', this.field.radius * Math.min(scaleX, scaleY))

    const { circle, vignette, lens, crt } = this.settings.effects
    const { geometry } = this.settings
    uniform1f('uCircleGrain', circle.grain)
    uniform1f('uWallGrainEnabled', geometry.wallGrainEnabled ? 1 : 0)
    uniform1f('uWallDisplacement', geometry.wallGrain)
    uniform1f('uWallFrequency', geometry.wallGrainFrequency)
    uniform1f('uWallOctaves', geometry.wallGrainOctaves)
    uniform1f('uContentScale', this.focusScene.scale)
    gl.uniform2f(
      gl.getUniformLocation(program, 'uContentTranslate'),
      this.focusScene.translate.x * scaleX,
      height * (1 - this.focusScene.scale) - this.focusScene.translate.y * scaleY,
    )
    uniform1f('uOrbitAngle', -this.focusScene.orbitAngle)
    uniform1f('uOrbitScale', this.focusScene.orbitScale)
    gl.uniform2f(
      gl.getUniformLocation(program, 'uOrbitOrigin'),
      this.focusScene.orbitOrigin.x * scaleX,
      height - this.focusScene.orbitOrigin.y * scaleY,
    )
    uniform1f('uFocusBlur', this.focusScene.blurPx * pixelRatio)
    uniform1f('uSceneOpacity', this.focusScene.opacity)
    uniform1f('uVignetteEnabled', vignette.enabled ? 1 : 0)
    uniform1f('uVignetteIntensity', vignette.intensity)
    uniform1f('uVignetteDim', vignette.dim)
    uniform1f('uVignetteBlur', vignette.blurRadius * pixelRatio)
    uniform1f('uRimWidth', vignette.rimWidth)
    uniform1f('uRimSoftness', vignette.softness)
    uniform1f('uRimDistortion', vignette.distortion)
    uniform1f('uGrain', vignette.grain)
    uniform1f('uLensEnabled', lens.enabled ? 1 : 0)
    uniform1f('uRefraction', lens.refraction)
    uniform1f('uAberration', lens.aberration * pixelRatio)
    uniform1f('uFrost', lens.frost * pixelRatio)
    uniform1f('uGlow', lens.glow)
    uniform1f('uGlowRadius', lens.glowRadius * pixelRatio)
    uniform1f('uCrtEnabled', crt.enabled ? 1 : 0)
    uniform1f('uPhosphorScanlinesEnabled', crt.phosphorScanlinesEnabled ? 1 : 0)
    uniform1f('uPhosphor', crt.phosphor)
    uniform1f('uScanlines', crt.scanlines)
    uniform1f('uColorShift', crt.colorShift * pixelRatio)
    uniform1f('uBulge', crt.bulge)

    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    this.renderCount += 1
  }
}

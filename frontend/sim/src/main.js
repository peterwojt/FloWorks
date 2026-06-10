import {
  createPrograms,
  createFBOs,
  createQuadBuffer,
  splat,
  step,
  render,
} from './simulation.js'
 
// ---------------------------------------------------------------------------
// Canvas + WebGL context
// ---------------------------------------------------------------------------
 
const canvas = document.querySelector('#canvas')
canvas.width  = window.innerWidth
canvas.height = window.innerHeight
 
const gl = canvas.getContext('webgl')
if (!gl) throw new Error('WebGL not supported')
 
// Float textures are required for storing velocity and pressure values.
// Without this extension the simulation silently produces garbage.
const floatExt = gl.getExtension('OES_texture_float')
if (!floatExt) throw new Error('OES_texture_float not supported')
gl.getExtension('OES_texture_float_linear')  // enables LINEAR filtering on float textures
 
// ---------------------------------------------------------------------------
// Simulation resources
// ---------------------------------------------------------------------------
 
// Simulation grid resolution — lower = faster, higher = more detail.
// Keep it a power of two. 512 is a good starting point.
const SIM_SIZE = 512
 
const quadBuf  = createQuadBuffer(gl)
const programs = createPrograms(gl)
const fbos     = createFBOs(gl, SIM_SIZE, SIM_SIZE)
 
// ---------------------------------------------------------------------------
// Input handling
// ---------------------------------------------------------------------------
 
let lastX = 0
let lastY = 0

canvas.addEventListener('pointermove', e => {
  const rect = canvas.getBoundingClientRect()

  // normalize to 0..1, NO y-flip here yet
  const x = (e.clientX - rect.left) / rect.width
  const y = (e.clientY - rect.top)  / rect.height

  const dx =  (x - lastX) * 200
  const dy = -(y - lastY) * 200  // flip dy only — upward mouse = positive GL y

  lastX = x
  lastY = y

  if (e.buttons !== 1) return

  splat(gl, quadBuf, programs, fbos, {
    x,
    y: 1.0 - y,   // flip y ONCE here when passing to GL space
    dx, dy,
    color: hsvToRgb(hue, 1.0, 1.0),
    radius: 0.02,
  })

  hue = (hue + 1) % 360
})
 
function updatePointer(e) {
  const rect = canvas.getBoundingClientRect()
  pointer.x =  (e.clientX - rect.left) / rect.width
  pointer.y = 1.0 - (e.clientY - rect.top)  / rect.height  // flip Y for GL coords
}
 
// Cycle hue over time so each stroke gets a different colour
let hue = 0
 
function hsvToRgb(h, s, v) {
  const f = (n, k = (n + h / 60) % 6) =>
    v - v * s * Math.max(Math.min(k, 4 - k, 1), 0)
  return [f(5), f(3), f(1)]
}
 
// ---------------------------------------------------------------------------
// Resize handling
// ---------------------------------------------------------------------------
 
window.addEventListener('resize', () => {
  canvas.width  = window.innerWidth
  canvas.height = window.innerHeight
  gl.viewport(0, 0, canvas.width, canvas.height)
})
 
// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------
 
let lastTime = performance.now()
 
function loop(now) {
  // clamp dt to 16ms so a slow/paused frame doesn't cause the sim to explode
  const dt = Math.min((now - lastTime) / 1000, 0.016)
  lastTime = now
 
  // set viewport to canvas size for the final display pass
  gl.viewport(0, 0, canvas.width, canvas.height)
 
  step(gl, quadBuf, programs, fbos, dt)
  gl.viewport(0, 0, canvas.width, canvas.height)
  render(gl, quadBuf, programs, fbos)
 
  requestAnimationFrame(loop)
}
 
requestAnimationFrame(loop)

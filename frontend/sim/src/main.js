import vertSrc from "./shaders/display.vert.glsl"
import fragSrc from "./shaders/display.frag.glsl"

const canvas = document.querySelector('#canvas')
const gl = canvas.getContext('webgl')

console.log('gl context:', gl)
console.log('vert shader source:', vertSrc)
console.log('frag shader source:', fragSrc)  // debug

// compile a shader
function compile(type, src) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(shader))
  return shader
}

// link a program
function createProgram(vert, frag) {
  const program = gl.createProgram()
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vert))
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, frag))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program))
  return program
}

const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])
const buffer = gl.createBuffer()
gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW)

const program = createProgram(vertSrc, fragSrc)
const posLoc = gl.getAttribLocation(program, 'position')

console.log('program linked:', gl.getProgramParameter(program, gl.LINK_STATUS)) // debug

function render() {
  gl.viewport(0, 0, canvas.width, canvas.height)
  gl.useProgram(program)
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.enableVertexAttribArray(posLoc)
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  requestAnimationFrame(render)
}

render()
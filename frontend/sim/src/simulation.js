import quadVert from './shaders/quad.vert.glsl'
import advectFrag from './shaders/advect.frag.glsl'
import divergenceFrag from './shaders/divergence.frag.glsl'
import pressureFrag from './shaders/pressure.frag.glsl'
import gradientFrag from './shaders/gradient.frag.glsl'
import splatFrag from './shaders/splat.frag.glsl'
import displayFrag from './shaders/display.frag.glsl'

function compileShader(gl, type, src) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile error:\n${gl.getShaderInfoLog(shader)}`)
  }
  return shader
}

function createProgram(gl, fragSrc) {
  const vert = compileShader(gl, gl.VERTEX_SHADER, quadVert)
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc)
  const prog = gl.createProgram()
  gl.attachShader(prog, vert)
  gl.attachShader(prog, frag)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`Program link error:\n${gl.getProgramInfoLog(prog)}`)
  }
  return prog
}

function setUniforms(gl, program, uniforms) {
  gl.useProgram(program)
  for (const [name, value] of Object.entries(uniforms)) {
    const loc = gl.getUniformLocation(program, name)
    if (loc === null) continue  // uniform optimised away by driver — skip silently

    if (typeof value === 'number') {
      gl.uniform1f(loc, value)
    } else if (value instanceof WebGLTexture) {
      // caller must have already bound the texture to a unit
      // we pass the integer unit index separately — see runPass
    } else if (Array.isArray(value)) {
      switch (value.length) {
        case 2: gl.uniform2fv(loc, value); break
        case 3: gl.uniform3fv(loc, value); break
        case 4: gl.uniform4fv(loc, value); break
      }
    } else if (Number.isInteger(value)) {
      gl.uniform1i(loc, value)
    }
  }
}

function createQuadBuffer(gl) {
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1,  1, -1,  -1, 1,  1, 1]),
    gl.STATIC_DRAW
  )
  return buf
}

function createTexture(gl, width, height) {
  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0,
    gl.RGBA, gl.FLOAT, null
  )
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return tex
}

function createFBO(gl, width, height) {
  const texture = createTexture(gl, width, height)
  const fbo = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0
  )
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return { fbo, texture }
}

function createDoubleFBO(gl, width, height) {
  let read  = createFBO(gl, width, height)
  let write = createFBO(gl, width, height)
  return {
    get read()  { return read  },
    get write() { return write },
    swap() { [read, write] = [write, read] }
  }
}

function runPass(gl, quadBuf, program, targetFbo, textureUniforms, otherUniforms) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo)
  gl.useProgram(program)

  let unit = 0
  for (const [name, texture] of Object.entries(textureUniforms)) {
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    const loc = gl.getUniformLocation(program, name)
    if (loc !== null) gl.uniform1i(loc, unit)
    unit++
  }

  for (const [name, value] of Object.entries(otherUniforms)) {
    const loc = gl.getUniformLocation(program, name)
    if (loc === null) continue
    if (typeof value === 'number') {
      gl.uniform1f(loc, value)
    } else if (Array.isArray(value) && value.length === 2) {
      gl.uniform2fv(loc, value)
    } else if (Array.isArray(value) && value.length === 3) {
      gl.uniform3fv(loc, value)
    }
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf)
  const posLoc = gl.getAttribLocation(program, 'a_position')
  gl.enableVertexAttribArray(posLoc)
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
}

export function createPrograms(gl) {
  return {
    advect:     createProgram(gl, advectFrag),
    divergence: createProgram(gl, divergenceFrag),
    pressure:   createProgram(gl, pressureFrag),
    gradient:   createProgram(gl, gradientFrag),
    splat:      createProgram(gl, splatFrag),
    display:    createProgram(gl, displayFrag),
  }
}

export function createFBOs(gl, width, height) {
  return {
    width,
    height,
    velocity:   createDoubleFBO(gl, width, height),  // RG = (vx, vy)
    density:    createDoubleFBO(gl, width, height),  // R  = dye amount
    divergence: createFBO(gl, width, height),        // R  = div(velocity)
    pressure:   createDoubleFBO(gl, width, height),  // R  = pressure
  }
}

export function splat(gl, quadBuf, programs, fbos, { x, y, dx, dy, color, radius = 0.0005 }) {
  const { width, height } = fbos
  const aspect = width / height

  runPass(gl, quadBuf, programs.splat, fbos.velocity.write.fbo,
    { uTarget: fbos.velocity.read.texture },
    {
      uPoint:       [x, y],
      uColor:       [dx, dy, 0.0],
      uRadius:      radius,
      uAspectRatio: aspect,
    }
  )
  fbos.velocity.swap()

  runPass(gl, quadBuf, programs.splat, fbos.density.write.fbo,
    { uTarget: fbos.density.read.texture },
    {
      uPoint:       [x, y],
      uColor:       color,
      uRadius:      radius,
      uAspectRatio: aspect,
    }
  )
  fbos.density.swap()
}

export function step(gl, quadBuf, programs, fbos, dt) {
  gl.viewport(0, 0, fbos.width, fbos.height)
  const { width, height } = fbos
  const texelSize = [1 / width, 1 / height]

  runPass(gl, quadBuf, programs.advect, fbos.velocity.write.fbo,
    {
      uVelocity: fbos.velocity.read.texture,
      uSource:   fbos.velocity.read.texture,
    },
    {
      uTexelSize:   texelSize,
      uDt:          dt,
      uDissipation: 0.995,
    }
  )
  fbos.velocity.swap()

  runPass(gl, quadBuf, programs.advect, fbos.density.write.fbo,
    {
      uVelocity: fbos.velocity.read.texture,
      uSource:   fbos.density.read.texture,
    },
    {
      uTexelSize:   texelSize,
      uDt:          dt,
      uDissipation: 0.98,
    }
  )
  fbos.density.swap()

  runPass(gl, quadBuf, programs.divergence, fbos.divergence.fbo,
    { uVelocity: fbos.velocity.read.texture },
    { uTexelSize: texelSize }
  )

  for (let i = 0; i < 30; i++) {
    runPass(gl, quadBuf, programs.pressure, fbos.pressure.write.fbo,
      {
        uPressure:   fbos.pressure.read.texture,
        uDivergence: fbos.divergence.texture,
      },
      { uTexelSize: texelSize }
    )
    fbos.pressure.swap()
  }

  runPass(gl, quadBuf, programs.gradient, fbos.velocity.write.fbo,
    {
      uPressure: fbos.pressure.read.texture,
      uVelocity: fbos.velocity.read.texture,
    },
    { uTexelSize: texelSize }
  )
  fbos.velocity.swap()
}

export function render(gl, quadBuf, programs, fbos) {
  runPass(gl, quadBuf, programs.display, null,
    { uTexture: fbos.density.read.texture },
    {}
  )
}

export { createQuadBuffer }
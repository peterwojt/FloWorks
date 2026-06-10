precision highp float;
varying vec2 vUv;

uniform sampler2D uPressure;    // previous pressure estimate
uniform sampler2D uDivergence;  // the divergence field computed above
uniform vec2 uTexelSize;

void main() {
  float L = texture2D(uPressure, vUv - vec2(uTexelSize.x, 0)).x;
  float R = texture2D(uPressure, vUv + vec2(uTexelSize.x, 0)).x;
  float B = texture2D(uPressure, vUv - vec2(0, uTexelSize.y)).x;
  float T = texture2D(uPressure, vUv + vec2(0, uTexelSize.y)).x;
  float div = texture2D(uDivergence, vUv).x;

  float pressure = (L + R + B + T - div) * 0.25;
  gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
}

// run this shader 20-40 times per frame
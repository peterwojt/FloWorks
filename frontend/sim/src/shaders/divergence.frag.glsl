precision highp float;
varying vec2 vUv;

uniform sampler2D uVelocity;
uniform vec2 uTexelSize;

void main() {
  // sample the four neighbours
  float L = texture2D(uVelocity, vUv - vec2(uTexelSize.x, 0)).x;
  float R = texture2D(uVelocity, vUv + vec2(uTexelSize.x, 0)).x;
  float B = texture2D(uVelocity, vUv - vec2(0, uTexelSize.y)).y;
  float T = texture2D(uVelocity, vUv + vec2(0, uTexelSize.y)).y;

  // central difference divergence: ∂u/∂x + ∂v/∂y
  float div = 0.5 * ((R - L) + (T - B));
  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
}
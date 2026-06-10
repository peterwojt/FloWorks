precision highp float;
varying vec2 vUv;

uniform sampler2D uTarget;
uniform vec2 uPoint;
uniform vec3 uColor;
uniform float uRadius;
uniform float uAspectRatio;

void main() {
  vec2 d = vUv - uPoint;
  d.x *= uAspectRatio;          // stretch x to match pixel aspect
  float splat = exp(-dot(d, d) / uRadius);
  vec3 base = texture2D(uTarget, vUv).xyz;
  gl_FragColor = vec4(base + splat * uColor, 1.0);
}
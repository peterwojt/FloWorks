precision highp float;
varying vec2 vUv;

uniform sampler2D uVelocity;   
uniform sampler2D uSource;     
uniform vec2 uTexelSize;       
uniform float uDt;
uniform float uDissipation;    

void main() {
  vec2 vel = texture2D(uVelocity, vUv).xy;
  vec2 prevPos = vUv - vel * uDt * uTexelSize;

  vec4 result = uDissipation * texture2D(uSource, prevPos);
  gl_FragColor = result;
}
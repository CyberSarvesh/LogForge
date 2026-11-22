const INSTANCE = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 iCenter;
layout(location=3) in vec3 iHalf;
layout(location=4) in vec3 iColor;
layout(location=5) in vec3 iLook; // corner radius, glow, rotation around Y
uniform int uRounded;

void place(out vec3 world, out vec3 normal) {
  vec3 p;
  if (uRounded == 1) {
    float radius = min(iLook.x, min(iHalf.x, min(iHalf.y, iHalf.z)));
    p = sign(aPosition) * (iHalf - radius) + aNormal * radius;
    normal = aNormal;
  } else {
    p = aPosition * iHalf;
    normal = normalize(aNormal / iHalf);
  }
  float c = cos(iLook.z), s = sin(iLook.z);
  mat3 turn = mat3(c, 0, -s, 0, 1, 0, s, 0, c);
  world = iCenter + turn * p;
  normal = turn * normal;
}
`;

export const depthVertex = `${INSTANCE}
uniform mat4 uLightMatrix;
void main() {
  vec3 world, normal;
  place(world, normal);
  gl_Position = uLightMatrix * vec4(world, 1);
}`;

export const depthFragment = `#version 300 es
precision highp float;
void main() {}`;

export const litVertex = `${INSTANCE}
uniform mat4 uViewProjection, uLightMatrix;
out vec3 vWorld, vNormal, vColor;
out vec4 vShadow;
out float vGlow;
void main() {
  vec3 world, normal;
  place(world, normal);
  vWorld = world;
  vNormal = normal;
  vColor = iColor;
  vGlow = iLook.y;
  vShadow = uLightMatrix * vec4(world + normal * .04, 1);
  gl_Position = uViewProjection * vec4(world, 1);
}`;

// A negative glow marks the floor, which gets a grid.
export const litFragment = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 vWorld, vNormal, vColor;
in vec4 vShadow;
in float vGlow;
uniform vec3 uEye, uSun, uBackground;
uniform vec2 uFog;
uniform sampler2DShadow uShadow;
out vec4 outColor;

float sunlight() {
  vec3 p = vShadow.xyz / vShadow.w * .5 + .5;
  if (any(lessThan(p, vec3(0))) || any(greaterThan(p, vec3(1)))) return 1.;
  float texel = 1. / float(textureSize(uShadow, 0).x);
  float total = 0.;
  for (int x = -1; x <= 1; x++)
    for (int y = -1; y <= 1; y++)
      total += texture(uShadow, vec3(p.xy + vec2(x, y) * texel * 1.3, p.z - .0008));
  return total / 9.;
}

void main() {
  vec3 n = normalize(vNormal);
  vec3 view = normalize(uEye - vWorld);
  float glow = max(vGlow, 0.);
  float light = sunlight();
  vec3 ambient = mix(vec3(.17, .19, .21), vec3(.46, .50, .54), n.y * .5 + .5);
  vec3 sun = vec3(1., .91, .78) * max(dot(n, uSun), 0.) * light;

  vec3 base = vColor;
  if (vGlow < 0.) {
    vec2 cell = vWorld.xz / 2.;
    vec2 grid = abs(fract(cell - .5) - .5) / fwidth(cell);
    base += .035 * (1. - min(min(grid.x, grid.y), 1.));
  }

  vec3 color = base * (ambient + sun * .85);
  if (vGlow >= 0.) {
    color += vec3(1., .93, .82) * pow(max(dot(n, normalize(uSun + view)), 0.), 48.) * light * .22;
    color += vec3(.35, .52, .62) * pow(1. - max(dot(n, view), 0.), 4.) * .22;
  }
  color = mix(color, vColor * 1.12, glow);
  float fog = smoothstep(uFog.x, uFog.y, length(uEye - vWorld));
  outColor = vec4(mix(color, uBackground, fog), 1);
}`;

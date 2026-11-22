// A small instanced WebGL2 renderer: thousands of rounded boxes, one shadow-casting sun, fog.
import { roundedBox, cylinder } from "./geometry.js";
import { depthVertex, depthFragment, litVertex, litFragment } from "./shaders.js";
import { add, scale, normalize, lookAt, ortho, multiply } from "./math.js";

const FLOATS = 12; // centre, half size, colour, look
const SHADOW_SIZE = 2048;
const BACKGROUND = [0.055, 0.067, 0.075];
const SUN = normalize([-0.45, 1, 0.55]);

function createProgram(gl, vertex, fragment) {
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  const uniform = {};
  for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
    const { name } = gl.getActiveUniform(program, i);
    uniform[name] = gl.getUniformLocation(program, name);
  }
  return { program, uniform };
}

function createBatch(gl, mesh, rounded) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
  for (let i = 0; i < 2; i++) {
    gl.enableVertexAttribArray(i);
    gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 24, i * 12);
  }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  for (let i = 0; i < 4; i++) {
    gl.enableVertexAttribArray(i + 2);
    gl.vertexAttribPointer(i + 2, 3, gl.FLOAT, false, FLOATS * 4, i * 12);
    gl.vertexAttribDivisor(i + 2, 1);
  }
  gl.bindVertexArray(null);

  let data = new Float32Array(FLOATS * 256);
  let count = 0;
  return {
    clear() {
      count = 0;
    },
    push(center, size, color, radius, glow, turn) {
      let o = count++ * FLOATS;
      if (o + FLOATS > data.length) {
        const bigger = new Float32Array(data.length * 2);
        bigger.set(data);
        data = bigger;
      }
      for (let i = 0; i < 3; i++) data[o++] = center[i];
      for (let i = 0; i < 3; i++) data[o++] = size[i] / 2;
      for (let i = 0; i < 3; i++) data[o++] = color[i];
      data[o++] = radius;
      data[o++] = glow;
      data[o] = turn;
    },
    upload() {
      if (!count) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * FLOATS), gl.DYNAMIC_DRAW);
    },
    draw(uniform) {
      if (!count) return;
      gl.uniform1i(uniform.uRounded, rounded ? 1 : 0);
      gl.bindVertexArray(vao);
      gl.drawElementsInstanced(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0, count);
    },
  };
}

/** Returns null when WebGL2 is unavailable. */
export function createRenderer(canvas) {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
  if (!gl) return null;

  const depth = createProgram(gl, depthVertex, depthFragment);
  const lit = createProgram(gl, litVertex, litFragment);
  // Small cubes get a cheaper bevel: there can be thousands of them.
  const small = createBatch(gl, roundedBox(1), true);
  const large = createBatch(gl, roundedBox(3), true);
  const round = createBatch(gl, cylinder(64), false);
  const batches = [small, large, round];

  const shadowMap = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, shadowMap);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SHADOW_SIZE, SHADOW_SIZE, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  for (const [key, value] of [
    [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
    [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE],
  ]) gl.texParameteri(gl.TEXTURE_2D, key, value);

  const shadowTarget = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowTarget);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowMap, 0);
  gl.drawBuffers([gl.NONE]);
  gl.readBuffer(gl.NONE);
  gl.enable(gl.DEPTH_TEST);

  return {
    begin() {
      for (const batch of batches) batch.clear();
    },

    box(center, size, color, { radius = 0.08, glow = 0, turn = 0 } = {}) {
      const batch = Math.max(size[0], size[1], size[2]) > 1.2 ? large : small;
      batch.push(center, size, color, radius, glow, turn);
    },

    cylinder(center, size, color, { glow = 0 } = {}) {
      round.push(center, size, color, 0, glow, 0);
    },

    render(camera, pixelRatio) {
      const width = Math.round(canvas.clientWidth * pixelRatio);
      const height = Math.round(canvas.clientHeight * pixelRatio);
      if (canvas.width !== width || canvas.height !== height) Object.assign(canvas, { width, height });

      const { target, extent, distance, eye } = camera;
      const lightView = lookAt(add(target, scale(SUN, extent * 2)), target);
      const lightMatrix = multiply(ortho(extent, 0.5, extent * 4), lightView);
      for (const batch of batches) batch.upload();

      gl.bindFramebuffer(gl.FRAMEBUFFER, shadowTarget);
      gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(depth.program);
      gl.uniformMatrix4fv(depth.uniform.uLightMatrix, false, lightMatrix);
      for (const batch of batches) batch.draw(depth.uniform);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      gl.clearColor(...BACKGROUND, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(lit.program);
      const u = lit.uniform;
      gl.uniformMatrix4fv(u.uViewProjection, false, camera.matrix);
      gl.uniformMatrix4fv(u.uLightMatrix, false, lightMatrix);
      gl.uniform3fv(u.uEye, eye);
      gl.uniform3fv(u.uSun, SUN);
      gl.uniform3fv(u.uBackground, BACKGROUND);
      gl.uniform2f(u.uFog, distance + extent * 0.6, distance + extent * 2.6);
      gl.uniform1i(u.uShadow, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, shadowMap);
      for (const batch of batches) batch.draw(u);
      gl.bindVertexArray(null);
    },
  };
}

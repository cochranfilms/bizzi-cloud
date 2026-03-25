/**
 * Shared WebGL engine for applying 3D LUT to video.
 * Dual-LUT crossfade matches image preview smooth grade switches.
 * WebGL texture read requires video origin CORS.
 */

import { createLUTTexture, uploadDataToLutTexture } from "./image-lut-engine";

export { createLUTTexture };

function identityLutData(size: number): Float32Array {
  const values: number[] = [];
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const rf = size > 1 ? r / (size - 1) : 0;
        const gf = size > 1 ? g / (size - 1) : 0;
        const bf = size > 1 ? b / (size - 1) : 0;
        values.push(rf, gf, bf, 1);
      }
    }
  }
  return new Float32Array(values);
}

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_video;
uniform sampler2D u_lutA;
uniform sampler2D u_lutB;
uniform float u_lutSizeA;
uniform float u_lutSizeB;
uniform float u_lutCrossfade;
uniform float u_lutEnabled;
in vec2 v_texCoord;
out vec4 fragColor;

vec4 sampleLUTFrom(sampler2D lut, float size, vec3 rgb) {
  float margin = 0.5 / size;
  vec3 scaled = margin + clamp(rgb, 0.0, 1.0) * (1.0 - 1.0 / size);
  vec3 f = scaled * (size - 1.0);
  vec3 i0 = floor(f);
  vec3 i1 = min(i0 + 1.0, size - 1.0);
  vec3 t = fract(f);

  vec4 c000 = texelFetch(lut, ivec2(int(i0.r + i0.g * size), int(i0.b)), 0);
  vec4 c100 = texelFetch(lut, ivec2(int(i1.r + i0.g * size), int(i0.b)), 0);
  vec4 c010 = texelFetch(lut, ivec2(int(i0.r + i1.g * size), int(i0.b)), 0);
  vec4 c110 = texelFetch(lut, ivec2(int(i1.r + i1.g * size), int(i0.b)), 0);
  vec4 c001 = texelFetch(lut, ivec2(int(i0.r + i0.g * size), int(i1.b)), 0);
  vec4 c101 = texelFetch(lut, ivec2(int(i1.r + i0.g * size), int(i1.b)), 0);
  vec4 c011 = texelFetch(lut, ivec2(int(i0.r + i1.g * size), int(i1.b)), 0);
  vec4 c111 = texelFetch(lut, ivec2(int(i1.r + i1.g * size), int(i1.b)), 0);

  vec4 c00 = mix(c000, c100, t.r);
  vec4 c01 = mix(c010, c110, t.r);
  vec4 c10 = mix(c001, c101, t.r);
  vec4 c11 = mix(c011, c111, t.r);
  vec4 c0 = mix(c00, c01, t.g);
  vec4 c1 = mix(c10, c11, t.g);
  return mix(c0, c1, t.b);
}

void main() {
  vec4 v = texture(u_video, v_texCoord);
  if (u_lutEnabled > 0.5) {
    vec3 ga = sampleLUTFrom(u_lutA, u_lutSizeA, v.rgb).rgb;
    vec3 gb = sampleLUTFrom(u_lutB, u_lutSizeB, v.rgb).rgb;
    vec3 graded = mix(ga, gb, clamp(u_lutCrossfade, 0.0, 1.0));
    fragColor = vec4(graded, v.a);
  } else {
    fragColor = v;
  }
}
`;

export interface VideoLUTContext {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  lutTextureA: WebGLTexture;
  lutTextureB: WebGLTexture;
  lutSizeA: number;
  lutSizeB: number;
  videoTexture: WebGLTexture;
  posBuffer: WebGLBuffer;
  texBuffer: WebGLBuffer;
  a_position: number;
  a_texCoord: number;
}

export interface VideoLUTRenderOptions {
  lutEnabled: boolean;
  /** 0 = LUT A only, 1 = LUT B only (transition between grades). */
  lutCrossfade: number;
}

export function createVideoLUTContext(
  gl: WebGL2RenderingContext,
  primaryData: Float32Array,
  primarySize: number
): VideoLUTContext {
  const compileShader = (source: string, type: number): WebGLShader => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) ?? "Shader compile failed");
    }
    return shader;
  };

  const vs = compileShader(VERTEX_SHADER, gl.VERTEX_SHADER);
  const fs = compileShader(FRAGMENT_SHADER, gl.FRAGMENT_SHADER);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "Program link failed");
  }

  const lutTextureA = createLUTTexture(gl, primaryData, primarySize);
  const lutTextureB = createLUTTexture(gl, identityLutData(2), 2);

  const videoTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, videoTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const posBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );

  const texBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]),
    gl.STATIC_DRAW
  );
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  const a_position = gl.getAttribLocation(program, "a_position");
  const a_texCoord = gl.getAttribLocation(program, "a_texCoord");

  return {
    gl,
    program,
    lutTextureA,
    lutTextureB,
    lutSizeA: primarySize,
    lutSizeB: 2,
    videoTexture,
    posBuffer,
    texBuffer,
    a_position,
    a_texCoord,
  };
}

/** Upload into secondary LUT slot for transitions. */
export function setSecondaryVideoLut(
  ctx: VideoLUTContext,
  data: Float32Array,
  size: number
): void {
  const { gl } = ctx;
  if (ctx.lutSizeB !== size) {
    gl.deleteTexture(ctx.lutTextureB);
    ctx.lutTextureB = gl.createTexture()!;
    ctx.lutSizeB = size;
  }
  uploadDataToLutTexture(gl, ctx.lutTextureB, data, size);
}

export function swapPrimarySecondaryVideoLut(ctx: VideoLUTContext): void {
  const { gl } = ctx;
  gl.deleteTexture(ctx.lutTextureA);
  ctx.lutTextureA = ctx.lutTextureB;
  ctx.lutSizeA = ctx.lutSizeB;
  ctx.lutTextureB = createLUTTexture(gl, identityLutData(2), 2);
  ctx.lutSizeB = 2;
}

export function disposeVideoLUTContext(ctx: VideoLUTContext): void {
  const { gl } = ctx;
  gl.deleteTexture(ctx.videoTexture);
  gl.deleteTexture(ctx.lutTextureA);
  gl.deleteTexture(ctx.lutTextureB);
  gl.deleteBuffer(ctx.posBuffer);
  gl.deleteBuffer(ctx.texBuffer);
  gl.deleteProgram(ctx.program);
}

export function renderVideoFrameWithLUT(
  ctx: VideoLUTContext,
  video: HTMLVideoElement,
  width: number,
  height: number,
  options: VideoLUTRenderOptions
): void {
  const { gl, program, lutTextureA, lutTextureB, videoTexture } = ctx;

  gl.viewport(0, 0, width, height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, videoTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, lutTextureA);

  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, lutTextureB);

  gl.bindBuffer(gl.ARRAY_BUFFER, ctx.posBuffer);
  gl.enableVertexAttribArray(ctx.a_position);
  gl.vertexAttribPointer(ctx.a_position, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, ctx.texBuffer);
  gl.enableVertexAttribArray(ctx.a_texCoord);
  gl.vertexAttribPointer(ctx.a_texCoord, 2, gl.FLOAT, false, 0, 0);

  gl.uniform1i(gl.getUniformLocation(program, "u_video"), 0);
  gl.uniform1i(gl.getUniformLocation(program, "u_lutA"), 1);
  gl.uniform1i(gl.getUniformLocation(program, "u_lutB"), 2);
  gl.uniform1f(gl.getUniformLocation(program, "u_lutSizeA"), ctx.lutSizeA);
  gl.uniform1f(gl.getUniformLocation(program, "u_lutSizeB"), ctx.lutSizeB);
  gl.uniform1f(gl.getUniformLocation(program, "u_lutCrossfade"), options.lutCrossfade);
  gl.uniform1f(gl.getUniformLocation(program, "u_lutEnabled"), options.lutEnabled ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

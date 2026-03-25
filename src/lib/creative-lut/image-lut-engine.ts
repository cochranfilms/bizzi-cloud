/**
 * Shared WebGL engine for applying 3D LUT to images.
 * - Object-fit aware sampling (matches CSS cover/contain; no stretch/warp).
 * - Grade MIX: blend original RGB with LUT result.
 * - Dual LUT: crossfade between two grades (smooth LUT switches).
 */

import type { ObjectFitShaderUniforms } from "./object-fit-shader-uniforms";

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
uniform sampler2D u_image;
uniform sampler2D u_lutA;
uniform sampler2D u_lutB;
uniform float u_lutSizeA;
uniform float u_lutSizeB;
uniform float u_lutCrossfade;
uniform float u_gradeMix;
uniform float u_oxN;
uniform float u_oyN;
uniform float u_swN;
uniform float u_shN;
uniform int u_fitContain;
in vec2 v_texCoord;
out vec4 fragColor;

vec4 sampleLutFrom(sampler2D lut, float size, vec3 rgb) {
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
  float domYTop = 1.0 - v_texCoord.y;
  float u_tex = (v_texCoord.x - u_oxN) / u_swN;
  float v_dom = (domYTop - u_oyN) / u_shN;
  float v_sample = 1.0 - v_dom;

  bool inside = u_tex >= 0.0 && u_tex <= 1.0 && v_dom >= 0.0 && v_dom <= 1.0;
  if (u_fitContain == 1 && !inside) {
    fragColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }

  float uc = clamp(u_tex, 0.0, 1.0);
  float vc = clamp(v_sample, 0.0, 1.0);
  vec4 v = texture(u_image, vec2(uc, vc));
  vec3 ga = sampleLutFrom(u_lutA, u_lutSizeA, v.rgb).rgb;
  vec3 gb = sampleLutFrom(u_lutB, u_lutSizeB, v.rgb).rgb;
  vec3 graded = mix(ga, gb, clamp(u_lutCrossfade, 0.0, 1.0));
  vec3 outRgb = mix(v.rgb, graded, clamp(u_gradeMix, 0.0, 1.0));
  fragColor = vec4(outRgb, v.a);
}
`;

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

/** Upload RGBA8 3D LUT slice layout (size² × size) into a 2D texture. */
export function uploadDataToLutTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  data: Float32Array,
  size: number
): void {
  const total = size * size * size;
  const pixels = new Uint8Array(total * 4);
  for (let i = 0; i < total; i++) {
    pixels[i * 4] = Math.round((data[i * 4] ?? 0) * 255);
    pixels[i * 4 + 1] = Math.round((data[i * 4 + 1] ?? 0) * 255);
    pixels[i * 4 + 2] = Math.round((data[i * 4 + 2] ?? 0) * 255);
    pixels[i * 4 + 3] = 255;
  }
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    size * size,
    size,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    pixels
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

export function createLUTTexture(
  gl: WebGL2RenderingContext,
  data: Float32Array,
  size: number
): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Failed to create LUT texture");
  uploadDataToLutTexture(gl, texture, data, size);
  return texture;
}

export type ImageLutRenderOptions = {
  naturalWidth: number;
  naturalHeight: number;
  objectFit: "cover" | "contain";
  /** 0 = original, 1 = full LUT (after internal dual-LUT crossfade). */
  gradeMix: number;
  /** 0 = grade from LUT A only, 1 = grade from LUT B only (for transitions). */
  lutCrossfade: number;
  fitUniforms: ObjectFitShaderUniforms;
};

export interface ImageLUTContext {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  imageTexture: WebGLTexture;
  lutTextureA: WebGLTexture;
  lutTextureB: WebGLTexture;
  lutSizeA: number;
  lutSizeB: number;
  posBuffer: WebGLBuffer;
  texBuffer: WebGLBuffer;
  loc: {
    u_image: WebGLUniformLocation | null;
    u_lutA: WebGLUniformLocation | null;
    u_lutB: WebGLUniformLocation | null;
    u_lutSizeA: WebGLUniformLocation | null;
    u_lutSizeB: WebGLUniformLocation | null;
    u_lutCrossfade: WebGLUniformLocation | null;
    u_gradeMix: WebGLUniformLocation | null;
    u_oxN: WebGLUniformLocation | null;
    u_oyN: WebGLUniformLocation | null;
    u_swN: WebGLUniformLocation | null;
    u_shN: WebGLUniformLocation | null;
    u_fitContain: WebGLUniformLocation | null;
  };
  a_position: number;
  a_texCoord: number;
}

export function createImageLUTContext(
  gl: WebGL2RenderingContext,
  primaryData: Float32Array,
  primarySize: number
): ImageLUTContext {
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
  const id2 = identityLutData(2);
  const lutTextureB = createLUTTexture(gl, id2, 2);

  const imageTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, imageTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);

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
    imageTexture,
    lutTextureA,
    lutTextureB,
    lutSizeA: primarySize,
    lutSizeB: 2,
    posBuffer,
    texBuffer,
    loc: {
      u_image: gl.getUniformLocation(program, "u_image"),
      u_lutA: gl.getUniformLocation(program, "u_lutA"),
      u_lutB: gl.getUniformLocation(program, "u_lutB"),
      u_lutSizeA: gl.getUniformLocation(program, "u_lutSizeA"),
      u_lutSizeB: gl.getUniformLocation(program, "u_lutSizeB"),
      u_lutCrossfade: gl.getUniformLocation(program, "u_lutCrossfade"),
      u_gradeMix: gl.getUniformLocation(program, "u_gradeMix"),
      u_oxN: gl.getUniformLocation(program, "u_oxN"),
      u_oyN: gl.getUniformLocation(program, "u_oyN"),
      u_swN: gl.getUniformLocation(program, "u_swN"),
      u_shN: gl.getUniformLocation(program, "u_shN"),
      u_fitContain: gl.getUniformLocation(program, "u_fitContain"),
    },
    a_position,
    a_texCoord,
  };
}

/** Replace secondary LUT slot (for transitions). Recreates B if size differs. */
export function setSecondaryLut(
  ctx: ImageLUTContext,
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

/** After crossfade completes: promote B → A, reset B to tiny identity, crossfade 0. */
export function swapPrimarySecondaryLut(ctx: ImageLUTContext): void {
  const { gl } = ctx;
  gl.deleteTexture(ctx.lutTextureA);
  ctx.lutTextureA = ctx.lutTextureB;
  ctx.lutSizeA = ctx.lutSizeB;
  const id2 = identityLutData(2);
  ctx.lutTextureB = createLUTTexture(gl, id2, 2);
  ctx.lutSizeB = 2;
}

export function disposeImageLUTContext(ctx: ImageLUTContext): void {
  const { gl } = ctx;
  gl.deleteTexture(ctx.imageTexture);
  gl.deleteTexture(ctx.lutTextureA);
  gl.deleteTexture(ctx.lutTextureB);
  gl.deleteBuffer(ctx.posBuffer);
  gl.deleteBuffer(ctx.texBuffer);
  gl.deleteProgram(ctx.program);
}

export function renderImageWithLUT(
  ctx: ImageLUTContext,
  image: TexImageSource,
  width: number,
  height: number,
  options: ImageLutRenderOptions
): void {
  const { gl, program, imageTexture, lutTextureA, lutTextureB, loc } = ctx;

  gl.viewport(0, 0, width, height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, imageTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

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

  gl.uniform1i(loc.u_image, 0);
  gl.uniform1i(loc.u_lutA, 1);
  gl.uniform1i(loc.u_lutB, 2);
  gl.uniform1f(loc.u_lutSizeA, ctx.lutSizeA);
  gl.uniform1f(loc.u_lutSizeB, ctx.lutSizeB);
  gl.uniform1f(loc.u_lutCrossfade, options.lutCrossfade);
  gl.uniform1f(loc.u_gradeMix, options.gradeMix);

  const f = options.fitUniforms;
  gl.uniform1f(loc.u_oxN, f.oxN);
  gl.uniform1f(loc.u_oyN, f.oyN);
  gl.uniform1f(loc.u_swN, f.swN);
  gl.uniform1f(loc.u_shN, f.shN);
  gl.uniform1i(loc.u_fitContain, f.fitContain);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

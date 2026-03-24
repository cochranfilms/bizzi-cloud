/**
 * Shared WebGL engine for applying 3D LUT to video.
 * WebGL texture read requires video origin CORS. If black/corrupted output,
 * verify B2 bucket or CDN CORS allows the app origin.
 */

import { createLUTTexture } from "./image-lut-engine";

export { createLUTTexture };

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
uniform sampler2D u_lut;
uniform float u_lutSize;
uniform float u_lutEnabled;
in vec2 v_texCoord;
out vec4 fragColor;

vec4 sampleLUT(vec3 rgb) {
  float size = u_lutSize;
  float margin = 0.5 / size;
  vec3 scaled = margin + rgb * (1.0 - 1.0 / size);
  vec3 f = scaled * (size - 1.0);
  vec3 i0 = floor(f);
  vec3 i1 = min(i0 + 1.0, size - 1.0);
  vec3 t = fract(f);

  vec4 c000 = texelFetch(u_lut, ivec2(i0.r + i0.g * size, i0.b), 0);
  vec4 c100 = texelFetch(u_lut, ivec2(i1.r + i0.g * size, i0.b), 0);
  vec4 c010 = texelFetch(u_lut, ivec2(i0.r + i1.g * size, i0.b), 0);
  vec4 c110 = texelFetch(u_lut, ivec2(i1.r + i1.g * size, i0.b), 0);
  vec4 c001 = texelFetch(u_lut, ivec2(i0.r + i0.g * size, i1.b), 0);
  vec4 c101 = texelFetch(u_lut, ivec2(i1.r + i0.g * size, i1.b), 0);
  vec4 c011 = texelFetch(u_lut, ivec2(i0.r + i1.g * size, i1.b), 0);
  vec4 c111 = texelFetch(u_lut, ivec2(i1.r + i1.g * size, i1.b), 0);

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
    fragColor = vec4(sampleLUT(v.rgb).rgb, v.a);
  } else {
    fragColor = v;
  }
}
`;

export interface VideoLUTContext {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  lutTexture: WebGLTexture;
  videoTexture: WebGLTexture;
  lutSize: number;
}

export function createVideoLUTContext(
  gl: WebGL2RenderingContext,
  lutTexture: WebGLTexture,
  lutSize: number
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

  const videoTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, videoTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return { gl, program, lutTexture, videoTexture, lutSize };
}

export function renderVideoFrameWithLUT(
  ctx: VideoLUTContext,
  video: HTMLVideoElement,
  width: number,
  height: number,
  lutEnabled: boolean
): void {
  const { gl, program, lutTexture, videoTexture } = ctx;

  gl.viewport(0, 0, width, height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, videoTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, lutTexture);

  const posLoc = gl.getAttribLocation(program, "a_position");
  const texLoc = gl.getAttribLocation(program, "a_texCoord");

  const posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  const texBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]),
    gl.STATIC_DRAW
  );
  gl.enableVertexAttribArray(texLoc);
  gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

  gl.uniform1i(gl.getUniformLocation(program, "u_video"), 0);
  gl.uniform1i(gl.getUniformLocation(program, "u_lut"), 1);
  gl.uniform1f(gl.getUniformLocation(program, "u_lutSize"), ctx.lutSize);
  gl.uniform1f(gl.getUniformLocation(program, "u_lutEnabled"), lutEnabled ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

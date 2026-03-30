/** Runtime video→WebGL texture upload state; `unknown` must not permanently disable grading. */
export type VideoWebglEligibility = "unknown" | "ok" | "failed";

/**
 * Whether `texImage2D` can sample this video for WebGL grading (CORS / decode readiness).
 * Call when `readyState >= 2` and intrinsic width/height are both > 0 (after frame decode).
 */
export function canRenderVideoToWebGL(video: HTMLVideoElement): boolean {
  try {
    if (video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) {
      return false;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    const gl = canvas.getContext("webgl2");
    if (!gl) return false;

    const tex = gl.createTexture();
    if (!tex) return false;

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    const err = gl.getError();
    gl.deleteTexture(tex);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return err === gl.NO_ERROR;
  } catch {
    return false;
  }
}

/**
 * Normalized uniforms matching CSS object-fit for sampler2D uploads from HTMLImageElement.
 * v_texCoord: (0,0) = bottom-left of element, (1,1) = top-right (same as ImageWithLUT quad).
 * Image texture uses top-left origin per WebGL/HTML; v_sample = 1.0 - v_dom.
 */

export type ObjectFitShaderUniforms = {
  oxN: number;
  oyN: number;
  swN: number;
  shN: number;
  fitContain: number;
};

export function computeObjectFitShaderUniforms(
  containerCssWidth: number,
  containerCssHeight: number,
  naturalWidth: number,
  naturalHeight: number,
  objectFit: "cover" | "contain"
): ObjectFitShaderUniforms {
  const cw = Math.max(1, containerCssWidth);
  const ch = Math.max(1, containerCssHeight);
  const iw = Math.max(1, naturalWidth);
  const ih = Math.max(1, naturalHeight);

  const scale =
    objectFit === "cover"
      ? Math.max(cw / iw, ch / ih)
      : Math.min(cw / iw, ch / ih);

  const sw = iw * scale;
  const sh = ih * scale;
  const ox = (cw - sw) / 2;
  const oy = (ch - sh) / 2;

  return {
    oxN: ox / cw,
    oyN: oy / ch,
    swN: sw / cw,
    shN: sh / ch,
    fitContain: objectFit === "contain" ? 1 : 0,
  };
}

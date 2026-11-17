import { RenderBatch, TextureFilter, Tri, ProgressCallback } from './types';

export function sampleNearest(
  tex: Uint8Array,
  tw: number,
  th: number,
  u: number,
  v: number
): [number, number, number, number] {
  if (u < 0.0) u = 0.0; else if (u > 1.0) u = 1.0;
  if (v < 0.0) v = 0.0; else if (v > 1.0) v = 1.0;
  v = 1.0 - v; // Unity flip V

  const tx = Math.min(Math.floor(u * (tw - 1)), tw - 1);
  const ty = Math.min(Math.floor(v * (th - 1)), th - 1);
  const idx = (ty * tw + tx) * 4;
  return [tex[idx], tex[idx + 1], tex[idx + 2], tex[idx + 3]];
}

export function sampleBilinear(
  tex: Uint8Array,
  tw: number,
  th: number,
  u: number,
  v: number
): [number, number, number, number] {
  if (u < 0.0) u = 0.0; else if (u > 1.0) u = 1.0;
  if (v < 0.0) v = 0.0; else if (v > 1.0) v = 1.0;
  v = 1.0 - v; // Unity flip V

  const xf = u * (tw - 1);
  const yf = v * (th - 1);
  const x0 = Math.floor(xf);
  const y0 = Math.floor(yf);
  const x1 = Math.min(x0 + 1, tw - 1);
  const y1 = Math.min(y0 + 1, th - 1);
  const dx = xf - x0;
  const dy = yf - y0;

  const idx00 = (y0 * tw + x0) * 4;
  const idx10 = (y0 * tw + x1) * 4;
  const idx01 = (y1 * tw + x0) * 4;
  const idx11 = (y1 * tw + x1) * 4;

  const a =
    tex[idx00 + 3] * (1.0 - dx) * (1.0 - dy) +
    tex[idx10 + 3] * dx * (1.0 - dy) +
    tex[idx01 + 3] * (1.0 - dx) * dy +
    tex[idx11 + 3] * dx * dy;

  const w00 = (1.0 - dx) * (1.0 - dy) * (tex[idx00 + 3] / 255.0);
  const w10 = dx * (1.0 - dy) * (tex[idx10 + 3] / 255.0);
  const w01 = (1.0 - dx) * dy * (tex[idx01 + 3] / 255.0);
  const w11 = dx * dy * (tex[idx11 + 3] / 255.0);
  const wSum = w00 + w10 + w01 + w11;

  let r: number, g: number, b: number;
  if (wSum > 1e-6) {
    r = (tex[idx00 + 0] * w00 + tex[idx10 + 0] * w10 + tex[idx01 + 0] * w01 + tex[idx11 + 0] * w11) / wSum;
    g = (tex[idx00 + 1] * w00 + tex[idx10 + 1] * w10 + tex[idx01 + 1] * w01 + tex[idx11 + 1] * w11) / wSum;
    b = (tex[idx00 + 2] * w00 + tex[idx10 + 2] * w10 + tex[idx01 + 2] * w01 + tex[idx11 + 2] * w11) / wSum;
  } else {
    r =
      tex[idx00 + 0] * (1.0 - dx) * (1.0 - dy) +
      tex[idx10 + 0] * dx * (1.0 - dy) +
      tex[idx01 + 0] * (1.0 - dx) * dy +
      tex[idx11 + 0] * dx * dy;
    g =
      tex[idx00 + 1] * (1.0 - dx) * (1.0 - dy) +
      tex[idx10 + 1] * dx * (1.0 - dy) +
      tex[idx01 + 1] * (1.0 - dx) * dy +
      tex[idx11 + 1] * dx * dy;
    b =
      tex[idx00 + 2] * (1.0 - dx) * (1.0 - dy) +
      tex[idx10 + 2] * dx * (1.0 - dy) +
      tex[idx01 + 2] * (1.0 - dx) * dy +
      tex[idx11 + 2] * dx * dy;
  }

  return [Math.round(r), Math.round(g), Math.round(b), Math.round(a)];
}

export function rasterizeTriangles(
  outRgba: Uint8Array | Uint8ClampedArray,
  imgW: number,
  imgH: number,
  verts2d: Float32Array,
  uvs: Float32Array,
  tris: Tri[],
  texRgba: Uint8Array,
  texW: number,
  texH: number,
  isBilinear: boolean,
  alphaCutoff: number
): void {
  for (let t = 0; t < tris.length; t++) {
    const [i0, i1, i2] = tris[t];
    const x0 = verts2d[i0 * 2 + 0], y0 = verts2d[i0 * 2 + 1];
    const x1 = verts2d[i1 * 2 + 0], y1 = verts2d[i1 * 2 + 1];
    const x2 = verts2d[i2 * 2 + 0], y2 = verts2d[i2 * 2 + 1];

    let xmin = Math.floor(Math.min(x0, x1, x2));
    let xmax = Math.floor(Math.max(x0, x1, x2)) + 1;
    let ymin = Math.floor(Math.min(y0, y1, y2));
    let ymax = Math.floor(Math.max(y0, y1, y2)) + 1;

    if (xmin < 0) xmin = 0;
    if (xmax >= imgW) xmax = imgW - 1;
    if (ymin < 0) ymin = 0;
    if (ymax >= imgH) ymax = imgH - 1;
    if (xmin > xmax || ymin > ymax) continue;

    const den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
    if (Math.abs(den) < 1e-6) continue;

    const u0 = uvs[i0 * 2 + 0], v0 = uvs[i0 * 2 + 1];
    const u1 = uvs[i1 * 2 + 0], v1 = uvs[i1 * 2 + 1];
    const u2 = uvs[i2 * 2 + 0], v2 = uvs[i2 * 2 + 1];

    for (let y = ymin; y <= ymax; y++) {
      const rowOffset = y * imgW * 4;
      for (let x = xmin; x <= xmax; x++) {
        const w0 = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / den;
        const w1 = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / den;
        const w2 = 1.0 - w0 - w1;

        if (w0 >= 0.0 && w1 >= 0.0 && w2 >= 0.0) {
          const u = w0 * u0 + w1 * u1 + w2 * u2;
          const v = w0 * v0 + w1 * v1 + w2 * v2;

          const [r, g, b, a] = isBilinear
            ? sampleBilinear(texRgba, texW, texH, u, v)
            : sampleNearest(texRgba, texW, texH, u, v);

          if (a >= alphaCutoff) {
            const pxOffset = rowOffset + x * 4;
            const da = outRgba[pxOffset + 3] / 255.0;

            if (da <= 1e-4) {
              outRgba[pxOffset + 0] = r;
              outRgba[pxOffset + 1] = g;
              outRgba[pxOffset + 2] = b;
              outRgba[pxOffset + 3] = a;
            } else if (a >= 254) {
              outRgba[pxOffset + 0] = r;
              outRgba[pxOffset + 1] = g;
              outRgba[pxOffset + 2] = b;
              outRgba[pxOffset + 3] = 255;
            } else {
              const sa = a / 255.0;
              const invSa = 1.0 - sa;
              const outA = sa + da * invSa;

              const outR = (r * sa + outRgba[pxOffset + 0] * da * invSa) / outA;
              const outG = (g * sa + outRgba[pxOffset + 1] * da * invSa) / outA;
              const outB = (b * sa + outRgba[pxOffset + 2] * da * invSa) / outA;

              outRgba[pxOffset + 0] = Math.min(255, Math.max(0, Math.round(outR)));
              outRgba[pxOffset + 1] = Math.min(255, Math.max(0, Math.round(outG)));
              outRgba[pxOffset + 2] = Math.min(255, Math.max(0, Math.round(outB)));
              outRgba[pxOffset + 3] = Math.min(255, Math.max(0, Math.round(outA * 255.0)));
            }
          }
        }
      }
    }
  }
}

export const yieldToMain = () => new Promise<void>((resolve) => {
  setTimeout(resolve, 0);
});

export async function drawBatchesSoftware(
  verts2d: Float32Array,
  uvs: Float32Array,
  batches: RenderBatch[],
  depths: Float32Array,
  width: number,
  height: number,
  alphaCutoff: number = 64,
  textureFilter: TextureFilter = 'bilinear',
  onProgress?: ProgressCallback
): Promise<Uint8Array> {
  const out = new Uint8Array(width * height * 4);
  const isBilinear = textureFilter === 'bilinear';

  // 1. Collect all triangles with their mean depth and batch index
  interface TriRecord {
    meanDepth: number;
    bIdx: number;
    tri: Tri;
  }
  const triRecords: TriRecord[] = [];

  for (let bIdx = 0; bIdx < batches.length; bIdx++) {
    const batch = batches[bIdx];
    for (const tri of batch.tris) {
      const d0 = depths[tri[0]];
      const d1 = depths[tri[1]];
      const d2 = depths[tri[2]];
      const meanDepth = (d0 + d1 + d2) / 3.0;
      triRecords.push({ meanDepth, bIdx, tri });
    }
  }

  if (triRecords.length === 0) return out;

  // 2. Sort descending by depth: farthest first, nearest last
  triRecords.sort((a, b) => b.meanDepth - a.meanDepth);

  // 3. Group consecutive triangles sharing the same batch
  let currBIdx = triRecords[0].bIdx;
  let currTris: Tri[] = [triRecords[0].tri];
  const total = triRecords.length;
  let lastYield = performance.now();

  for (let i = 1; i < total; i++) {
    const rec = triRecords[i];
    if (rec.bIdx === currBIdx) {
      currTris.push(rec.tri);
    } else {
      const batch = batches[currBIdx];
      rasterizeTriangles(
        out, width, height, verts2d, uvs, currTris,
        batch.texRgba, batch.texWidth, batch.texHeight,
        isBilinear, alphaCutoff
      );
      currBIdx = rec.bIdx;
      currTris = [rec.tri];
    }

    const now = performance.now();
    if (now - lastYield > 40) {
      if (onProgress) {
        onProgress(Math.round((i / total) * 100), `Rasterizing (${i}/${total} triangles)`);
      }
      await yieldToMain();
      lastYield = performance.now();
    }
  }

  if (currTris.length > 0) {
    const batch = batches[currBIdx];
    rasterizeTriangles(
      out, width, height, verts2d, uvs, currTris,
      batch.texRgba, batch.texWidth, batch.texHeight,
      isBilinear, alphaCutoff
    );
  }

  onProgress?.(100, 'Rasterization complete');
  return out;
}

export async function downsampleImage(
  srcRgba: Uint8Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  onProgress?: ProgressCallback
): Promise<Uint8Array> {
  if (srcW === dstW && srcH === dstH) return srcRgba;

  const dst = new Uint8Array(dstW * dstH * 4);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;
  let lastYield = performance.now();

  for (let dy = 0; dy < dstH; dy++) {
    const now = performance.now();
    if (now - lastYield > 40) {
      if (onProgress) {
        onProgress(Math.round((dy / dstH) * 100), `Downsampling (${dy}/${dstH} rows)`);
      }
      await yieldToMain();
      lastYield = performance.now();
    }

    const syStart = Math.floor(dy * yRatio);
    const syEnd = Math.min(Math.floor((dy + 1) * yRatio), srcH);
    const dstRow = dy * dstW * 4;

    for (let dx = 0; dx < dstW; dx++) {
      const sxStart = Math.floor(dx * xRatio);
      const sxEnd = Math.min(Math.floor((dx + 1) * xRatio), srcW);

      let rSum = 0, gSum = 0, bSum = 0, aSum = 0, count = 0;
      for (let sy = syStart; sy < syEnd; sy++) {
        const srcRow = sy * srcW * 4;
        for (let sx = sxStart; sx < sxEnd; sx++) {
          const sIdx = srcRow + sx * 4;
          rSum += srcRgba[sIdx + 0];
          gSum += srcRgba[sIdx + 1];
          bSum += srcRgba[sIdx + 2];
          aSum += srcRgba[sIdx + 3];
          count++;
        }
      }

      const dIdx = dstRow + dx * 4;
      if (count > 0) {
        dst[dIdx + 0] = Math.round(rSum / count);
        dst[dIdx + 1] = Math.round(gSum / count);
        dst[dIdx + 2] = Math.round(bSum / count);
        dst[dIdx + 3] = Math.round(aSum / count);
      }
    }
  }

  return dst;
}

/**
 * Crops an RGBA buffer to the minimal bounding box containing non-transparent pixels,
 * mimicking ImageMagick's `magick in.png -trim +repage out.png`.
 */
export function trimTransparent(
  rgba: Uint8Array,
  width: number,
  height: number,
  alphaThreshold: number = 1
): { trimmedRgba: Uint8Array; width: number; height: number; bbox: [number, number, number, number] } {
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      const a = rgba[rowOffset + x * 4 + 3];
      if (a >= alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // If entirely transparent or empty, return original
  if (maxX < minX || maxY < minY) {
    return { trimmedRgba: rgba, width, height, bbox: [0, 0, width, height] };
  }

  const trimmedW = maxX - minX + 1;
  const trimmedH = maxY - minY + 1;
  const trimmedRgba = new Uint8Array(trimmedW * trimmedH * 4);

  for (let y = 0; y < trimmedH; y++) {
    const srcY = minY + y;
    const srcRow = (srcY * width + minX) * 4;
    const dstRow = y * trimmedW * 4;
    trimmedRgba.set(rgba.subarray(srcRow, srcRow + trimmedW * 4), dstRow);
  }

  return {
    trimmedRgba,
    width: trimmedW,
    height: trimmedH,
    bbox: [minX, minY, maxX + 1, maxY + 1],
  };
}

/**
 * Crops an array of RGBA animation frames to their shared union bounding box containing non-transparent pixels,
 * preserving consistent frame dimensions across the animation sequence.
 */
export function trimFramesUnion(
  frames: Uint8Array[],
  width: number,
  height: number,
  alphaThreshold: number = 1
): { trimmedFrames: Uint8Array[]; width: number; height: number; bbox: [number, number, number, number] } {
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;

  for (const frame of frames) {
    for (let y = 0; y < height; y++) {
      const rowOffset = y * width * 4;
      for (let x = 0; x < width; x++) {
        const a = frame[rowOffset + x * 4 + 3];
        if (a >= alphaThreshold) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  }

  // If entirely transparent or empty, return original
  if (maxX < minX || maxY < minY) {
    return { trimmedFrames: frames, width, height, bbox: [0, 0, width, height] };
  }

  const trimmedW = maxX - minX + 1;
  const trimmedH = maxY - minY + 1;
  const trimmedFrames = frames.map((frame) => {
    const trimmed = new Uint8Array(trimmedW * trimmedH * 4);
    for (let y = 0; y < trimmedH; y++) {
      const srcY = minY + y;
      const srcRow = (srcY * width + minX) * 4;
      const dstRow = y * trimmedW * 4;
      trimmed.set(frame.subarray(srcRow, srcRow + trimmedW * 4), dstRow);
    }
    return trimmed;
  });

  return {
    trimmedFrames,
    width: trimmedW,
    height: trimmedH,
    bbox: [minX, minY, maxX + 1, maxY + 1],
  };
}

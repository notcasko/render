import { BBox, FocusMode, LogCallback, ViewAxes, ViewBox } from './types';

export function viewComponents(
  verts: Float64Array,
  viewAxes: ViewAxes = 'zy'
): { u: Float64Array; v: Float64Array; depth: Float64Array } {
  const n = verts.length / 3;
  const u = new Float64Array(n);
  const v = new Float64Array(n);
  const depth = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const x = verts[i * 3 + 0];
    const y = verts[i * 3 + 1];
    const z = verts[i * 3 + 2];
    if (viewAxes === 'xy') {
      u[i] = x;
      v[i] = y;
      depth[i] = z;
    } else {
      // 'zy' default: screen X = Z, screen Y = Y, depth = X
      u[i] = z;
      v[i] = y;
      depth[i] = x;
    }
  }
  return { u, v, depth };
}

export function viewBoxForVerts(
  verts: Float64Array,
  viewAxes: ViewAxes = 'zy'
): ViewBox | null {
  if (verts.length === 0) return null;
  const { u, v } = viewComponents(verts, viewAxes);
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (let i = 0; i < u.length; i++) {
    if (u[i] < minU) minU = u[i];
    if (u[i] > maxU) maxU = u[i];
    if (v[i] < minV) minV = v[i];
    if (v[i] > maxV) maxV = v[i];
  }
  return [minU, maxU, minV, maxV];
}

export function project(
  verts: Float64Array,
  width: number,
  height: number,
  padPx: number,
  viewBox: ViewBox | null = null,
  viewAxes: ViewAxes = 'zy'
): { verts2d: Float32Array; depths: Float32Array; effectiveBox: ViewBox } {
  const { u, v, depth } = viewComponents(verts, viewAxes);
  const box = viewBox || viewBoxForVerts(verts, viewAxes)!;
  const [uMin, uMax, vMin, vMax] = box;

  const uSpan = Math.max(uMax - uMin, 1e-6);
  const vSpan = Math.max(vMax - vMin, 1e-6);
  const scale = Math.min((width - 2 * padPx) / uSpan, (height - 2 * padPx) / vSpan);

  const n = verts.length / 3;
  const verts2d = new Float32Array(n * 2);
  const depths = new Float32Array(n);
  const uMid = 0.5 * (uMin + uMax);

  for (let i = 0; i < n; i++) {
    verts2d[i * 2 + 0] = (u[i] - uMid) * scale + width / 2.0;
    verts2d[i * 2 + 1] = height - ((v[i] - vMin) * scale + padPx);
    depths[i] = depth[i];
  }

  return { verts2d, depths, effectiveBox: box };
}

export function alphaBbox(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  alphaCutoff: number = 1
): BBox | null {
  let minX = width, maxX = -1, minY = height, maxY = -1;
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      const a = rgba[rowOffset + x * 4 + 3];
      if (a >= alphaCutoff) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return [minX, minY, maxX + 1, maxY + 1];
}

export function largestComponentBbox(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  alphaCutoff: number = 1
): BBox | null {
  // Downsample to fast grid if needed, or scan directly
  const visited = new Uint8Array(width * height);
  const offsets = [-1, 0, 1];
  let bestArea = 0;
  let bestBbox: BBox | null = null;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (visited[idx] || rgba[idx * 4 + 3] < alphaCutoff) continue;

      // Flood fill BFS
      const queue = [x, y];
      visited[idx] = 1;
      let area = 0;
      let minX = x, maxX = x, minY = y, maxY = y;
      let head = 0;

      while (head < queue.length) {
        const cx = queue[head++];
        const cy = queue[head++];
        area++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        for (const dy of offsets) {
          for (const dx of offsets) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nIdx = ny * width + nx;
              if (!visited[nIdx] && rgba[nIdx * 4 + 3] >= alphaCutoff) {
                visited[nIdx] = 1;
                queue.push(nx, ny);
              }
            }
          }
        }
      }

      if (area > bestArea) {
        bestArea = area;
        bestBbox = [minX, minY, maxX + 1, maxY + 1];
      }
    }
  }

  return bestBbox || alphaBbox(rgba, width, height, alphaCutoff);
}

export function refineViewBoxFromPixelBbox(
  viewBox: ViewBox,
  bbox: BBox | null,
  imgW: number,
  imgH: number,
  padPx: number,
  log?: LogCallback
): ViewBox {
  if (!bbox) return viewBox;
  const [uMin, uMax, vMin, vMax] = viewBox;
  const scale = Math.min((imgW - 2.0 * padPx) / Math.max(uMax - uMin, 1e-6), (imgH - 2.0 * padPx) / Math.max(vMax - vMin, 1e-6));
  if (scale <= 1e-12) return viewBox;

  const [x0, y0, x1, y1] = bbox;
  const uMid = 0.5 * (uMin + uMax);

  const pxToU = (px: number) => (px - imgW / 2.0) / scale + uMid;
  const pyToV = (py: number) => ((imgH - py) - padPx) / scale + vMin;

  const nu0 = pxToU(x0);
  const nu1 = pxToU(x1);
  const nv0 = pyToV(y1);
  const nv1 = pyToV(y0);

  const refined: ViewBox = [
    Math.min(nu0, nu1),
    Math.max(nu0, nu1),
    Math.min(nv0, nv1),
    Math.max(nv0, nv1),
  ];

  log?.('Camera', `Refined camera view box: [${refined.map(n => n.toFixed(4)).join(', ')}]`);
  return refined;
}

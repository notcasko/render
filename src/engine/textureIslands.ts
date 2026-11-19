import { DecodedTexture } from './unityBundle';
import { RenderEntry, Tri, MeshData } from './types';
import { parseMeshData } from './skinning';

export interface TextureIsland {
  id: string; // e.g. "isl_0_12"
  entryIndex: number;
  islandIndex: number;
  triCount: number;
  internalName: string;
  rawBoneName: string;
  box: {
    uMin: number;
    vMin: number;
    uMax: number;
    vMax: number;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
  thumbnailUrl: string;
  textureName: string;
  triIndices: number[];
}

function uvKey(u: number, v: number): number {
  const ku = Math.round(u * 1000) & 0xffff;
  const kv = Math.round(v * 1000) & 0xffff;
  return (ku << 16) | kv;
}

export function formatBoneOrPartName(boneName: string, meshName: string, index: number): string {
  if (!boneName || boneName === 'unknown') {
    return meshName ? `${meshName} #${index + 1}` : `Part #${index + 1}`;
  }

  let clean = boneName.replace(/^joint_/, '').replace(/^joint/, '');

  let prefix = '';
  if (clean.startsWith('MOK_') || clean.startsWith('mok_')) {
    prefix = 'Komachi ';
    clean = clean.slice(4);
  } else if (clean.startsWith('MOT_') || clean.startsWith('mot_')) {
    prefix = 'Suitor ';
    clean = clean.slice(4);
  } else if (clean.startsWith('OKN_') || clean.startsWith('okn_')) {
    prefix = 'Okuni ';
    clean = clean.slice(4);
  } else if (clean.startsWith('ZBR_') || clean.startsWith('zbr_') || clean.startsWith('zzbr_')) {
    prefix = 'Zanzaburo ';
    clean = clean.replace(/^(zbr_|zzbr_)/i, '');
  }

  let category = '';
  const lower = clean.toLowerCase();
  if (lower.includes('cloth') || lower.includes('dress') || lower.includes('skirt')) {
    category = ' (Dress)';
  } else if (lower.includes('sleeve')) {
    category = ' (Sleeve)';
  } else if (lower.includes('hair')) {
    category = ' (Hair)';
  } else if (lower.includes('umbrella')) {
    category = ' (Umbrella)';
  } else if (lower.includes('belt')) {
    category = ' (Belt)';
  } else if (lower.includes('head') || lower.includes('face') || lower.includes('eye') || lower.includes('mouth')) {
    category = ' (Head/Face)';
  } else if (lower.includes('ribbon')) {
    category = ' (Ribbon)';
  } else if (lower.includes('shield')) {
    category = ' (Shield)';
  } else if (lower.includes('weapon') || lower.includes('sword') || lower.includes('gun')) {
    category = ' (Weapon)';
  } else if (lower.includes('glass')) {
    category = ' (Glasses)';
  } else if (lower.includes('leg') || lower.includes('foot') || lower.includes('knee')) {
    category = ' (Leg)';
  } else if (lower.includes('arm') || lower.includes('hand') || lower.includes('finger')) {
    category = ' (Arm)';
  } else if (lower.includes('hip') || lower.includes('waist') || lower.includes('spine')) {
    category = ' (Body/Cloth)';
  }

  return `${prefix}${clean}${category}`.trim();
}

export function createIslandThumbnail(
  tex: DecodedTexture,
  uMin: number,
  vMin: number,
  uMax: number,
  vMax: number,
  maxThumbSize: number = 72
): string {
  if (typeof document === 'undefined') return '';
  const tw = tex.width;
  const th = tex.height;
  if (!tw || !th || !tex.rgba) return '';

  const x0 = Math.max(0, Math.min(tw - 1, Math.floor(uMin * tw)));
  const x1 = Math.max(x0 + 1, Math.min(tw, Math.ceil(uMax * tw)));
  // In Unity UV coordinates v=0 is bottom, v=1 is top
  const y0 = Math.max(0, Math.min(th - 1, Math.floor((1.0 - vMax) * th)));
  const y1 = Math.max(y0 + 1, Math.min(th, Math.ceil((1.0 - vMin) * th)));

  const cropW = x1 - x0;
  const cropH = y1 - y0;
  if (cropW <= 0 || cropH <= 0) return '';

  const scale = Math.min(1.0, maxThumbSize / Math.max(cropW, cropH));
  const thumbW = Math.max(1, Math.round(cropW * scale));
  const thumbH = Math.max(1, Math.round(cropH * scale));

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = cropW;
  srcCanvas.height = cropH;
  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) return '';

  const imgData = srcCtx.createImageData(cropW, cropH);
  for (let dy = 0; dy < cropH; dy++) {
    const srcY = y0 + dy;
    if (srcY >= th) break;
    const srcRow = (srcY * tw + x0) * 4;
    const dstRow = dy * cropW * 4;
    imgData.data.set(tex.rgba.subarray(srcRow, srcRow + cropW * 4), dstRow);
  }
  srcCtx.putImageData(imgData, 0, 0);

  if (scale >= 0.99) {
    return srcCanvas.toDataURL('image/png');
  }

  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = thumbW;
  dstCanvas.height = thumbH;
  const dstCtx = dstCanvas.getContext('2d');
  if (!dstCtx) return srcCanvas.toDataURL('image/png');
  dstCtx.imageSmoothingEnabled = true;
  dstCtx.drawImage(srcCanvas, 0, 0, thumbW, thumbH);
  return dstCanvas.toDataURL('image/png');
}

export function extractTextureIslands(
  chosenEntries: RenderEntry[],
  decodedTextures: Map<string, DecodedTexture>,
  fallbackTex: DecodedTexture,
  byId: Map<bigint, any>
): TextureIsland[] {
  const islands: TextureIsland[] = [];

  for (let eIdx = 0; eIdx < chosenEntries.length; eIdx++) {
    const entry = chosenEntries[eIdx];
    const smr = entry.smrAsset;
    const meshAsset = entry.meshAsset;
    if (!smr || !meshAsset) continue;

    const rawMeshData: MeshData = parseMeshData(meshAsset);
    if (!rawMeshData.tris || rawMeshData.tris.length === 0) continue;

    // Resolve texture
    let batchTex = fallbackTex;
    const matRef = smr.data.materials?.[0];
    if (matRef?.m_PathID) {
      const mat = byId.get(matRef.m_PathID);
      if (mat?.data?.savedProperties?.texEnvs) {
        for (const [propName, propVal] of mat.data.savedProperties.texEnvs) {
          if (propName === '_MainTex' && propVal.texture?.m_PathID) {
            const texAsset = byId.get(propVal.texture.m_PathID);
            if (texAsset) {
              const found = decodedTextures.get(texAsset.name.toLowerCase());
              if (found) {
                batchTex = found;
                break;
              }
            }
          }
        }
      }
    }

    // Resolve bone names
    const bones: any[] = smr.data?.bones || [];
    const boneNames: string[] = [];
    for (const bRef of bones) {
      const tr = byId.get(bRef.m_PathID);
      const goPid = tr?.data?.gameObject?.m_PathID;
      const go = goPid ? byId.get(goPid) : null;
      boneNames.push(go?.name || '');
    }

    // Build UV adjacency graph
    const triAdj = new Map<number, number[]>();
    const numTris = rawMeshData.tris.length;
    for (let t = 0; t < numTris; t++) {
      const [v0, v1, v2] = rawMeshData.tris[t];
      for (const v of [v0, v1, v2]) {
        const u = rawMeshData.uvs[v * 2];
        const valV = rawMeshData.uvs[v * 2 + 1];
        const k = uvKey(u, valV);
        let list = triAdj.get(k);
        if (!list) {
          list = [];
          triAdj.set(k, list);
        }
        list.push(t);
      }
    }

    // BFS connected components
    const visited = new Uint8Array(numTris);
    let islandCounter = 0;

    for (let t = 0; t < numTris; t++) {
      if (visited[t]) continue;
      const comp: number[] = [];
      const queue: number[] = [t];
      visited[t] = 1;
      let uMin = Infinity, vMin = Infinity, uMax = -Infinity, vMax = -Infinity;
      const vertSet = new Set<number>();

      while (queue.length > 0) {
        const cur = queue.pop()!;
        comp.push(cur);
        const [v0, v1, v2] = rawMeshData.tris[cur];
        for (const v of [v0, v1, v2]) {
          vertSet.add(v);
          const u = rawMeshData.uvs[v * 2];
          const valV = rawMeshData.uvs[v * 2 + 1];
          if (u < uMin) uMin = u;
          if (u > uMax) uMax = u;
          if (valV < vMin) vMin = valV;
          if (valV > vMax) vMax = valV;

          const k = uvKey(u, valV);
          const neighbors = triAdj.get(k);
          if (neighbors) {
            for (const n of neighbors) {
              if (!visited[n]) {
                visited[n] = 1;
                queue.push(n);
              }
            }
          }
        }
      }

      // Determine top bone weight
      const boneWeights = new Map<string, number>();
      for (const v of vertSet) {
        for (let k = 0; k < 4; k++) {
          const w = rawMeshData.weights[v * 4 + k];
          if (w > 0.05) {
            const bIdx = rawMeshData.indices[v * 4 + k];
            if (bIdx >= 0 && bIdx < boneNames.length) {
              const bName = boneNames[bIdx];
              if (bName) {
                boneWeights.set(bName, (boneWeights.get(bName) || 0) + w);
              }
            }
          }
        }
      }

      let topBone = 'unknown';
      let maxW = 0;
      for (const [bName, weight] of boneWeights.entries()) {
        if (weight > maxW) {
          maxW = weight;
          topBone = bName;
        }
      }

      const id = `isl_${entry.index}_${islandCounter}`;
      const internalName = formatBoneOrPartName(topBone, entry.meshName, islandCounter);
      const thumbnailUrl = createIslandThumbnail(batchTex, uMin, vMin, uMax, vMax);

      const tw = batchTex.width;
      const th = batchTex.height;
      const x0 = Math.max(0, Math.floor(uMin * tw));
      const x1 = Math.min(tw, Math.ceil(uMax * tw));
      const y0 = Math.max(0, Math.floor((1.0 - vMax) * th));
      const y1 = Math.min(th, Math.ceil((1.0 - vMin) * th));

      islands.push({
        id,
        entryIndex: entry.index,
        islandIndex: islandCounter,
        triCount: comp.length,
        internalName,
        rawBoneName: topBone,
        box: { uMin, vMin, uMax, vMax, x0, y0, x1, y1 },
        thumbnailUrl,
        textureName: batchTex.name,
        triIndices: comp,
      });

      islandCounter++;
    }
  }

  // Sort by triangle count descending so major character parts appear first
  islands.sort((a, b) => b.triCount - a.triCount);
  return islands;
}

export function getExcludedTrianglesForEntry(
  islands: TextureIsland[],
  excludedIds: string[] | undefined,
  entryIndex: number
): Set<number> | null {
  if (!excludedIds || excludedIds.length === 0) return null;
  const excludedSet = new Set(excludedIds);
  const triSet = new Set<number>();
  let hasAny = false;

  for (const isl of islands) {
    if (isl.entryIndex === entryIndex && excludedSet.has(isl.id)) {
      hasAny = true;
      for (const t of isl.triIndices) {
        triSet.add(t);
      }
    }
  }

  return hasAny ? triSet : null;
}

import { AnimPose, GifCenter, LogCallback, MeshData, PartMeta, Quat, RenderBatch, RenderEntry, Tri, Vec3 } from './types';
import { mat4Mul, trs } from './math';
import { fullPathOfTransform, DecodedTexture } from './unityBundle';

export function localTrs(tr: any, pose: AnimPose | null, byId: Map<bigint, any>): { pos: Vec3; rot: Quat; scale: Vec3 } {
  const lp = tr.data.localPosition || { x: 0, y: 0, z: 0 };
  const lr = tr.data.localRotation || { x: 0, y: 0, z: 0, w: 1 };
  const ls = tr.data.localScale || { x: 1, y: 1, z: 1 };

  let pos: Vec3 = [Number(lp.x), Number(lp.y), Number(lp.z)];
  let rot: Quat = [Number(lr.x), Number(lr.y), Number(lr.z), Number(lr.w)];
  let scale: Vec3 = [Number(ls.x), Number(ls.y), Number(ls.z)];

  if (!pose) return { pos, rot, scale };

  const p = fullPathOfTransform(tr, byId);
  const rel = p.includes('/') ? p.slice(p.indexOf('/') + 1) : p;
  const over = pose.get(rel);
  if (over) {
    if (over.pos) pos = over.pos;
    if (over.rot) rot = over.rot;
    if (over.scale) scale = over.scale;
  }
  return { pos, rot, scale };
}

export function computeWorldMatrix(
  tr: any,
  cache: Map<bigint, Float64Array>,
  pose: AnimPose | null,
  byId: Map<bigint, any>
): Float64Array {
  const key = tr.pathId;
  if (cache.has(key)) return cache.get(key)!;

  const { pos, rot, scale } = localTrs(tr, pose, byId);
  const local = trs(pos, rot, scale);

  const fatherPid = tr.data?.father?.m_PathID;
  const parent = fatherPid ? byId.get(fatherPid) : null;

  let world: Float64Array;
  if (!parent) {
    world = local;
  } else {
    const parentWorld = computeWorldMatrix(parent, cache, pose, byId);
    world = mat4Mul(parentWorld, local);
  }
  cache.set(key, world);
  return world;
}

export function parseMeshData(meshAsset: any): MeshData {
  const d = meshAsset.data;
  const numVerts = d.vertexCount;
  const verts = new Float32Array(d.vertices || []);
  const uvs = d.uv?.[0] ? new Float32Array(d.uv[0]) : new Float32Array(numVerts * 2);

  const weights = new Float32Array(numVerts * 4);
  const indices = new Int32Array(numVerts * 4);
  const skins = d.skin || [];

  for (let i = 0; i < numVerts; i++) {
    if (i < skins.length) {
      const s = skins[i];
      for (let k = 0; k < 4; k++) {
        weights[i * 4 + k] = s.weight[k] ?? 0;
        indices[i * 4 + k] = s.boneIndex[k] ?? 0;
      }
    } else {
      weights[i * 4] = 1.0;
    }
  }

  // Collect all submesh triangle lists and flattened tris
  const submeshTris: Tri[][] = [];
  const tris: Tri[] = [];
  if (d.indices && Array.isArray(d.indices)) {
    for (let subIdx = 0; subIdx < d.indices.length; subIdx++) {
      const idxBuf = d.indices[subIdx];
      const curSubTris: Tri[] = [];
      if (idxBuf) {
        for (let i = 0; i < idxBuf.length; i += 3) {
          const tri: Tri = [idxBuf[i], idxBuf[i + 1], idxBuf[i + 2]];
          curSubTris.push(tri);
          tris.push(tri);
        }
      }
      submeshTris.push(curSubTris);
    }
  }

  // Bind poses
  const rawBp = d.bindPose || [];
  const bindPoses = rawBp.map((bp: any) => {
    const m = new Float64Array(16);
    m[0] = bp.e00; m[1] = bp.e01; m[2] = bp.e02; m[3] = bp.e03;
    m[4] = bp.e10; m[5] = bp.e11; m[6] = bp.e12; m[7] = bp.e13;
    m[8] = bp.e20; m[9] = bp.e21; m[10] = bp.e22; m[11] = bp.e23;
    m[12] = bp.e30; m[13] = bp.e31; m[14] = bp.e32; m[15] = bp.e33;
    return m;
  });

  return { verts, uvs, weights, indices, tris, submeshTris, bindPoses };
}

export function skinMesh(
  meshData: MeshData,
  worldMats: Float64Array[],
  bindPoses: Float64Array[]
): Float64Array {
  const numVerts = meshData.verts.length / 3;
  const boneCount = Math.min(worldMats.length, bindPoses.length);
  if (boneCount <= 0) {
    const out = new Float64Array(numVerts * 3);
    for (let i = 0; i < numVerts * 3; i++) out[i] = meshData.verts[i];
    return out;
  }

  const skinMats: Float64Array[] = new Array(boneCount);
  for (let b = 0; b < boneCount; b++) {
    skinMats[b] = mat4Mul(worldMats[b], bindPoses[b]);
  }

  const outV = new Float64Array(numVerts * 3);
  const rawV = meshData.verts;
  const weights = meshData.weights;
  const indices = meshData.indices;

  for (let i = 0; i < numVerts; i++) {
    const vx = rawV[i * 3 + 0];
    const vy = rawV[i * 3 + 1];
    const vz = rawV[i * 3 + 2];

    let totalW = 0.0;
    let ox = 0.0;
    let oy = 0.0;
    let oz = 0.0;

    for (let k = 0; k < 4; k++) {
      const w = weights[i * 4 + k];
      const idx = indices[i * 4 + k];
      if (w > 1e-6 && idx >= 0 && idx < boneCount) {
        const sm = skinMats[idx];
        const tx = sm[0] * vx + sm[1] * vy + sm[2] * vz + sm[3];
        const ty = sm[4] * vx + sm[5] * vy + sm[6] * vz + sm[7];
        const tz = sm[8] * vx + sm[9] * vy + sm[10] * vz + sm[11];
        ox += w * tx;
        oy += w * ty;
        oz += w * tz;
        totalW += w;
      }
    }

    if (totalW > 1e-6) {
      outV[i * 3 + 0] = ox / totalW;
      outV[i * 3 + 1] = oy / totalW;
      outV[i * 3 + 2] = oz / totalW;
    } else {
      outV[i * 3 + 0] = vx;
      outV[i * 3 + 1] = vy;
      outV[i * 3 + 2] = vz;
    }
  }

  return outV;
}

export function yawRotateVerts(
  verts: Float64Array,
  degrees: number
): Float64Array {
  if (Math.abs(degrees) < 1e-9) return verts;
  const n = verts.length / 3;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = verts[i * 3 + 0], z = verts[i * 3 + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const cx = 0.5 * (minX + maxX);
  const cz = 0.5 * (minZ + maxZ);

  const theta = (degrees * Math.PI) / 180.0;
  const c = Math.cos(theta);
  const s = Math.sin(theta);

  const out = new Float64Array(verts.length);
  for (let i = 0; i < n; i++) {
    const x = verts[i * 3 + 0] - cx;
    const y = verts[i * 3 + 1];
    const z = verts[i * 3 + 2] - cz;
    out[i * 3 + 0] = x * c + z * s + cx;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = -x * s + z * c + cz;
  }
  return out;
}

export function applyViewTransform(
  verts: Float64Array,
  yawDeg: number = 0.0,
  mirror: boolean = false
): Float64Array {
  let out = yawRotateVerts(verts, yawDeg);
  if (mirror) {
    const n = out.length / 3;
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
      const z = out[i * 3 + 2];
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const midZ2 = minZ + maxZ;
    const mirrored = new Float64Array(out.length);
    for (let i = 0; i < n; i++) {
      mirrored[i * 3 + 0] = out[i * 3 + 0];
      mirrored[i * 3 + 1] = out[i * 3 + 1];
      mirrored[i * 3 + 2] = midZ2 - out[i * 3 + 2];
    }
    out = mirrored;
  }
  return out;
}

export function applyAnchor(verts: Float64Array, anchor: Vec3): Float64Array {
  if (anchor[0] === 0 && anchor[1] === 0 && anchor[2] === 0) return verts;
  const out = new Float64Array(verts.length);
  const n = verts.length / 3;
  for (let i = 0; i < n; i++) {
    out[i * 3 + 0] = verts[i * 3 + 0] - anchor[0];
    out[i * 3 + 1] = verts[i * 3 + 1] - anchor[1];
    out[i * 3 + 2] = verts[i * 3 + 2] - anchor[2];
  }
  return out;
}

export function recenterGeometry(
  allV: Float64Array,
  partMeta: PartMeta[],
  mode: GifCenter = 'none'
): { renderV: Float64Array; cameraV: Float64Array; anchor: Vec3 } {
  if (mode === 'none') {
    return { renderV: allV, cameraV: allV, anchor: [0, 0, 0] };
  }
  // For body recentering, find body parts
  const n = allV.length / 3;
  let sumX = 0, sumY = 0, sumZ = 0, count = 0;
  for (const part of partMeta) {
    if (mode === 'body' && part.base !== 'body') continue;
    for (let i = part.start; i < part.end; i++) {
      sumX += allV[i * 3 + 0];
      sumY += allV[i * 3 + 1];
      sumZ += allV[i * 3 + 2];
      count++;
    }
  }

  if (count === 0) {
    count = n;
    for (let i = 0; i < n; i++) {
      sumX += allV[i * 3 + 0];
      sumY += allV[i * 3 + 1];
      sumZ += allV[i * 3 + 2];
    }
  }

  const anchor: Vec3 = [sumX / count, sumY / count, sumZ / count];
  const renderV = applyAnchor(allV, anchor);
  return { renderV, cameraV: renderV, anchor };
}

export function filterMeshDataByBones(
  meshData: MeshData,
  smr: any,
  byId: Map<bigint, any>,
  includeBones: string[] = [],
  excludeBones: string[] = []
): MeshData {
  const incNeedles = (includeBones || []).map((s) => s.toLowerCase().trim()).filter(Boolean);
  const excNeedles = (excludeBones || []).map((s) => s.toLowerCase().trim()).filter(Boolean);

  if (incNeedles.length === 0 && excNeedles.length === 0) {
    return meshData;
  }

  const bones: any[] = smr.data?.bones || [];
  const boneNames: string[] = [];
  const bonePaths: string[] = [];

  for (const bRef of bones) {
    const tr = byId.get(bRef.m_PathID);
    if (!tr) {
      boneNames.push('');
      bonePaths.push('');
      continue;
    }
    const goPid = tr.data?.gameObject?.m_PathID;
    const go = goPid ? byId.get(goPid) : null;
    boneNames.push(go ? (go.name || '').toLowerCase() : '');
    bonePaths.push(fullPathOfTransform(tr, byId).toLowerCase());
  }

  function boneMatches(bIdx: number, needles: string[]): boolean {
    if (bIdx < 0 || bIdx >= boneNames.length) return false;
    const bName = boneNames[bIdx];
    const bPath = bonePaths[bIdx];
    return needles.some((n) => bName.includes(n) || bPath.includes(n));
  }

  const subLists = meshData.submeshTris && meshData.submeshTris.length > 0
    ? meshData.submeshTris
    : [meshData.tris];

  const newSubmeshTris: Tri[][] = [];
  const survivingTrisArray: Tri[] = [];

  for (const sub of subLists) {
    const survivingSub: Tri[] = [];
    for (const tri of sub) {
      if (excNeedles.length > 0) {
        let drop = false;
        for (const v of tri) {
          for (let k = 0; k < 4; k++) {
            const w = meshData.weights[v * 4 + k];
            if (w > 0.001) {
              const bIdx = meshData.indices[v * 4 + k];
              if (boneMatches(bIdx, excNeedles)) {
                drop = true;
                break;
              }
            }
          }
          if (drop) break;
        }
        if (drop) continue;
      }

      if (incNeedles.length > 0) {
        let keep = false;
        for (const v of tri) {
          for (let k = 0; k < 4; k++) {
            const w = meshData.weights[v * 4 + k];
            if (w > 0.001) {
              const bIdx = meshData.indices[v * 4 + k];
              if (boneMatches(bIdx, incNeedles)) {
                keep = true;
                break;
              }
            }
          }
          if (keep) break;
        }
        if (!keep) continue;
      }

      survivingSub.push(tri);
      survivingTrisArray.push(tri);
    }
    newSubmeshTris.push(survivingSub);
  }

  if (survivingTrisArray.length === 0) {
    return {
      verts: new Float32Array(0),
      uvs: new Float32Array(0),
      weights: new Float32Array(0),
      indices: new Int32Array(0),
      tris: [],
      submeshTris: newSubmeshTris,
      bindPoses: meshData.bindPoses,
    };
  }

  // Re-index vertices to only keep used ones (matching python fgo_render_refactored)
  const usedVertsSet = new Set<number>();
  for (const tri of survivingTrisArray) {
    usedVertsSet.add(tri[0]);
    usedVertsSet.add(tri[1]);
    usedVertsSet.add(tri[2]);
  }
  const usedVerts = Array.from(usedVertsSet).sort((a, b) => a - b);
  const oldToNew = new Map<number, number>();
  for (let newIdx = 0; newIdx < usedVerts.length; newIdx++) {
    oldToNew.set(usedVerts[newIdx], newIdx);
  }

  const numNewVerts = usedVerts.length;
  const newVerts = new Float32Array(numNewVerts * 3);
  const newUvs = new Float32Array(numNewVerts * 2);
  const newWeights = new Float32Array(numNewVerts * 4);
  const newIndices = new Int32Array(numNewVerts * 4);

  for (let newIdx = 0; newIdx < numNewVerts; newIdx++) {
    const oldIdx = usedVerts[newIdx];
    newVerts[newIdx * 3 + 0] = meshData.verts[oldIdx * 3 + 0];
    newVerts[newIdx * 3 + 1] = meshData.verts[oldIdx * 3 + 1];
    newVerts[newIdx * 3 + 2] = meshData.verts[oldIdx * 3 + 2];
    newUvs[newIdx * 2 + 0] = meshData.uvs[oldIdx * 2 + 0];
    newUvs[newIdx * 2 + 1] = meshData.uvs[oldIdx * 2 + 1];
    for (let k = 0; k < 4; k++) {
      newWeights[newIdx * 4 + k] = meshData.weights[oldIdx * 4 + k];
      newIndices[newIdx * 4 + k] = meshData.indices[oldIdx * 4 + k];
    }
  }

  const reindexedSubmeshTris: Tri[][] = newSubmeshTris.map((sub) =>
    sub.map(([a, b, c]) => [oldToNew.get(a)!, oldToNew.get(b)!, oldToNew.get(c)!])
  );
  const reindexedCombinedTris: Tri[] = survivingTrisArray.map(([a, b, c]) => [
    oldToNew.get(a)!,
    oldToNew.get(b)!,
    oldToNew.get(c)!,
  ]);

  return {
    verts: newVerts,
    uvs: newUvs,
    weights: newWeights,
    indices: newIndices,
    tris: reindexedCombinedTris,
    submeshTris: reindexedSubmeshTris,
    bindPoses: meshData.bindPoses,
  };
}

export function buildFrameBatches(
  chosenEntries: RenderEntry[],
  animPose: AnimPose,
  fallbackTex: DecodedTexture,
  decodedTextures: Map<string, DecodedTexture>,
  byId: Map<bigint, any>,
  yawDeg: number = 0.0,
  mirror: boolean = false,
  includeBones: string[] = [],
  excludeBones: string[] = [],
  log?: LogCallback
): { allV: Float64Array; allUvs: Float32Array; batches: RenderBatch[]; partMeta: PartMeta[] } {
  const worldCache = new Map<bigint, Float64Array>();
  const allSkinnedList: Float64Array[] = [];
  const allUvsList: Float32Array[] = [];
  const batches: RenderBatch[] = [];
  const partMeta: PartMeta[] = [];
  let offset = 0;

  for (const entry of chosenEntries) {
    const smr = entry.smrAsset;
    const mesh = entry.meshAsset;
    const rawMeshData = parseMeshData(mesh);
    if (rawMeshData.verts.length === 0) continue;

    const meshData = filterMeshDataByBones(rawMeshData, smr, byId, includeBones, excludeBones);
    if (meshData.verts.length === 0 || meshData.tris.length === 0) continue;

    const bones: any[] = smr.data.bones || [];
    const worldMats = bones.map((b: any) => {
      const boneTr = byId.get(b.m_PathID);
      return boneTr ? computeWorldMatrix(boneTr, worldCache, animPose, byId) : new Float64Array(16);
    });

    const skinned = skinMesh(meshData, worldMats, meshData.bindPoses);
    allSkinnedList.push(skinned);
    allUvsList.push(meshData.uvs);

    const subLists = meshData.submeshTris && meshData.submeshTris.length > 0
      ? meshData.submeshTris
      : [meshData.tris];

    for (let subIdx = 0; subIdx < subLists.length; subIdx++) {
      const subTris = subLists[subIdx];
      if (subTris.length === 0) continue;
      const reindexedTris: Tri[] = subTris.map(([a, b, c]) => [a + offset, b + offset, c + offset]);

      // Check material texture for this submesh
      let batchTex = fallbackTex;
      let label = 'fallback';
      const matRef = smr.data.materials?.[subIdx] || smr.data.materials?.[0];
      if (matRef?.m_PathID) {
        const mat = byId.get(matRef.m_PathID);
        if (mat?.data?.savedProperties?.texEnvs) {
          for (const [propName, propVal] of mat.data.savedProperties.texEnvs) {
            if (propName === '_MainTex' || !batchTex || batchTex === fallbackTex) {
              if (propVal.texture?.m_PathID) {
                const texAsset = byId.get(propVal.texture.m_PathID);
                if (texAsset) {
                  const found = decodedTextures.get(texAsset.name.toLowerCase());
                  if (found) {
                    batchTex = found;
                    label = `${mat.name} (${propName})`;
                    if (propName === '_MainTex') break;
                  }
                }
              }
            }
          }
        }
      }

      batches.push({
        tris: reindexedTris,
        texRgba: batchTex.rgba,
        texWidth: batchTex.width,
        texHeight: batchTex.height,
        label,
      });
    }

    const vCount = skinned.length / 3;
    partMeta.push({
      base: entry.base,
      meshName: entry.meshName,
      fullPath: entry.fullPath,
      start: offset,
      end: offset + vCount,
    });
    offset += vCount;
  }

  if (allSkinnedList.length === 0) {
    throw new Error('No meshes rendered (all entries filtered out)');
  }

  // Concatenate all vertices
  let totalVerts = 0;
  for (const s of allSkinnedList) totalVerts += s.length;
  const mergedV = new Float64Array(totalVerts);
  let vPtr = 0;
  for (const s of allSkinnedList) {
    mergedV.set(s, vPtr);
    vPtr += s.length;
  }

  // Concatenate all UVs
  let totalUvs = 0;
  for (const u of allUvsList) totalUvs += u.length;
  const allUvs = new Float32Array(totalUvs);
  let uPtr = 0;
  for (const u of allUvsList) {
    allUvs.set(u, uPtr);
    uPtr += u.length;
  }

  const allV = applyViewTransform(mergedV, yawDeg, mirror);
  log?.(
    'Skinning',
    `Batches prepared: ${batches.length} submesh batches, ${allV.length / 3} total skinned vertices, ${batches.reduce((acc, b) => acc + b.tris.length, 0)} triangles`
  );

  return { allV, allUvs, batches, partMeta };
}

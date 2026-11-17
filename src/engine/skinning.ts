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

  // Triangles
  const tris: Tri[] = [];
  if (d.indices && d.indices.length > 0) {
    const idxBuf = d.indices[0];
    for (let i = 0; i < idxBuf.length; i += 3) {
      tris.push([idxBuf[i], idxBuf[i + 1], idxBuf[i + 2]]);
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

  return { verts, uvs, weights, indices, tris, bindPoses };
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
  const renderV = new Float64Array(allV.length);
  for (let i = 0; i < n; i++) {
    renderV[i * 3 + 0] = allV[i * 3 + 0] - anchor[0];
    renderV[i * 3 + 1] = allV[i * 3 + 1] - anchor[1];
    renderV[i * 3 + 2] = allV[i * 3 + 2] - anchor[2];
  }
  return { renderV, cameraV: renderV, anchor };
}

export function buildFrameBatches(
  chosenEntries: RenderEntry[],
  animPose: AnimPose,
  fallbackTex: DecodedTexture,
  decodedTextures: Map<string, DecodedTexture>,
  byId: Map<bigint, any>,
  yawDeg: number = 0.0,
  mirror: boolean = false,
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
    const meshData = parseMeshData(mesh);
    if (meshData.verts.length === 0) continue;

    const bones: any[] = smr.data.bones || [];
    const worldMats = bones.map((b: any) => {
      const boneTr = byId.get(b.m_PathID);
      return boneTr ? computeWorldMatrix(boneTr, worldCache, animPose, byId) : new Float64Array(16);
    });

    const skinned = skinMesh(meshData, worldMats, meshData.bindPoses);
    allSkinnedList.push(skinned);
    allUvsList.push(meshData.uvs);

    const reindexedTris: Tri[] = meshData.tris.map(([a, b, c]) => [a + offset, b + offset, c + offset]);

    // Check material texture
    let batchTex = fallbackTex;
    let label = 'fallback';
    const matRef = smr.data.materials?.[0];
    if (matRef?.m_PathID) {
      const mat = byId.get(matRef.m_PathID);
      if (mat?.data?.savedProperties?.texEnvs) {
        for (const [propName, propVal] of mat.data.savedProperties.texEnvs) {
          if (propVal.texture?.m_PathID) {
            const texAsset = byId.get(propVal.texture.m_PathID);
            if (texAsset) {
              const found = decodedTextures.get(texAsset.name.toLowerCase());
              if (found) {
                batchTex = found;
                label = `${mat.name} (${propName})`;
                break;
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

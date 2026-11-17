import { load } from 'unity-asset-reader';
import { decodeImage, initTexture } from 'unity-asset-reader-texture';
import { RenderEntry, LogCallback } from './types';

let isTextureInit = false;
async function ensureTextureInit() {
  if (isTextureInit) return;
  const baseUrl = import.meta.env.BASE_URL || './';
  const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const localWasmPath = `${cleanBase}wasm`;

  try {
    await initTexture({ wasmPath: localWasmPath });
    isTextureInit = true;
  } catch (e: any) {
    console.warn('initTexture local path failed, falling back to CDN:', e);
    try {
      await initTexture({ wasmPath: 'https://cdn.jsdelivr.net/npm/texture2ddecoder-wasm@1.2.3/wasm' });
      isTextureInit = true;
    } catch (cdnErr) {
      console.error('initTexture CDN fallback failed:', cdnErr);
    }
  }
}

// Precomputed CRC32 table
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c >>> 0;
}

export function crc32(str: string): number {
  const enc = new TextEncoder();
  const bytes = enc.encode(str);
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

export function meshBaseAndLevel(meshName: string): [string, string | null] {
  const match = meshName.match(/^(.*?)(?:_level_(.+))?$/);
  return match ? [match[1], match[2] || null] : [meshName, null];
}

export interface DecodedTexture {
  name: string;
  width: number;
  height: number;
  rgba: Uint8Array;
}

export interface PreparedBundleData {
  entries: RenderEntry[];
  clips: any[];
  textures: any[];
  decodedTextures: Map<string, DecodedTexture>;
  defaultTexture: DecodedTexture | null;
  pathMap: Map<number, string>;
  rootCounts: Map<string, number>;
  assetsByPid: Map<bigint, any>;
}

export function fullPathOfTransform(tr: any, byId: Map<bigint, any>): string {
  const parts: string[] = [];
  let cur = tr;
  while (cur) {
    const goPid = cur.data?.gameObject?.m_PathID;
    const go = goPid ? byId.get(goPid) : null;
    if (go) parts.push(go.name);
    const fatherPid = cur.data?.father?.m_PathID;
    cur = fatherPid ? byId.get(fatherPid) : null;
  }
  return parts.reverse().join('/');
}

export function rootTransform(tr: any, byId: Map<bigint, any>): any {
  let cur = tr;
  while (cur?.data?.father?.m_PathID) {
    const parent = byId.get(cur.data.father.m_PathID);
    if (!parent) break;
    cur = parent;
  }
  return cur;
}

export async function parseUnityBundle(
  buffer: ArrayBuffer | Uint8Array,
  log?: LogCallback
): Promise<PreparedBundleData> {
  const startTime = performance.now();
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  log?.('Bundle', `Opening UnityFS container (${(bytes.length / (1024 * 1024)).toFixed(2)} MB)...`);

  const env = load(bytes);
  const assetsByPid = new Map<bigint, any>();
  const smrs: any[] = [];
  const clips: any[] = [];
  const textures: any[] = [];
  const transforms: any[] = [];

  for (const asset of env.assets()) {
    assetsByPid.set(asset.pathId, asset);
    if (asset.type === 'SkinnedMeshRenderer') smrs.push(asset);
    else if (asset.type === 'AnimationClip') clips.push(asset);
    else if (asset.type === 'Texture2D') textures.push(asset);
    else if (asset.type === 'Transform') transforms.push(asset);
  }

  log?.(
    'Discovery',
    `Assets parsed in ${(performance.now() - startTime).toFixed(1)}ms: ${smrs.length} SMRs, ${clips.length} Clips, ${textures.length} Textures, ${transforms.length} Transforms`
  );

  // Build CRC32 path map
  const pathMap = new Map<number, string>();
  for (const tr of transforms) {
    const full = fullPathOfTransform(tr, assetsByPid);
    const rel = full.includes('/') ? full.slice(full.indexOf('/') + 1) : full;
    const c = crc32(rel);
    if (!pathMap.has(c) || full.startsWith('model/')) {
      pathMap.set(c, rel);
    }
  }
  log?.('Discovery', `CRC32 transform-path table built with ${pathMap.size} unique paths`);

  // Decode textures
  await ensureTextureInit();
  const decodedTextures = new Map<string, DecodedTexture>();
  let defaultTexture: DecodedTexture | null = null;
  let maxArea = -1;

  for (const texAsset of textures) {
    try {
      const decoded = await decodeImage(texAsset);
      const entry: DecodedTexture = {
        name: texAsset.name,
        width: decoded.width,
        height: decoded.height,
        rgba: decoded.rgba,
      };
      decodedTextures.set(texAsset.name.toLowerCase(), entry);
      const area = decoded.width * decoded.height;
      if (area > maxArea) {
        maxArea = area;
        defaultTexture = entry;
      }
      log?.(
        'Discovery',
        `Decoded texture "${texAsset.name}": ${decoded.width}x${decoded.height} (${(decoded.rgba.length / 1024).toFixed(0)} KB RGBA)`
      );
    } catch (err: any) {
      log?.('Discovery', `Skipped non-decodable texture "${texAsset.name}": ${err.message}`, undefined, 'warn');
    }
  }

  // Collect RenderEntries
  const entries: RenderEntry[] = [];
  const rootPids = new Map<bigint, string>();
  const rootNameCounts = new Map<string, number>();
  const rootCounts = new Map<string, number>();

  for (let idx = 0; idx < smrs.length; idx++) {
    const smr = smrs[idx];
    const goPid = smr.data?.gameObject?.m_PathID;
    const go = goPid ? assetsByPid.get(goPid) : null;
    const meshPid = smr.data?.mesh?.m_PathID;
    const mesh = meshPid ? assetsByPid.get(meshPid) : null;
    if (!go || !mesh) continue;

    // Get transform
    const comp0Pid = go.data?.component?.[0]?.component?.m_PathID;
    const tr = comp0Pid ? assetsByPid.get(comp0Pid) : null;
    if (!tr) continue;

    const meshName = mesh.name || 'unnamed_mesh';
    const [base, level] = meshBaseAndLevel(meshName);
    const rootTr = rootTransform(tr, assetsByPid);
    const rootGoPid = rootTr?.data?.gameObject?.m_PathID || 0n;

    if (!rootPids.has(rootGoPid)) {
      const rootGo = assetsByPid.get(rootGoPid);
      const rawRoot = rootGo ? rootGo.name : 'root';
      const c = rootNameCounts.get(rawRoot) || 0;
      rootNameCounts.set(rawRoot, c + 1);
      rootPids.set(rootGoPid, c === 0 ? rawRoot : `${rawRoot}#${c + 1}`);
    }

    const rootName = rootPids.get(rootGoPid)!;
    rootCounts.set(rootName, (rootCounts.get(rootName) || 0) + 1);

    const rootBonePid = smr.data?.rootBone?.m_PathID;
    const rootBoneTr = rootBonePid ? assetsByPid.get(rootBonePid) : null;
    const rootBoneGo = rootBoneTr?.data?.gameObject?.m_PathID ? assetsByPid.get(rootBoneTr.data.gameObject.m_PathID) : null;
    const rootBoneName = rootBoneGo ? rootBoneGo.name : '';

    entries.push({
      index: idx,
      meshName,
      base,
      level,
      goName: go.name,
      root: rootName,
      fullPath: fullPathOfTransform(tr, assetsByPid),
      bonesCount: smr.data?.bones?.length || 0,
      rootBoneName,
      rootGoPid,
      smrAsset: smr,
      meshAsset: mesh,
    });
  }

  log?.('Discovery', `Discovered ${entries.length} render entries under roots: ${Array.from(rootCounts.keys()).join(', ')}`);

  return {
    entries,
    clips,
    textures,
    decodedTextures,
    defaultTexture,
    pathMap,
    rootCounts,
    assetsByPid,
  };
}

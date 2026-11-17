import { AnimPose, ClipInfo, LogCallback, Quat, RenderEntry, Vec3 } from './types';
import { crc32, fullPathOfTransform } from './unityBundle';
import {
  interpScalarChannel,
  sampleDenseRow,
  normalizeQuat,
  unityEulerZxyToQuat,
} from './math';

export function bindingSlotCount(binding: any): number {
  if (binding.attribute === 1 || binding.attribute === 3 || binding.attribute === 4) return 3;
  if (binding.attribute === 2) return 4;
  return 1;
}

export function buildAnimPose(
  clipAsset: any,
  pathMap: Map<number, string>,
  targetFrame: number | null = null,
  targetTimeParam: number | null = null,
  log?: LogCallback
): AnimPose {
  if (!clipAsset) return new Map();

  const clip = clipAsset.data;
  const sampleRate = clip.sampleRate || 30.0;
  let targetTime = 0.0;
  if (targetTimeParam !== null) {
    targetTime = targetTimeParam;
    log?.('Animation', `Sampling clip "${clipAsset.name}" at time: ${targetTime.toFixed(4)}s`);
  } else if (targetFrame !== null) {
    targetTime = targetFrame / sampleRate;
    log?.('Animation', `Sampling clip "${clipAsset.name}" at frame: ${targetFrame} (${targetTime.toFixed(4)}s)`);
  } else {
    log?.('Animation', `Sampling clip "${clipAsset.name}" at default frame 0 (0.000s)`);
  }

  const bindings = clip.clipBindingConstant?.genericBindings || [];
  const totalSlots = bindings.reduce((acc: number, b: any) => acc + bindingSlotCount(b), 0);

  const clipData = clip.muscleClip?.clip?.data;
  if (!clipData) {
    log?.('Animation', 'No muscleClip data found in AnimationClip', undefined, 'warn');
    return new Map();
  }

  const streamedCount = clipData.streamedClip?.curveCount || 0;
  const streamSlots = Math.min(streamedCount, totalSlots);
  const streamInitial: (number | null)[] = new Array(streamSlots).fill(null);
  const streamTimes: number[][] = Array.from({ length: streamSlots }, () => []);
  const streamValues: number[][] = Array.from({ length: streamSlots }, () => []);

  // Parse streamedClip
  if (clipData.streamedClip?.data) {
    const rawData = clipData.streamedClip.data;
    const u32 = new Uint32Array(rawData);
    const view = new DataView(u32.buffer, u32.byteOffset, u32.byteLength);
    let offset = 0;
    while (offset < view.byteLength) {
      const time = view.getFloat32(offset, true);
      const numKeys = view.getInt32(offset + 4, true);
      offset += 8;
      for (let k = 0; k < numKeys; k++) {
        const index = view.getInt32(offset, true);
        const coeff3 = view.getFloat32(offset + 16, true);
        offset += 20;
        if (index >= 0 && index < streamSlots) {
          if (!Number.isFinite(time) || time < 0.0) {
            streamInitial[index] = coeff3;
          } else {
            streamTimes[index].push(time);
            streamValues[index].push(coeff3);
          }
        }
      }
    }
  }

  const values: (number | null)[] = new Array(totalSlots).fill(null);

  // 1. Interpolate streamed curves
  for (let idx = 0; idx < Math.min(streamedCount, streamTimes.length); idx++) {
    const val = interpScalarChannel(streamTimes[idx], streamValues[idx], streamInitial[idx], targetTime);
    if (val !== null && idx < values.length) {
      values[idx] = val;
    }
  }

  // 2. Sample dense curves
  const dense = clipData.denseClip;
  if (dense && dense.curveCount > 0) {
    const denseCount = dense.curveCount;
    const denseFrameCount = dense.frameCount || 0;
    const denseSampleRate = dense.sampleRate || 30.0;
    const denseBeginTime = dense.beginTime || 0.0;
    const denseSamples = new Float64Array(dense.sampleArray || []);
    const denseRow = sampleDenseRow(denseSamples, denseCount, denseFrameCount, denseBeginTime, denseSampleRate, targetTime);
    if (denseRow) {
      for (let i = 0; i < denseRow.length; i++) {
        const slot = streamedCount + i;
        if (slot < totalSlots) values[slot] = denseRow[i];
      }
    }
  }

  // 3. Constant curves
  const constantData = clipData.constantClip?.data || [];
  const denseCount = dense?.curveCount || 0;
  const constantStart = streamedCount + denseCount;
  for (let i = 0; i < constantData.length; i++) {
    const slot = constantStart + i;
    if (slot < totalSlots) values[slot] = constantData[i];
  }

  // 4. Map values into pose overrides by matching binding paths
  const pose: AnimPose = new Map();
  let cursor = 0;
  let resolvedCurves = 0;

  for (const binding of bindings) {
    const n = bindingSlotCount(binding);
    const vals = values.slice(cursor, cursor + n);
    cursor += n;

    const path = pathMap.get(Number(binding.path));
    if (!path || vals.some(v => v === null)) continue;

    let entry = pose.get(path);
    if (!entry) {
      entry = {};
      pose.set(path, entry);
    }
    resolvedCurves++;

    const fvals = vals as number[];
    if (binding.attribute === 1 && n === 3) {
      entry.pos = [fvals[0], fvals[1], fvals[2]];
    } else if (binding.attribute === 2 && n === 4) {
      entry.rot = normalizeQuat(fvals);
    } else if (binding.attribute === 3 && n === 3) {
      entry.scale = [fvals[0], fvals[1], fvals[2]];
    } else if (binding.attribute === 4 && n === 3) {
      entry.rot = unityEulerZxyToQuat(fvals[0], fvals[1], fvals[2]);
    }
  }

  log?.('Animation', `Generated anim pose: ${pose.size} transform overrides (${resolvedCurves} curve channels resolved)`);
  return pose;
}

export function getClipInfo(
  clipAsset: any,
  chosenEntries?: RenderEntry[],
  assetsByPid?: Map<bigint, any>
): ClipInfo {
  const name = clipAsset.name;
  const clip = clipAsset.data;
  if (!clip) {
    return { name, hasAnimation: false, totalFrames: 0, sampleRate: 30, duration: 0 };
  }

  const sampleRate = clip.sampleRate || 30.0;
  const bindings: any[] = clip.clipBindingConstant?.genericBindings || [];
  const clipData = clip.muscleClip?.clip?.data;
  const streamedCount = clipData?.streamedClip?.curveCount || 0;
  const denseFrameCount = clipData?.denseClip?.frameCount || 0;

  if (bindings.length === 0 || (streamedCount === 0 && denseFrameCount <= 1)) {
    return { name, hasAnimation: false, totalFrames: 0, sampleRate, duration: 0 };
  }

  // If chosenEntries are provided, check whether this clip actually animates any bone in the chosen meshes
  if (chosenEntries && chosenEntries.length > 0 && assetsByPid) {
    const activeBoneCRCs = new Set<number>();
    for (const entry of chosenEntries) {
      const bones = entry.smrAsset?.data?.bones || [];
      for (const b of bones) {
        const bTr = assetsByPid.get(b.m_PathID);
        if (bTr) {
          const bFull = fullPathOfTransform(bTr, assetsByPid);
          const bRel = bFull.includes('/') ? bFull.slice(bFull.indexOf('/') + 1) : bFull;
          activeBoneCRCs.add(crc32(bRel));
        }
      }
      const rbPid = entry.smrAsset?.data?.rootBone?.m_PathID;
      if (rbPid) {
        const rbTr = assetsByPid.get(rbPid);
        if (rbTr) {
          const rbFull = fullPathOfTransform(rbTr, assetsByPid);
          const rbRel = rbFull.includes('/') ? rbFull.slice(rbFull.indexOf('/') + 1) : rbFull;
          activeBoneCRCs.add(crc32(rbRel));
        }
      }
    }

    if (activeBoneCRCs.size > 0) {
      let animatesAny = false;
      for (const b of bindings) {
        if (activeBoneCRCs.has(Number(b.path))) {
          animatesAny = true;
          break;
        }
      }
      if (!animatesAny) {
        // Clip drives zero bones of the currently selected meshes
        return { name, hasAnimation: false, totalFrames: 0, sampleRate, duration: 0 };
      }
    }
  }

  let duration = 0.0;
  if (clip.muscleClip) {
    const startT = clip.muscleClip.startTime || 0.0;
    const stopT = clip.muscleClip.stopTime || 0.0;
    duration = Math.max(0.0, stopT - startT);
  }

  if (clipData?.streamedClip?.data) {
    const rawData = clipData.streamedClip.data;
    const u32 = new Uint32Array(rawData);
    const view = new DataView(u32.buffer, u32.byteOffset, u32.byteLength);
    let offset = 0;
    let maxTime = -Infinity;
    while (offset < view.byteLength) {
      const time = view.getFloat32(offset, true);
      const numKeys = view.getInt32(offset + 4, true);
      offset += 8 + numKeys * 20;
      if (Number.isFinite(time) && time > maxTime) maxTime = time;
    }
    if (maxTime > -Infinity) {
      const startT = clip.muscleClip?.startTime || 0.0;
      duration = Math.max(duration, maxTime - startT);
    }
  }

  if (clipData?.denseClip) {
    const dense = clipData.denseClip;
    const frameCount = dense.frameCount || 0;
    const dSampleRate = dense.sampleRate || 30.0;
    const beginTime = dense.beginTime || 0.0;
    const startT = clip.muscleClip?.startTime || 0.0;
    if (frameCount > 0 && dSampleRate > 0) {
      duration = Math.max(duration, beginTime + (frameCount - 1) / dSampleRate - startT);
    }
  }

  const totalFrames = Math.max(1, Math.round(duration * sampleRate));
  return {
    name,
    hasAnimation: totalFrames > 0,
    totalFrames,
    sampleRate,
    duration,
  };
}

import { Vec3, Quat } from './types';

export function mat4Identity(): Float64Array {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1.0;
  return m;
}

export function quatToMat4(x: number, y: number, z: number, w: number): Float64Array {
  const n = x * x + y * y + z * z + w * w;
  if (n > 1e-12 && Math.abs(n - 1.0) > 1e-4) {
    const s = 1.0 / Math.sqrt(n);
    x *= s;
    y *= s;
    z *= s;
    w *= s;
  }
  const m = new Float64Array(16);
  m[0] = 1.0 - 2.0 * (y * y + z * z);
  m[1] = 2.0 * (x * y - w * z);
  m[2] = 2.0 * (x * z + w * y);
  m[3] = 0.0;

  m[4] = 2.0 * (x * y + w * z);
  m[5] = 1.0 - 2.0 * (x * x + z * z);
  m[6] = 2.0 * (y * z - w * x);
  m[7] = 0.0;

  m[8] = 2.0 * (x * z - w * y);
  m[9] = 2.0 * (y * z + w * x);
  m[10] = 1.0 - 2.0 * (x * x + y * y);
  m[11] = 0.0;

  m[12] = 0.0;
  m[13] = 0.0;
  m[14] = 0.0;
  m[15] = 1.0;
  return m;
}

export function trs(pos: Vec3, rot: Quat, scale: Vec3): Float64Array {
  const m = quatToMat4(rot[0], rot[1], rot[2], rot[3]);
  m[0] *= scale[0];
  m[1] *= scale[1];
  m[2] *= scale[2];
  m[4] *= scale[0];
  m[5] *= scale[1];
  m[6] *= scale[2];
  m[8] *= scale[0];
  m[9] *= scale[1];
  m[10] *= scale[2];
  m[3] = pos[0];
  m[7] = pos[1];
  m[11] = pos[2];
  return m;
}

export function mat4Mul(a: Float64Array, b: Float64Array): Float64Array {
  const out = new Float64Array(16);
  for (let i = 0; i < 4; i++) {
    const ai0 = a[i * 4 + 0];
    const ai1 = a[i * 4 + 1];
    const ai2 = a[i * 4 + 2];
    const ai3 = a[i * 4 + 3];
    out[i * 4 + 0] = ai0 * b[0] + ai1 * b[4] + ai2 * b[8] + ai3 * b[12];
    out[i * 4 + 1] = ai0 * b[1] + ai1 * b[5] + ai2 * b[9] + ai3 * b[13];
    out[i * 4 + 2] = ai0 * b[2] + ai1 * b[6] + ai2 * b[10] + ai3 * b[14];
    out[i * 4 + 3] = ai0 * b[3] + ai1 * b[7] + ai2 * b[11] + ai3 * b[15];
  }
  return out;
}

export function unityEulerZxyToQuat(ex: number, ey: number, ez: number): Quat {
  const r = Math.PI / 180.0;
  ex *= r;
  ey *= r;
  ez *= r;
  const sx = Math.sin(ex * 0.5), cx = Math.cos(ex * 0.5);
  const sy = Math.sin(ey * 0.5), cy = Math.cos(ey * 0.5);
  const sz = Math.sin(ez * 0.5), cz = Math.cos(ez * 0.5);
  return [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz,
  ];
}

export function normalizeQuat(q: number[] | Float64Array | Quat): Quat {
  const norm = Math.hypot(q[0], q[1], q[2], q[3]);
  if (norm <= 1e-12) return [0.0, 0.0, 0.0, 1.0];
  return [q[0] / norm, q[1] / norm, q[2] / norm, q[3] / norm];
}

export function interpScalarChannel(
  times: number[] | Float64Array,
  values: number[] | Float64Array,
  initialValue: number | null,
  targetTime: number
): number | null {
  if (times.length === 0) return initialValue;
  if (targetTime <= times[0] + 1e-12) return initialValue ?? values[0];
  if (targetTime >= times[times.length - 1] - 1e-12) return values[values.length - 1];

  let l = 0;
  let r = times.length;
  while (l < r) {
    const mid = (l + r) >> 1;
    if (times[mid] <= targetTime) l = mid + 1;
    else r = mid;
  }
  const idx = Math.max(1, Math.min(l, times.length - 1));
  const t0 = times[idx - 1];
  const t1 = times[idx];
  const v0 = values[idx - 1];
  const v1 = values[idx];
  if (Math.abs(t1 - t0) < 1e-12) return v1;
  const a = (targetTime - t0) / (t1 - t0);
  return (1.0 - a) * v0 + a * v1;
}

export function sampleDenseRow(
  samples: Float64Array,
  curveCount: number,
  frameCount: number,
  beginTime: number,
  sampleRate: number,
  targetTime: number
): Float64Array | null {
  if (curveCount <= 0 || frameCount <= 0 || samples.length < curveCount) return null;
  if (frameCount === 1 || sampleRate <= 1e-12) return samples.slice(0, curveCount);
  const pos = Math.max(0.0, Math.min(frameCount - 1, (targetTime - beginTime) * sampleRate));
  const i0 = Math.floor(pos);
  const i1 = Math.min(frameCount - 1, i0 + 1);
  const a = pos - i0;
  const out = new Float64Array(curveCount);
  const o0 = i0 * curveCount;
  const o1 = i1 * curveCount;
  for (let c = 0; c < curveCount; c++) {
    out[c] = samples[o0 + c] * (1.0 - a) + samples[o1 + c] * a;
  }
  return out;
}

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type Tri = [number, number, number];
export type BBox = [number, number, number, number]; // [minX, minY, maxX, maxY]
export type ViewBox = [number, number, number, number]; // [uMin, uMax, vMin, vMax]

export type TextureFilter = 'nearest' | 'bilinear';
export type FocusMode = 'largest_component' | 'alpha_bbox';
export type ViewAxes = 'zy' | 'xy';
export type GifCenter = 'body' | 'all' | 'eye' | 'none';
export type AnimFormat = 'apng' | 'gif';

export interface ClipInfo {
  name: string;
  hasAnimation: boolean;
  totalFrames: number;
  sampleRate: number;
  duration: number;
}

export interface RenderSettings {
  width: number;
  height: number;
  supersample: number;
  textureFilter: TextureFilter;
  focusMode: FocusMode;
  padFrac: number;
  alphaCutoff: number;
  yawDeg: number;
  mirror: boolean;
  viewAxes: ViewAxes;
  invertDepth?: boolean;
  gifCenter: GifCenter;
  targetFrame: number | null;
  targetTime: number | null;
  gifStartFrame?: number;
  gifEndFrame?: number;
  animFormat?: AnimFormat;
}

export interface SelectionOptions {
  roots: string[];
  onlyMeshes?: string[];
  includeMeshes?: string[];
  excludeMeshes?: string[];
  onlyPaths?: string[];
  includePaths?: string[];
  excludePaths?: string[];
  includeBones?: string[];
  excludeBones?: string[];
  textureName?: string;
}

export interface RenderEntry {
  index: number;
  meshName: string;
  base: string;
  level: string | null;
  goName: string;
  root: string;
  fullPath: string;
  bonesCount: number;
  rootBoneName: string;
  rootGoPid: bigint;
  smrAsset: any;
  meshAsset: any;
}

export interface MeshData {
  verts: Float32Array;
  uvs: Float32Array;
  weights: Float32Array;
  indices: Int32Array;
  tris: Tri[];
  submeshTris?: Tri[][];
  bindPoses: Float64Array[];
}

export interface PartMeta {
  base: string;
  meshName: string;
  fullPath: string;
  start: number;
  end: number;
}

export interface RenderBatch {
  tris: Tri[];
  texRgba: Uint8Array;
  texWidth: number;
  texHeight: number;
  label: string;
}

export type AnimPose = Map<string, {
  pos?: Vec3;
  rot?: Quat;
  scale?: Vec3;
}>;

export interface RenderHistoryItem {
  id: string;
  timestamp: string;
  npId: string;
  clip: string;
  width: number;
  height: number;
  dataUrl: string;
  isFastPreview: boolean;
  renderTimeMs: number;
  isGif?: boolean;
  isAnimated?: boolean;
  animFormat?: AnimFormat;
  frameCount?: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  category: 'Network' | 'Bundle' | 'Discovery' | 'Animation' | 'Geometry' | 'Skinning' | 'Camera' | 'Rasterizer' | 'Preview' | 'Texture' | 'Done' | 'Error';
  message: string;
  level: 'info' | 'warn' | 'error' | 'success';
  detail?: string;
  historyId?: string;
  thumbnailUrl?: string;
}

export type LogCallback = (
  category: LogEntry['category'],
  message: string,
  detail?: string,
  level?: LogEntry['level'],
  historyId?: string,
  thumbnailUrl?: string
) => void;
export type ProgressCallback = (progressPercent: number, stageName: string) => void;
export type PreviewCallback = (previewCanvas: HTMLCanvasElement) => void;

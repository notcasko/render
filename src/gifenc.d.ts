declare module 'gifenc' {
  export function GIFEncoder(opts?: any): any;
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: any): number[][];
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: number[][], format?: string): Uint8Array;
  export function nearestColorIndex(palette: number[][], r: number, g: number, b: number, a?: number): number;
}

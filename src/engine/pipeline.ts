import {
  ClipInfo,
  LogCallback,
  PreviewCallback,
  ProgressCallback,
  RenderEntry,
  RenderSettings,
  SelectionOptions,
  ViewBox,
} from './types';
import { parseUnityBundle, PreparedBundleData } from './unityBundle';
import { buildAnimPose, getClipInfo } from './animation';
import { buildFrameBatches, recenterGeometry } from './skinning';
import { project, refineViewBoxFromPixelBbox, alphaBbox, largestComponentBbox, viewBoxForVerts } from './projection';
import { drawBatchesSoftware, downsampleImage, trimTransparent, trimFramesUnion, yieldToMain } from './rasterizer';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import UPNG from 'upng-js';

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as any);
  }
  return btoa(binary);
}

export class RenderPipeline {
  private preparedBundle: PreparedBundleData | null = null;

  public async fetchBundle(
    npId: string | number,
    log?: LogCallback,
    onProgress?: (receivedBytes: number, totalBytes: number) => void
  ): Promise<Uint8Array> {
    const remoteUrl = `https://static.atlasacademy.io/file/aa-fgo-decrypt-jp/NoblePhantasm/${npId}`;
    let response: Response;
    try {
      log?.('Network', `Initiating download from AtlasAcademy CDN...`);
      response = await fetch(remoteUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    } catch (e: any) {
      log?.('Network', `AtlasAcademy fetch failed (${e.message}), trying local cached /${npId}...`, undefined, 'warn');
      response = await fetch(`/${npId}`);
      if (!response.ok) {
        throw new Error(`Failed to load NP file ${npId}: ${e.message}`);
      }
    }

    const totalBytes = Number(response.headers.get('content-length') || 0);
    const reader = response.body?.getReader();
    if (!reader) {
      const buf = await response.arrayBuffer();
      return new Uint8Array(buf);
    }

    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        receivedBytes += value.length;
        onProgress?.(receivedBytes, totalBytes);
      }
    }

    const merged = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    log?.(
      'Network',
      `Downloaded ${(receivedBytes / (1024 * 1024)).toFixed(2)} MB successfully`,
      undefined,
      'success'
    );
    return merged;
  }

  public async loadBundle(
    buffer: ArrayBuffer | Uint8Array,
    log?: LogCallback
  ): Promise<PreparedBundleData> {
    this.preparedBundle = await parseUnityBundle(buffer, log);
    return this.preparedBundle;
  }

  public getLoadedBundle(): PreparedBundleData | null {
    return this.preparedBundle;
  }

  public chooseEntries(
    allEntries: RenderEntry[],
    selection: SelectionOptions,
    log?: LogCallback
  ): RenderEntry[] {
    const { roots, onlyMeshes, includeMeshes, excludeMeshes, onlyPaths, includePaths, excludePaths } = selection;

    log?.('Discovery', `Filtering ${allEntries.length} entries for roots: [${roots.join(', ')}]`);

    let filtered = allEntries;
    if (roots && roots.length > 0 && !roots.includes('all')) {
      filtered = filtered.filter(e => roots.includes(e.root));
    }

    if (onlyMeshes && onlyMeshes.length > 0) {
      filtered = filtered.filter(e => onlyMeshes.includes(e.meshName));
    }
    if (onlyPaths && onlyPaths.length > 0) {
      filtered = filtered.filter(e => onlyPaths.some(p => e.fullPath.includes(p)));
    }
    if (includeMeshes && includeMeshes.length > 0) {
      const extra = allEntries.filter(e => includeMeshes.includes(e.meshName));
      filtered = Array.from(new Set([...filtered, ...extra]));
    }
    if (includePaths && includePaths.length > 0) {
      const extra = allEntries.filter(e => includePaths.some(p => e.fullPath.includes(p)));
      filtered = Array.from(new Set([...filtered, ...extra]));
    }
    if (excludeMeshes && excludeMeshes.length > 0) {
      filtered = filtered.filter(e => !excludeMeshes.includes(e.meshName));
    }
    if (excludePaths && excludePaths.length > 0) {
      filtered = filtered.filter(e => !excludePaths.some(p => e.fullPath.includes(p)));
    }

    log?.('Discovery', `Selected ${filtered.length} entries: ${filtered.map(e => `${e.root}/${e.meshName}`).join(', ')}`);
    return filtered;
  }

  public findClip(clipName: string): any | null {
    if (!this.preparedBundle) return null;
    const want = clipName.toLowerCase();
    const exact = this.preparedBundle.clips.find(c => c.name.toLowerCase() === want);
    if (exact) return exact;
    return this.preparedBundle.clips.find(c => c.name.toLowerCase().includes(want)) || null;
  }

  public getClipInfo(clipName: string, chosenEntries?: RenderEntry[]): ClipInfo | null {
    if (!this.preparedBundle) return null;
    const clip = this.findClip(clipName);
    if (!clip) return null;
    return getClipInfo(clip, chosenEntries, this.preparedBundle.assetsByPid);
  }

  public async render(
    settings: RenderSettings,
    selection: SelectionOptions,
    clipName: string,
    callbacks?: {
      onLog?: LogCallback;
      onProgress?: ProgressCallback;
      onPreview?: PreviewCallback;
    },
    trimTransparentOption: boolean = false
  ): Promise<{
    rgba: Uint8Array;
    width: number;
    height: number;
    renderTimeMs: number;
    isGif: boolean;
    isAnimated: boolean;
    animFormat?: 'apng' | 'gif';
    dataUrl?: string;
    frameCount?: number;
  }> {
    const startTime = performance.now();
    const log = callbacks?.onLog;
    const onProgress = callbacks?.onProgress;
    const onPreview = callbacks?.onPreview;

    const emitLog = async (
      category: any,
      message: string,
      detail?: string,
      level: 'info' | 'warn' | 'error' | 'success' = 'info'
    ) => {
      log?.(category, message, detail, level);
      await yieldToMain();
    };

    const emitProgress = async (pct: number, stage: string) => {
      onProgress?.(pct, stage);
      await yieldToMain();
    };

    if (!this.preparedBundle) {
      throw new Error('No bundle loaded. Please load or download a bundle first.');
    }

    // 1. Select clip
    const clip = this.findClip(clipName);
    if (!clip) {
      const available = this.preparedBundle.clips.map(c => c.name).join(', ');
      throw new Error(`Clip "${clipName}" not found in bundle. Available clips: ${available}`);
    }
    await emitLog('Animation', `Selected animation clip: "${clip.name}"`);

    // 2. Select render entries
    const chosenEntries = this.chooseEntries(this.preparedBundle.entries, selection, log);
    if (chosenEntries.length === 0) {
      throw new Error(`No render entries matched the selection. Roots available: ${Array.from(this.preparedBundle.rootCounts.keys()).join(', ')}`);
    }

    const clipInfo = getClipInfo(clip, chosenEntries, this.preparedBundle.assetsByPid);
    const hasAnimation = clipInfo.hasAnimation && clipInfo.totalFrames > 0;
    const isAnimatedMode =
      hasAnimation &&
      settings.gifStartFrame !== undefined &&
      settings.gifEndFrame !== undefined &&
      settings.gifEndFrame > settings.gifStartFrame;
    const animFormat = settings.animFormat || 'apng';

    // 3. Select default texture
    let targetTex = this.preparedBundle.defaultTexture;
    if (selection.textureName) {
      const want = selection.textureName.toLowerCase();
      targetTex = this.preparedBundle.decodedTextures.get(want) || targetTex;
    }
    if (!targetTex) {
      throw new Error('No decoded texture available for rendering');
    }

    // Hardcoded padding fraction at 0.05 (Requirement #1)
    const padFrac = 0.05;

    // ----------------- MULTI-FRAME ANIMATION MODE (APNG / GIF) -----------------
    if (isAnimatedMode) {
      const startFrame = settings.gifStartFrame!;
      const endFrame = settings.gifEndFrame!;
      const totalFrames = endFrame - startFrame + 1;
      const formatLabel = animFormat === 'gif' ? 'GIF (8-bit palette)' : 'APNG (32-bit Lossless Truecolor)';
      await emitLog('Animation', `Starting animation render (${formatLabel}): ${totalFrames} frames (frame ${startFrame} to ${endFrame}) at ${settings.width}x${settings.height}...`);

      // A. Lock camera framing across entire animation
      await emitProgress(10, 'Locking camera framing across animation');
      let unionBox: ViewBox | null = null;
      for (let f = startFrame; f <= endFrame; f++) {
        if (f % 5 === 0) {
          await yieldToMain();
        }
        const pose = buildAnimPose(clip, this.preparedBundle.pathMap, f, null);
        const { allV, partMeta } = buildFrameBatches(
          chosenEntries,
          pose,
          targetTex,
          this.preparedBundle.decodedTextures,
          this.preparedBundle.assetsByPid,
          0.0,
          settings.mirror
        );
        const { cameraV } = recenterGeometry(allV, partMeta, settings.gifCenter);
        const box = viewBoxForVerts(cameraV, settings.viewAxes);
        if (box) {
          if (!unionBox) {
            unionBox = [...box];
          } else {
            unionBox[0] = Math.min(unionBox[0], box[0]);
            unionBox[1] = Math.max(unionBox[1], box[1]);
            unionBox[2] = Math.min(unionBox[2], box[2]);
            unionBox[3] = Math.max(unionBox[3], box[3]);
          }
        }
      }

      const lockedCameraBox: ViewBox = unionBox || [-1, 1, -1, 1];
      const roughSize = 512;
      const roughPad = Math.round(roughSize * padFrac);
      const poseStart = buildAnimPose(clip, this.preparedBundle.pathMap, startFrame, null);
      const { allV: v0, allUvs: u0, batches: b0, partMeta: m0 } = buildFrameBatches(
        chosenEntries,
        poseStart,
        targetTex,
        this.preparedBundle.decodedTextures,
        this.preparedBundle.assetsByPid,
        0.0,
        settings.mirror
      );
      const { renderV: rv0 } = recenterGeometry(v0, m0, settings.gifCenter);
      const { verts2d: rV2d, depths: rDepths } = project(rv0, roughSize, roughSize, roughPad, lockedCameraBox, settings.viewAxes);
      const roughRgba = await drawBatchesSoftware(rV2d, u0, b0, rDepths, roughSize, roughSize, settings.alphaCutoff, 'nearest');
      const roughBbox = settings.focusMode === 'largest_component'
        ? largestComponentBbox(roughRgba, roughSize, roughSize, settings.alphaCutoff)
        : alphaBbox(roughRgba, roughSize, roughSize, settings.alphaCutoff);

      let refinedBox: ViewBox = lockedCameraBox;
      if (roughBbox) {
        refinedBox = refineViewBoxFromPixelBbox(lockedCameraBox, roughBbox, roughSize, roughSize, roughPad, log);
      }

      // Fast preview on start frame with refined camera
      if (onPreview) {
        try {
          const previewSize = 256;
          const previewPad = Math.round(previewSize * padFrac);
          const { verts2d: pV2d, depths: pDepths } = project(rv0, previewSize, previewSize, previewPad, refinedBox, settings.viewAxes);
          const previewRgba = await drawBatchesSoftware(pV2d, u0, b0, pDepths, previewSize, previewSize, settings.alphaCutoff, 'nearest');
          const previewCanvas = document.createElement('canvas');
          previewCanvas.width = previewSize;
          previewCanvas.height = previewSize;
          const pCtx = previewCanvas.getContext('2d');
          if (pCtx) {
            const imgData = pCtx.createImageData(previewSize, previewSize);
            imgData.data.set(previewRgba);
            pCtx.putImageData(imgData, 0, 0);
            onPreview(previewCanvas);
            await yieldToMain();
          }
        } catch {}
      }

      // B. Render all frames
      const MAX_WORK_SIZE = 4096;
      const targetW = settings.width;
      const targetH = settings.height;
      let workW = targetW;
      let workH = targetH;
      if (targetW < MAX_WORK_SIZE && settings.supersample > 1) {
        workW = Math.min(MAX_WORK_SIZE, targetW * settings.supersample);
        workH = Math.min(MAX_WORK_SIZE, targetH * settings.supersample);
      }
      const padPx = Math.round(Math.min(workW, workH) * padFrac);

      const allFramesRgba: Uint8Array[] = [];

      for (let f = startFrame; f <= endFrame; f++) {
        const frameIdx = f - startFrame;
        const pct = Math.round(20 + (frameIdx / totalFrames) * 70);
        await emitProgress(pct, `Rendering animation frame ${f} (${frameIdx + 1}/${totalFrames})`);

        const pose = buildAnimPose(clip, this.preparedBundle.pathMap, f, null);
        const { allV, allUvs, batches, partMeta } = buildFrameBatches(
          chosenEntries,
          pose,
          targetTex,
          this.preparedBundle.decodedTextures,
          this.preparedBundle.assetsByPid,
          0.0,
          settings.mirror
        );
        const { renderV } = recenterGeometry(allV, partMeta, settings.gifCenter);
        const { verts2d, depths } = project(renderV, workW, workH, padPx, refinedBox, settings.viewAxes);
        const highRes = await drawBatchesSoftware(verts2d, allUvs, batches, depths, workW, workH, settings.alphaCutoff, settings.textureFilter);
        const frameRgba = (workW !== settings.width || workH !== settings.height)
          ? await downsampleImage(highRes, workW, workH, settings.width, settings.height)
          : highRes;
        allFramesRgba.push(frameRgba);
        await yieldToMain();
      }

      // Optional union trim across all frames
      let finalFrames = allFramesRgba;
      let outWidth = settings.width;
      let outHeight = settings.height;

      if (trimTransparentOption) {
        const trimmed = trimFramesUnion(allFramesRgba, settings.width, settings.height);
        finalFrames = trimmed.trimmedFrames;
        outWidth = trimmed.width;
        outHeight = trimmed.height;
        await emitLog(
          'Rasterizer',
          `Trimmed transparent borders across all ${totalFrames} frames: ${settings.width}x${settings.height} -> ${outWidth}x${outHeight} (ImageMagick union trim)`,
          undefined,
          'info'
        );
      }

      // C. Encode animation (APNG or GIF)
      const fps = clipInfo.sampleRate || 30.0;
      const delayMs = Math.max(10, Math.round(1000 / fps));
      let animDataUrl = '';
      let fileByteLength = 0;

      if (animFormat === 'gif') {
        await emitProgress(92, 'Quantizing palette & encoding GIF');
        const gif = GIFEncoder();
        for (let i = 0; i < finalFrames.length; i++) {
          const frameRgba = finalFrames[i];
          const palette = quantize(frameRgba, 256, { format: 'rgba4444', oneBitAlpha: true });
          const index = applyPalette(frameRgba, palette, 'rgba4444');
          gif.writeFrame(index, outWidth, outHeight, {
            palette,
            delay: delayMs,
            transparent: true,
            transparentIndex: palette.length - 1,
          });
          if (i % 5 === 0) await yieldToMain();
        }
        gif.finish();
        const gifBytes = gif.bytes();
        fileByteLength = gifBytes.length;
        animDataUrl = `data:image/gif;base64,${uint8ArrayToBase64(gifBytes)}`;
      } else {
        await emitProgress(92, 'Encoding 32-bit Lossless Animated PNG (APNG)');
        await yieldToMain();

        const bufs: ArrayBuffer[] = finalFrames.map((f) => {
          const copy = new Uint8Array(f.byteLength);
          copy.set(f);
          return copy.buffer;
        });

        const delays = new Array(finalFrames.length).fill(delayMs);
        const apngBuffer = UPNG.encode(bufs, outWidth, outHeight, 0, delays);
        const apngBytes = new Uint8Array(apngBuffer);
        fileByteLength = apngBytes.length;
        animDataUrl = `data:image/png;base64,${uint8ArrayToBase64(apngBytes)}`;
      }

      const renderTimeMs = performance.now() - startTime;
      await emitProgress(100, `${animFormat.toUpperCase()} render complete`);
      await emitLog(
        'Done',
        `${animFormat.toUpperCase()} export finished in ${(renderTimeMs / 1000).toFixed(2)}s (${totalFrames} frames, ${(fileByteLength / 1024).toFixed(1)} KB ${animFormat === 'apng' ? 'lossless truecolor' : 'palette'} ready)`,
        undefined,
        'success'
      );

      return {
        rgba: finalFrames[0] || new Uint8Array(outWidth * outHeight * 4),
        width: outWidth,
        height: outHeight,
        renderTimeMs,
        isGif: animFormat === 'gif',
        isAnimated: true,
        animFormat,
        dataUrl: animDataUrl,
        frameCount: totalFrames,
      };
    }

    // ----------------- SINGLE STILL FRAME MODE -----------------
    const targetFrameToRender = settings.gifStartFrame !== undefined
      ? settings.gifStartFrame
      : (settings.targetFrame ?? 0);

    await emitLog('Discovery', `Starting still frame render: frame ${targetFrameToRender} at ${settings.width}x${settings.height} (${settings.supersample}x SS, filter=${settings.textureFilter}, alphaCutoff=${settings.alphaCutoff})`);

    // 4. Sample animation pose
    await emitProgress(10, 'Sampling animation pose');
    const animPose = buildAnimPose(clip, this.preparedBundle.pathMap, targetFrameToRender, settings.targetTime, log);
    await yieldToMain();

    // 5. Build geometry batches & skinning (yaw fixed at 0.0)
    await emitProgress(20, 'Skinning 3D vertices');
    const { allV, allUvs, batches, partMeta } = buildFrameBatches(
      chosenEntries,
      animPose,
      targetTex,
      this.preparedBundle.decodedTextures,
      this.preparedBundle.assetsByPid,
      0.0, // Fixed at 0 (Requirement #7: No yaw rotation)
      settings.mirror,
      log
    );
    await yieldToMain();

    const { renderV } = recenterGeometry(allV, partMeta, settings.gifCenter);

    // 6. FAST 256px PREVIEW PASS (Requirement #4 & #5)
    // Runs immediately in 256px so user doesn't stare at empty screen!
    if (onPreview) {
      try {
        await emitLog('Preview', 'Rendering fast 256px preview pass...');
        const previewSize = 256;
        const previewPad = Math.round(previewSize * padFrac);
        const { verts2d: pV2d, depths: pDepths } = project(
          renderV,
          previewSize,
          previewSize,
          previewPad,
          null,
          settings.viewAxes
        );

        const previewRgba = await drawBatchesSoftware(
          pV2d,
          allUvs,
          batches,
          pDepths,
          previewSize,
          previewSize,
          settings.alphaCutoff,
          'nearest'
        );

        // Send preview to UI
        const previewCanvas = document.createElement('canvas');
        previewCanvas.width = previewSize;
        previewCanvas.height = previewSize;
        const pCtx = previewCanvas.getContext('2d');
        if (pCtx) {
          const imgData = pCtx.createImageData(previewSize, previewSize);
          imgData.data.set(previewRgba);
          pCtx.putImageData(imgData, 0, 0);
          onPreview(previewCanvas);
          await emitLog('Preview', 'Fast 256px preview dispatched to preview window!', undefined, 'success');
        }
      } catch (pErr: any) {
        await emitLog('Preview', `Fast preview pass skipped: ${pErr.message}`, undefined, 'warn');
      }
    }

    // 7. PASS 1/2: Camera fitting / autofocus
    await emitProgress(40, 'Pass 1/2: Fitting camera viewport');
    await emitLog('Camera', 'Pass 1/2: Calculating rough frame for camera autoframing...');

    const roughSize = 512;
    const roughPad = Math.round(roughSize * padFrac);
    const { verts2d: roughV2d, depths: roughDepths, effectiveBox: roughBox } = project(
      renderV,
      roughSize,
      roughSize,
      roughPad,
      null,
      settings.viewAxes
    );

    let refinedBox: ViewBox = roughBox;

    const roughRgba = await drawBatchesSoftware(
      roughV2d,
      allUvs,
      batches,
      roughDepths,
      roughSize,
      roughSize,
      settings.alphaCutoff,
      'nearest'
    );

    // Compute bounding box
    const roughBbox = settings.focusMode === 'largest_component'
      ? largestComponentBbox(roughRgba, roughSize, roughSize, settings.alphaCutoff)
      : alphaBbox(roughRgba, roughSize, roughSize, settings.alphaCutoff);

    if (roughBbox) {
      refinedBox = refineViewBoxFromPixelBbox(roughBox, roughBbox, roughSize, roughSize, roughPad, log);
    }
    await yieldToMain();

    // 8. PASS 2/2: Final render with refined camera box
    await emitProgress(60, 'Pass 2/2: Rasterizing high-resolution image');

    // Clamp work buffer to 4096px max to avoid 20,480x20,480 memory blowup
    const MAX_WORK_SIZE = 4096;
    const targetW = settings.width;
    const targetH = settings.height;
    let workW = targetW;
    let workH = targetH;
    if (targetW < MAX_WORK_SIZE && settings.supersample > 1) {
      workW = Math.min(MAX_WORK_SIZE, targetW * settings.supersample);
      workH = Math.min(MAX_WORK_SIZE, targetH * settings.supersample);
    }
    const padPx = Math.round(Math.min(workW, workH) * padFrac);

    await emitLog('Rasterizer', `Pass 2/2: Rasterizing at ${workW}x${workH} with refined camera box (Exact Numba CPU loop)...`);

    const { verts2d: finalV2d, depths: finalDepths } = project(
      renderV,
      workW,
      workH,
      padPx,
      refinedBox,
      settings.viewAxes
    );

    const highResRgba = await drawBatchesSoftware(
      finalV2d,
      allUvs,
      batches,
      finalDepths,
      workW,
      workH,
      settings.alphaCutoff,
      settings.textureFilter,
      onProgress
    );

    // 9. Downsample from supersample work buffer to final output resolution (if supersampled)
    let finalRgba: Uint8Array;
    if (workW !== settings.width || workH !== settings.height) {
      await emitProgress(90, 'Downsampling to final resolution');
      await emitLog('Rasterizer', `Downsampling ${workW}x${workH} -> ${settings.width}x${settings.height}...`);
      finalRgba = await downsampleImage(highResRgba, workW, workH, settings.width, settings.height, onProgress);
    } else {
      finalRgba = highResRgba;
    }

    let outputRgba = finalRgba;
    let outputWidth = settings.width;
    let outputHeight = settings.height;

    // Apply trim based on transparent pixels (Requirement #2: magick -trim +repage)
    if (trimTransparentOption) {
      const trimmed = trimTransparent(finalRgba, settings.width, settings.height);
      outputRgba = trimmed.trimmedRgba;
      outputWidth = trimmed.width;
      outputHeight = trimmed.height;
      await emitLog(
        'Rasterizer',
        `Trimmed transparent borders: ${settings.width}x${settings.height} -> ${outputWidth}x${outputHeight} (ImageMagick -trim)`,
        undefined,
        'info'
      );
    }

    const renderTimeMs = performance.now() - startTime;
    await emitProgress(100, 'Render complete');
    await emitLog(
      'Done',
      `Render finished in ${(renderTimeMs / 1000).toFixed(2)}s (${outputWidth}x${outputHeight} PNG ready)`,
      undefined,
      'success'
    );

    return {
      rgba: outputRgba,
      width: outputWidth,
      height: outputHeight,
      renderTimeMs,
      isGif: false,
      isAnimated: false,
    };
  }
}

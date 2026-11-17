import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Header } from './components/Header';
import { ControlsPanel } from './components/ControlsPanel';
import { CanvasViewport } from './components/CanvasViewport';
import { LogConsole } from './components/LogConsole';
import { ServantSidebar } from './components/ServantSidebar';
import { RenderPipeline } from './engine/pipeline';
import { ClipInfo, LogEntry, RenderHistoryItem, RenderSettings, SelectionOptions } from './engine/types';

export const App: React.FC = () => {
  const [npId, setNpId] = useState<string>('');
  const [selectedClip, setSelectedClip] = useState<string>('');
  const [availableClips, setAvailableClips] = useState<string[]>([]);
  const [availableRoots, setAvailableRoots] = useState<string[]>(['model']);

  const [currentClipInfo, setCurrentClipInfo] = useState<ClipInfo | null>(null);
  const [gifStartFrame, setGifStartFrame] = useState<number>(0);
  const [gifEndFrame, setGifEndFrame] = useState<number>(0);
  const [animFormat, setAnimFormat] = useState<'apng' | 'gif'>('apng');
  const [isGifResult, setIsGifResult] = useState<boolean>(false);

  // Settings with hardcoded padFrac: 0.05 (Requirement #1) and yawDeg: 0 (Requirement #7)
  const [settings, setSettings] = useState<RenderSettings>({
    width: 1024,
    height: 1024,
    supersample: 5,
    textureFilter: 'bilinear',
    focusMode: 'alpha_bbox',
    padFrac: 0.05,
    alphaCutoff: 64,
    yawDeg: 0,
    mirror: true,
    viewAxes: 'zy',
    invertDepth: false,
    gifCenter: 'body',
    targetFrame: 0,
    targetTime: null,
    animFormat: 'apng',
  });

  const [selection, setSelection] = useState<SelectionOptions>({
    roots: ['model'],
  });

  const [trimTransparent, setTrimTransparent] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [stageName, setStageName] = useState<string>('');
  const [renderTimeMs, setRenderTimeMs] = useState<number | null>(null);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [renderHistory, setRenderHistory] = useState<RenderHistoryItem[]>([]);
  const [renderedDims, setRenderedDims] = useState<{ width: number; height: number }>({ width: 1024, height: 1024 });
  const [finalImageDataUrl, setFinalImageDataUrl] = useState<string | null>(null);
  const [fastPreviewDataUrl, setFastPreviewDataUrl] = useState<string | null>(null);
  const [hasBundle, setHasBundle] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);

  const pipelineRef = useRef<RenderPipeline>(new RenderPipeline());
  const hasInitializedRef = useRef<boolean>(false);

  const addLog = useCallback(
    (
      category: LogEntry['category'],
      message: string,
      detail?: string,
      level: LogEntry['level'] = 'info',
      historyId?: string,
      thumbnailUrl?: string
    ) => {
      const now = new Date();
      const timeStr = `${now.toTimeString().split(' ')[0]}.${String(now.getMilliseconds()).padStart(3, '0')}`;
      setLogs((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          timestamp: timeStr,
          category,
          message,
          detail,
          level,
          historyId,
          thumbnailUrl,
        },
      ]);
    },
    []
  );

  const processLoadedBundle = useCallback(
    (bundle: any) => {
      setHasBundle(true);
      const clips: string[] = bundle.clips.map((c: any) => c.name);

      // Sort clips alphabetically, with treasureArms clips always at the top (Requirement #4)
      clips.sort((a, b) => {
        const aIsTreasure = a.toLowerCase().includes('treasurearms');
        const bIsTreasure = b.toLowerCase().includes('treasurearms');
        if (aIsTreasure && !bIsTreasure) return -1;
        if (!aIsTreasure && bIsTreasure) return 1;
        return a.localeCompare(b);
      });

      setAvailableClips(clips);

      if (clips.length > 0) {
        setSelectedClip(clips[0]);
      }

      const roots = Array.from(bundle.rootCounts.keys()) as string[];
      setAvailableRoots(roots);
      if (roots.includes('model')) {
        setSelection((s) => ({ ...s, roots: ['model'] }));
      } else if (roots.length > 0) {
        setSelection((s) => ({ ...s, roots: [roots[0]] }));
      }
    },
    []
  );

  // Whenever selectedClip changes, bundle loads, or selection/root changes, update clipInfo and gif frames
  useEffect(() => {
    if (!hasBundle || !selectedClip) return;
    const bundle = pipelineRef.current.getLoadedBundle();
    const chosenEntries = bundle ? pipelineRef.current.chooseEntries(bundle.entries, selection) : undefined;
    const info = pipelineRef.current.getClipInfo(selectedClip, chosenEntries);
    setCurrentClipInfo(info);
    if (info && info.hasAnimation && info.totalFrames > 0) {
      setGifStartFrame(0);
      setGifEndFrame(info.totalFrames);
    } else {
      setGifStartFrame(0);
      setGifEndFrame(0);
    }
  }, [hasBundle, selectedClip, selection]);

  const loadNpAssetById = async (targetId: string) => {
    if (!targetId) return;
    setNpId(targetId);
    setIsLoading(true);
    setProgressPercent(10);
    setStageName('Downloading from CDN');
    addLog('Network', `Requesting NP asset: ${targetId}...`);

    try {
      const bytes = await pipelineRef.current.fetchBundle(
        targetId,
        addLog,
        (received, total) => {
          if (total > 0) {
            setProgressPercent(Math.min(90, Math.round((received / total) * 90)));
          }
        }
      );

      setProgressPercent(95);
      setStageName('Parsing UnityFS Bundle');
      const bundle = await pipelineRef.current.loadBundle(bytes, addLog);
      processLoadedBundle(bundle);
      addLog('Done', `Asset ${targetId} ready for rendering!`, undefined, 'success');
    } catch (err: any) {
      addLog('Error', `Download or parse failed: ${err.message}`, undefined, 'error');
    } finally {
      setIsLoading(false);
      setProgressPercent(0);
      setStageName('');
    }
  };

  const handleDownloadAndLoad = async () => {
    await loadNpAssetById(npId);
  };

  const handleLoadLocalFile = async (file: File) => {
    setIsLoading(true);
    addLog('Bundle', `Reading local file "${file.name}" (${(file.size / (1024 * 1024)).toFixed(2)} MB)...`);
    try {
      const buf = await file.arrayBuffer();
      const bundle = await pipelineRef.current.loadBundle(buf, addLog);
      processLoadedBundle(bundle);
      addLog('Done', `Local bundle "${file.name}" parsed successfully!`, undefined, 'success');
    } catch (err: any) {
      addLog('Error', `Failed to parse local file: ${err.message}`, undefined, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRender = async (isFastPreviewOnly: boolean = false) => {
    if (!hasBundle) {
      addLog('Error', 'Cannot render: no asset bundle loaded', undefined, 'error');
      return;
    }

    setIsRendering(true);
    setProgressPercent(5);
    setStageName(isFastPreviewOnly ? 'Rendering 256px Fast Preview' : 'Rendering Image');

    try {
      const effectiveSettings: RenderSettings = isFastPreviewOnly
        ? {
            ...settings,
            width: 256,
            height: 256,
            supersample: 1,
            textureFilter: 'nearest',
            padFrac: 0.05,
            yawDeg: 0,
            gifStartFrame: gifStartFrame,
            gifEndFrame: gifStartFrame, // Single frame for fast preview
            animFormat,
          }
        : {
            ...settings,
            padFrac: 0.05,
            yawDeg: 0,
            gifStartFrame: currentClipInfo?.hasAnimation ? gifStartFrame : undefined,
            gifEndFrame: currentClipInfo?.hasAnimation ? gifEndFrame : undefined,
            animFormat,
          };

      const result = await pipelineRef.current.render(
        effectiveSettings,
        selection,
        selectedClip,
        {
          onLog: addLog,
          onProgress: (pct, stage) => {
            setProgressPercent(pct);
            setStageName(stage);
          },
          onPreview: (previewCanvas) => {
            const previewUrl = previewCanvas.toDataURL('image/png');
            setFastPreviewDataUrl(previewUrl);
          },
        },
        trimTransparent
      );

      setRenderTimeMs(result.renderTimeMs);

      let url = '';
      if (result.isAnimated && result.dataUrl) {
        url = result.dataUrl;
        setIsGifResult(result.animFormat === 'gif');
      } else {
        const canvas = document.createElement('canvas');
        canvas.width = result.width;
        canvas.height = result.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const imgData = ctx.createImageData(result.width, result.height);
          imgData.data.set(result.rgba);
          ctx.putImageData(imgData, 0, 0);
          url = canvas.toDataURL('image/png');
        }
        setIsGifResult(false);
      }

      if (isFastPreviewOnly) {
        setFastPreviewDataUrl(url);
        addLog('Preview', `256px Fast Preview updated in preview card: ${npId} (${selectedClip})`);
      } else {
        setFinalImageDataUrl(url);
        setRenderedDims({ width: result.width, height: result.height });
        const histId = `hist-${Date.now()}`;
        const item: RenderHistoryItem = {
          id: histId,
          timestamp: new Date().toLocaleTimeString(),
          npId,
          clip: selectedClip,
          width: result.width,
          height: result.height,
          dataUrl: url,
          isFastPreview: false,
          renderTimeMs: result.renderTimeMs,
          isGif: result.animFormat === 'gif',
          isAnimated: result.isAnimated,
          animFormat: result.animFormat,
          frameCount: result.frameCount,
        };
        setRenderHistory((prev) => [item, ...prev]);
        const typeLabel = result.isAnimated
          ? (result.animFormat === 'gif' ? `GIF (${result.frameCount}f)` : `APNG (${result.frameCount}f, 32-bit lossless)`)
          : 'Still PNG';
        addLog(
          'Preview',
          `Rendered ${typeLabel} ${result.width}x${result.height} for ${npId} (${selectedClip}) in ${(result.renderTimeMs / 1000).toFixed(2)}s`,
          undefined,
          'success',
          histId,
          url
        );
      }
    } catch (err: any) {
      addLog('Error', `Render failed: ${err.message}`, undefined, 'error');
    } finally {
      setIsRendering(false);
      setProgressPercent(0);
      setStageName('');
    }
  };

  const handleSelectHistoryItem = (item: RenderHistoryItem) => {
    setFinalImageDataUrl(item.dataUrl);
    setRenderedDims({ width: item.width, height: item.height });
    setRenderTimeMs(item.renderTimeMs);
    addLog(
      'Preview',
      `Restored previously rendered ${item.width}x${item.height} image for ${item.npId} (${item.clip})`,
      undefined,
      'info'
    );
  };

  const handleSavePng = () => {
    if (!finalImageDataUrl) return;
    const a = document.createElement('a');
    a.href = finalImageDataUrl;
    const isAnimated = currentClipInfo?.hasAnimation && gifEndFrame > gifStartFrame;
    if (isGifResult) {
      a.download = `fgo_${npId}_${selectedClip}_f${gifStartFrame}-${gifEndFrame}.gif`;
    } else if (isAnimated) {
      a.download = `fgo_${npId}_${selectedClip}_apng_f${gifStartFrame}-${gifEndFrame}.png`;
    } else {
      a.download = `fgo_${npId}_${selectedClip}_${settings.width}x${settings.height}.png`;
    }
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    const savedType = isGifResult ? 'GIF' : isAnimated ? 'APNG' : 'PNG';
    addLog('Done', `Saved ${savedType}: ${a.download}`, undefined, 'success');
  };

  // Initialization log (runs once on mount, guarded against React StrictMode double-fire)
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    addLog(
      'Discovery',
      'FGO NP Renderer initialized. Select a servant from the sidebar or enter an NP ID to begin.'
    );
  }, [addLog]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0c0a0d] text-gray-200">
      {/* Top Header */}
      <Header
        npId={npId}
        setNpId={setNpId}
        isLoading={isLoading}
        isRendering={isRendering}
        progressPercent={progressPercent}
        stageName={stageName}
        hasBundle={hasBundle}
        hasRenderedImage={!!finalImageDataUrl}
        isGif={isGifResult}
        isGifRange={Boolean(currentClipInfo?.hasAnimation && gifEndFrame > gifStartFrame)}
        frameCount={gifEndFrame - gifStartFrame + 1}
        animFormat={animFormat}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((v) => !v)}
        onDownloadAndLoad={handleDownloadAndLoad}
        onLoadLocalFile={handleLoadLocalFile}
        onRender={handleRender}
        onSavePng={handleSavePng}
      />

      {/* Main Workspace Body: Servants on Left, Viewport & Logs in Middle, Parameters on Right */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Servants & Entities Sidebar */}
        <ServantSidebar
          currentNpId={npId}
          onSelectNpId={(id) => setNpId(id)}
          isLoading={isLoading}
          isRendering={isRendering}
          isOpen={isSidebarOpen}
        />

        {/* Center Content: Canvas Viewport + Bottom Log Console */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <CanvasViewport
            finalImageDataUrl={finalImageDataUrl}
            isRendering={isRendering}
            renderTimeMs={renderTimeMs}
            width={renderedDims.width}
            height={renderedDims.height}
            npId={npId}
            onDownload={handleDownloadAndLoad}
          />

          <LogConsole
            logs={logs}
            renderHistory={renderHistory}
            onSelectHistoryItem={handleSelectHistoryItem}
            onClear={() => setLogs([])}
            isRendering={isRendering}
          />
        </div>

        {/* Right Parameter Controls Sidebar (Requirement #2) */}
        <ControlsPanel
          settings={settings}
          setSettings={setSettings}
          selection={selection}
          setSelection={setSelection}
          availableClips={availableClips}
          selectedClip={selectedClip}
          setSelectedClip={setSelectedClip}
          availableRoots={availableRoots}
          clipInfo={currentClipInfo}
          gifStartFrame={gifStartFrame}
          setGifStartFrame={setGifStartFrame}
          gifEndFrame={gifEndFrame}
          setGifEndFrame={setGifEndFrame}
          fastPreviewDataUrl={fastPreviewDataUrl}
          onRenderFastPreview={() => handleRender(true)}
          onOpenPreviewInMain={(url) => setFinalImageDataUrl(url)}
          trimTransparent={trimTransparent}
          setTrimTransparent={setTrimTransparent}
          animFormat={animFormat}
          setAnimFormat={setAnimFormat}
          isRendering={isRendering}
          disabled={isLoading || isRendering}
        />
      </div>
    </div>
  );
};

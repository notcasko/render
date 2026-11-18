import React from 'react';
import {
  ClipInfo,
  RenderSettings,
  SelectionOptions,
  TextureFilter,
  FocusMode,
  ViewAxes,
  BoneBranchInfo,
} from '../engine/types';
import { Sliders, Eye, Box, Layers, Sparkles, RefreshCw, ZoomIn, Crop, Film, Users } from 'lucide-react';

interface ControlsPanelProps {
  settings: RenderSettings;
  setSettings: React.Dispatch<React.SetStateAction<RenderSettings>>;
  selection: SelectionOptions;
  setSelection: React.Dispatch<React.SetStateAction<SelectionOptions>>;
  availableClips: string[];
  selectedClip: string;
  setSelectedClip: (clip: string) => void;
  availableRoots: string[];
  boneBranches?: BoneBranchInfo[];
  hasBundle?: boolean;
  clipInfo: ClipInfo | null;
  gifStartFrame: number;
  setGifStartFrame: (val: number) => void;
  gifEndFrame: number;
  setGifEndFrame: (val: number) => void;
  fastPreviewDataUrl: string | null;
  onRenderFastPreview: () => void;
  onOpenPreviewInMain: (url: string) => void;
  trimTransparent: boolean;
  setTrimTransparent: (val: boolean) => void;
  animFormat: 'apng' | 'gif';
  setAnimFormat: (val: 'apng' | 'gif') => void;
  isRendering: boolean;
  disabled?: boolean;
}

export const ControlsPanel: React.FC<ControlsPanelProps> = ({
  settings,
  setSettings,
  selection,
  setSelection,
  availableClips,
  selectedClip,
  setSelectedClip,
  availableRoots,
  boneBranches,
  hasBundle,
  clipInfo,
  gifStartFrame,
  setGifStartFrame,
  gifEndFrame,
  setGifEndFrame,
  fastPreviewDataUrl,
  onRenderFastPreview,
  onOpenPreviewInMain,
  trimTransparent,
  setTrimTransparent,
  animFormat,
  setAnimFormat,
  isRendering,
  disabled,
}) => {
  const toggleExcludeBone = (tag: string) => {
    setSelection((prev) => {
      const current = prev.excludeBones || [];
      const exists = current.includes(tag);
      const next = exists ? current.filter((t) => t !== tag) : [...current, tag];
      const inc = (prev.includeBones || []).filter((t) => t !== tag);
      return { ...prev, excludeBones: next, includeBones: inc };
    });
  };

  const toggleIncludeBone = (tag: string) => {
    setSelection((prev) => {
      const current = prev.includeBones || [];
      const exists = current.includes(tag);
      const next = exists ? current.filter((t) => t !== tag) : [tag];
      const exc = (prev.excludeBones || []).filter((t) => t !== tag);
      return { ...prev, includeBones: next, excludeBones: exc };
    });
  };
  const sizePresets = [
    { label: '1024px', size: 1024 },
    { label: '2048px', size: 2048 },
    { label: '4096px', size: 4096 },
  ];

  return (
    <aside className="w-80 bg-[#120e14] border-l border-[#2d1f32] flex flex-col h-full overflow-y-auto text-xs text-gray-300 select-none custom-scrollbar shrink-0">
      {/* Sidebar Header */}
      <div className="p-3.5 border-b border-[#2d1f32] flex items-center justify-between bg-[#17111a]">
        <div className="flex items-center gap-2 font-semibold text-gray-200">
          <Sliders className="w-3.5 h-3.5 text-rose-400" />
          <span>Render Parameters</span>
        </div>
        <div className="text-[10px] font-mono text-rose-400/90 bg-rose-950/50 border border-rose-800/40 px-1.5 py-0.5 rounded">
          Pad: 0.05
        </div>
      </div>

      <div className="p-3.5 space-y-4">
        {/* SEPARATE 256px FAST PREVIEW WINDOW (Requirement #4 & #5) */}
        <div className="p-2.5 rounded-lg bg-[#18121b] border border-[#3b2440] shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-rose-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-rose-400" />
              Fast Preview (256px)
            </span>
            <button
              onClick={onRenderFastPreview}
              disabled={disabled || isRendering}
              className="text-[10px] flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950 hover:bg-rose-900 border border-rose-800/60 text-rose-300 font-mono transition-colors disabled:opacity-40"
              title="Render 256px fast preview"
            >
              <RefreshCw className={`w-3 h-3 ${isRendering ? 'animate-spin' : ''}`} />
              Update
            </button>
          </div>

          <div
            className="w-full h-48 rounded border border-[#2d1f32] bg-[#0c090e] flex items-center justify-center relative overflow-hidden group cursor-pointer"
            onClick={() => {
              if (fastPreviewDataUrl) onOpenPreviewInMain(fastPreviewDataUrl);
            }}
            title={fastPreviewDataUrl ? 'Click to inspect in main viewport' : 'No preview yet'}
          >
            {/* Checkerboard background */}
            <div
              className="absolute inset-0 opacity-20 pointer-events-none"
              style={{
                backgroundImage:
                  'linear-gradient(45deg, #26172a 25%, transparent 25%), linear-gradient(-45deg, #26172a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #26172a 75%), linear-gradient(-45deg, transparent 75%, #26172a 75%)',
                backgroundSize: '16px 16px',
                backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
              }}
            />

            {fastPreviewDataUrl ? (
              <>
                <img
                  src={fastPreviewDataUrl}
                  alt="256px Fast Preview"
                  className="w-full h-full object-contain relative z-10"
                  style={{ imageRendering: 'pixelated' }}
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity z-20 flex items-center justify-center gap-1.5 text-[11px] text-white font-medium">
                  <ZoomIn className="w-3.5 h-3.5 text-rose-400" />
                  View Full
                </div>
              </>
            ) : (
              <span className="text-[11px] text-gray-500 font-mono text-center p-2">
                256px preview will appear here
              </span>
            )}

            <span className="absolute bottom-1 right-1.5 text-[9px] font-mono text-gray-400 bg-black/60 px-1 rounded z-20">
              256x256
            </span>
          </div>
        </div>

        {/* GROUP 1: Asset & Clip Selection */}
        <div className="space-y-2.5">
          <label className="text-[11px] font-semibold tracking-wider text-gray-400 uppercase flex items-center gap-1.5">
            <Layers className="w-3 h-3 text-rose-400" />
            Asset & Animation
          </label>

          {/* Animation Clip dropdown */}
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-gray-400">Clip:</span>
              <span className="font-mono text-rose-300 font-medium">{selectedClip}</span>
            </div>
            <select
              value={selectedClip}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedClip(val);
                if (val.toLowerCase().endsWith('_xy') || val.toLowerCase().includes('cutin')) {
                  setSettings((s) => ({ ...s, viewAxes: 'xy' }));
                }
              }}
              disabled={disabled}
              className="w-full bg-[#18121b] border border-[#35233b] rounded px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:border-rose-500 font-mono"
            >
              {availableClips.length > 0 ? (
                availableClips.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))
              ) : (
                <option value="">No clip available</option>
              )}
            </select>
          </div>

          {/* Roots selection */}
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-gray-400">Roots:</span>
              <span className="font-mono text-rose-300">
                {selection.roots.join(', ') || 'model'}
              </span>
            </div>
            <select
              value={selection.roots[0] || 'model'}
              onChange={(e) => {
                const val = e.target.value;
                setSelection((prev) => ({ ...prev, roots: [val] }));
                if (val.toLowerCase().includes('cutin')) {
                  setSettings((s) => ({ ...s, viewAxes: 'xy' }));
                } else if (val === 'model' || val === 'chr') {
                  setSettings((s) => ({ ...s, viewAxes: 'zy' }));
                }
              }}
              disabled={disabled}
              className="w-full bg-[#18121b] border border-[#35233b] rounded px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:border-rose-500 font-mono"
            >
              {availableRoots.length > 0 ? (
                availableRoots.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))
              ) : (
                <>
                  <option value="model">model (Default)</option>
                  <option value="chr">chr</option>
                  <option value="all">all</option>
                </>
              )}
            </select>
          </div>

          {/* Dual-Point Animation Frame Range Slider (only if clip has animated frames) */}
          {clipInfo?.hasAnimation && clipInfo.totalFrames > 0 && (
            <div className="space-y-2 pt-2 border-t border-[#26172a]">
              {/* Animation Format selection */}
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-gray-400 font-medium flex items-center gap-1.5">
                  <Film className="w-3 h-3 text-rose-400" />
                  Format:
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setAnimFormat('apng')}
                    disabled={disabled}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                      animFormat === 'apng'
                        ? 'bg-rose-950/90 border border-rose-500 text-rose-200 font-semibold shadow-sm'
                        : 'bg-[#18121b] border border-[#35233b] text-gray-400 hover:text-gray-200'
                    }`}
                    title="Animated PNG: Truecolor 32-bit RGBA lossless, no color cutting"
                  >
                    APNG (32-bit)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnimFormat('gif')}
                    disabled={disabled}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                      animFormat === 'gif'
                        ? 'bg-rose-950/90 border border-rose-500 text-rose-200 font-semibold shadow-sm'
                        : 'bg-[#18121b] border border-[#35233b] text-gray-400 hover:text-gray-200'
                    }`}
                    title="GIF: 256-color indexed palette"
                  >
                    GIF (8-bit)
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <span className="text-gray-400 font-medium">
                  {animFormat === 'apng' ? 'APNG Frames:' : 'GIF Frames:'}
                </span>
                <span className="font-mono text-xs">
                  {gifStartFrame === gifEndFrame ? (
                    <span className="text-amber-300 font-semibold">Frame {gifStartFrame} (Single)</span>
                  ) : (
                    <span className="text-rose-300">
                      {gifStartFrame} – {gifEndFrame}{' '}
                      <span className="text-gray-500 text-[10px]">
                        ({gifEndFrame - gifStartFrame + 1}f, {((gifEndFrame - gifStartFrame + 1) / (clipInfo.sampleRate || 30)).toFixed(2)}s)
                      </span>
                    </span>
                  )}
                </span>
              </div>

              {/* Range Track with two handles */}
              <div className="relative h-6 flex items-center select-none">
                <div className="absolute w-full h-2 bg-[#120c15] border border-[#35233b] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-red-600 to-rose-500 rounded-full"
                    style={{
                      left: `${(gifStartFrame / clipInfo.totalFrames) * 100}%`,
                      width: `${Math.max(0, (gifEndFrame - gifStartFrame) / clipInfo.totalFrames) * 100}%`,
                      position: 'absolute',
                    }}
                  />
                </div>

                {/* Start handle */}
                <input
                  type="range"
                  min={0}
                  max={clipInfo.totalFrames}
                  value={gifStartFrame}
                  disabled={disabled}
                  onChange={(e) => {
                    const val = Math.min(Number(e.target.value), gifEndFrame);
                    setGifStartFrame(val);
                  }}
                  className="absolute w-full h-2 appearance-none bg-transparent pointer-events-none z-20
                    [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-rose-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md
                    [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-rose-500 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:shadow-md"
                  title={`GIF Start Frame: ${gifStartFrame}`}
                />

                {/* End handle */}
                <input
                  type="range"
                  min={0}
                  max={clipInfo.totalFrames}
                  value={gifEndFrame}
                  disabled={disabled}
                  onChange={(e) => {
                    const val = Math.max(Number(e.target.value), gifStartFrame);
                    setGifEndFrame(val);
                  }}
                  className="absolute w-full h-2 appearance-none bg-transparent pointer-events-none z-20
                    [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-rose-400 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md
                    [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-rose-400 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:shadow-md"
                  title={`GIF End Frame: ${gifEndFrame}`}
                />
              </div>

              {/* Inputs and Quick Presets */}
              <div className="flex items-center justify-between text-[11px] pt-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-500">Start:</span>
                  <input
                    type="number"
                    min={0}
                    max={gifEndFrame}
                    value={gifStartFrame}
                    disabled={disabled}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(Number(e.target.value) || 0, gifEndFrame));
                      setGifStartFrame(val);
                    }}
                    className="w-12 bg-[#18121b] border border-[#35233b] rounded px-1.5 py-0.5 text-[11px] text-right font-mono text-rose-300 outline-none focus:border-rose-500"
                  />
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setGifStartFrame(0);
                      setGifEndFrame(clipInfo.totalFrames);
                    }}
                    className="px-2 py-0.5 rounded text-[10px] font-medium border border-[#35233b] bg-[#18121b] text-gray-300 hover:text-rose-300 hover:border-rose-400/50 transition-colors"
                    title="Reset to full animation range"
                  >
                    All
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-500">End:</span>
                  <input
                    type="number"
                    min={gifStartFrame}
                    max={clipInfo.totalFrames}
                    value={gifEndFrame}
                    disabled={disabled}
                    onChange={(e) => {
                      const val = Math.min(clipInfo.totalFrames, Math.max(Number(e.target.value) || 0, gifStartFrame));
                      setGifEndFrame(val);
                    }}
                    className="w-12 bg-[#18121b] border border-[#35233b] rounded px-1.5 py-0.5 text-[11px] text-right font-mono text-rose-300 outline-none focus:border-rose-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SUB-ENTITIES / BONE FILTERS (only visible when a multi-branch bundle is loaded) */}
        {hasBundle && boneBranches && boneBranches.length > 1 && (
          <>
            <hr className="border-[#2d1f32]" />
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold tracking-wider text-gray-400 uppercase flex items-center gap-1.5">
                  <Users className="w-3 h-3 text-rose-400" />
                  Sub-Entities / Bones
                </label>
                {(selection.includeBones?.length || selection.excludeBones?.length) ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSelection((s) => ({ ...s, includeBones: [], excludeBones: [] }));
                    }}
                    className="text-[10px] text-rose-400 hover:text-rose-300 underline cursor-pointer"
                  >
                    Reset Filters
                  </button>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                {boneBranches.map((branch) => {
                  const isExcluded = selection.excludeBones?.includes(branch.tag);
                  const isIncluded = selection.includeBones?.includes(branch.tag);

                  return (
                    <div
                      key={branch.name}
                      className={`flex items-center justify-between p-2 rounded border text-xs transition-colors ${
                        isExcluded
                          ? 'border-red-900/60 bg-red-950/30 text-red-300'
                          : isIncluded
                          ? 'border-emerald-800/70 bg-emerald-950/40 text-emerald-300'
                          : 'border-[#35233b] bg-[#18121b] text-gray-300'
                      }`}
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <span
                          className={`font-mono text-xs font-medium truncate ${
                            isExcluded ? 'line-through opacity-70' : ''
                          }`}
                          title={branch.name}
                        >
                          {branch.label || branch.name}
                        </span>
                        <span className="text-[10px] text-gray-500">
                          {branch.count} bones
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleExcludeBone(branch.tag)}
                          disabled={disabled}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                            isExcluded
                              ? 'bg-red-800 hover:bg-red-700 text-white border border-red-600'
                              : 'bg-[#25172b] hover:bg-[#382142] text-gray-300 hover:text-red-300 border border-[#3b2344]'
                          }`}
                          title={`Exclude/Hide ${branch.label || branch.tag}`}
                        >
                          {isExcluded ? 'Hidden' : 'Hide'}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleIncludeBone(branch.tag)}
                          disabled={disabled}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                            isIncluded
                              ? 'bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-500'
                              : 'bg-[#25172b] hover:bg-[#382142] text-gray-300 hover:text-emerald-300 border border-[#3b2344]'
                          }`}
                          title={`Render only ${branch.label || branch.tag}`}
                        >
                          {isIncluded ? 'Only' : 'Solo'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <hr className="border-[#2d1f32]" />

        {/* GROUP 2: Dimensions & Supersampling */}
        <div className="space-y-2.5">
          <label className="text-[11px] font-semibold tracking-wider text-gray-400 uppercase flex items-center gap-1.5">
            <Box className="w-3 h-3 text-rose-400" />
            Dimensions & Sampling
          </label>

          {/* Size Preset Buttons */}
          <div>
            <div className="flex justify-between text-[11px] mb-1.5">
              <span className="text-gray-400">Output Resolution:</span>
              <span className="font-mono text-rose-300 font-semibold">{settings.width}x{settings.height}</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {sizePresets.map((p) => {
                const isActive = settings.width === p.size && settings.height === p.size;
                return (
                  <button
                    key={p.size}
                    type="button"
                    onClick={() =>
                      setSettings((s) => ({ ...s, width: p.size, height: p.size }))
                    }
                    disabled={disabled}
                    className={`py-1.5 px-1 rounded text-center text-[11px] font-mono border transition-all ${
                      isActive
                        ? 'border-rose-500 bg-rose-950/60 text-rose-300 font-semibold shadow-sm'
                        : 'border-[#35233b] bg-[#18121b] hover:bg-[#221626] text-gray-400'
                    }`}
                  >
                    {p.size}px
                  </button>
                );
              })}
            </div>
          </div>

          {/* Supersample multiplier */}
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-gray-400">Supersample:</span>
              <span className="font-mono text-rose-400 font-semibold">{settings.supersample}x</span>
            </div>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 5].map((ss) => (
                <button
                  key={ss}
                  type="button"
                  onClick={() => setSettings((s) => ({ ...s, supersample: ss }))}
                  disabled={disabled}
                  className={`flex-1 py-1 rounded text-center text-xs font-mono border transition-colors ${
                    settings.supersample === ss
                      ? 'border-rose-500 bg-rose-950/60 text-rose-300 font-medium'
                      : 'border-[#35233b] bg-[#18121b] text-gray-400'
                  }`}
                >
                  {ss}x
                </button>
              ))}
            </div>
          </div>

          {/* Focus Mode */}
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-gray-400">Focus Mode:</span>
              <span className="font-mono text-rose-300">{settings.focusMode}</span>
            </div>
            <select
              value={settings.focusMode}
              onChange={(e) =>
                setSettings((s) => ({ ...s, focusMode: e.target.value as FocusMode }))
              }
              disabled={disabled}
              className="w-full bg-[#18121b] border border-[#35233b] rounded px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:border-rose-500 font-mono"
            >
              <option value="alpha_bbox">alpha_bbox (Default)</option>
              <option value="largest_component">largest_component</option>
            </select>
          </div>

          {/* Trim Transparent Switch (Requirement #2: magick -trim +repage) */}
          <div className="flex items-center justify-between p-2 rounded bg-[#18121b] border border-[#2d1f32]">
            <div>
              <div className="text-gray-200 font-medium flex items-center gap-1.5">
                <Crop className="w-3.5 h-3.5 text-rose-400" />
                Trim Transparent
              </div>
              <div className="text-[10px] text-gray-500 font-mono">magick -trim +repage</div>
            </div>
            <button
              type="button"
              onClick={() => setTrimTransparent(!trimTransparent)}
              disabled={disabled}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                trimTransparent ? 'bg-rose-600' : 'bg-gray-700'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  trimTransparent ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        <hr className="border-[#2d1f32]" />

        {/* GROUP 3: Shading, Camera & Geometry */}
        <div className="space-y-2.5">
          <label className="text-[11px] font-semibold tracking-wider text-gray-400 uppercase flex items-center gap-1.5">
            <Eye className="w-3 h-3 text-rose-400" />
            Shading & Camera
          </label>

          {/* Mirror toggle */}
          <div className="flex items-center justify-between p-2 rounded bg-[#18121b] border border-[#2d1f32]">
            <div>
              <div className="text-gray-200 font-medium">Mirror View</div>
              <div className="text-[10px] text-gray-500">Horizontal left-right flip</div>
            </div>
            <button
              type="button"
              onClick={() => setSettings((s) => ({ ...s, mirror: !s.mirror }))}
              disabled={disabled}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                settings.mirror ? 'bg-rose-600' : 'bg-gray-700'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  settings.mirror ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Texture Filter */}
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-gray-400">Texture Filter:</span>
              <span className="font-mono text-rose-300">{settings.textureFilter}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {(['bilinear', 'nearest'] as TextureFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setSettings((s) => ({ ...s, textureFilter: f }))}
                  disabled={disabled}
                  className={`py-1.5 rounded text-center text-xs font-mono border transition-colors ${
                    settings.textureFilter === f
                      ? 'border-rose-500 bg-rose-950/60 text-rose-300 font-medium'
                      : 'border-[#35233b] bg-[#18121b] text-gray-400'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Alpha Cutoff */}
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-gray-400">Alpha Cutoff:</span>
              <span className="font-mono text-rose-400 font-semibold">{settings.alphaCutoff}</span>
            </div>
            <input
              type="range"
              min="0"
              max="255"
              step="1"
              value={settings.alphaCutoff}
              onChange={(e) =>
                setSettings((s) => ({ ...s, alphaCutoff: parseInt(e.target.value) }))
              }
              disabled={disabled}
              className="w-full accent-rose-500 cursor-pointer"
            />
          </div>

          {/* View Axes */}
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-gray-400">View Axes:</span>
              <span className="font-mono text-rose-300">{settings.viewAxes}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {(['zy', 'xy'] as ViewAxes[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setSettings((s) => ({ ...s, viewAxes: a }))}
                  disabled={disabled}
                  className={`py-1.5 rounded text-center text-xs font-mono border transition-colors ${
                    settings.viewAxes === a
                      ? 'border-rose-500 bg-rose-950/60 text-rose-300 font-medium'
                      : 'border-[#35233b] bg-[#18121b] text-gray-400'
                  }`}
                >
                  {a} {a === 'zy' ? '(Standard)' : '(Flat/Cutin)'}
                </button>
              ))}
            </div>
          </div>

          {/* Invert Depth (-Z / +Z) */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] text-gray-400 block">Invert Depth (-Z / +Z):</span>
              <span className="text-[10px] text-gray-500 font-mono">
                {settings.invertDepth ? 'Inverted (+Z foreground)' : 'Standard (-Z foreground)'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSettings((s) => ({ ...s, invertDepth: !s.invertDepth }))}
              disabled={disabled}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                settings.invertDepth ? 'bg-rose-600' : 'bg-gray-700'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  settings.invertDepth ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};

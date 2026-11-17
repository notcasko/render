import React, { useRef } from 'react';
import { Download, Upload, Play, Image as ImageIcon, Save, RefreshCw, PanelLeft } from 'lucide-react';

interface HeaderProps {
  npId: string;
  setNpId: (id: string) => void;
  isLoading: boolean;
  isRendering: boolean;
  progressPercent: number;
  stageName: string;
  hasBundle: boolean;
  hasRenderedImage: boolean;
  isGif?: boolean;
  isGifRange?: boolean;
  frameCount?: number;
  animFormat?: 'apng' | 'gif';
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onDownloadAndLoad: () => void;
  onLoadLocalFile: (file: File) => void;
  onRender: (isFastPreviewOnly?: boolean) => void;
  onSavePng: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  npId,
  setNpId,
  isLoading,
  isRendering,
  progressPercent,
  stageName,
  hasBundle,
  hasRenderedImage,
  isGif,
  isGifRange,
  frameCount,
  animFormat = 'apng',
  isSidebarOpen,
  onToggleSidebar,
  onDownloadAndLoad,
  onLoadLocalFile,
  onRender,
  onSavePng,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <header className="h-12 bg-[#120e14] border-b border-[#251829] px-4 flex items-center justify-between select-none relative z-50">
      {/* Left: Sidebar toggle & simple app name */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className={`p-1.5 rounded transition-colors ${
            isSidebarOpen
              ? 'bg-[#221427] text-rose-300 border border-[#382040]'
              : 'hover:bg-[#1c1220] text-gray-400 hover:text-gray-200 border border-transparent'
          }`}
          title={isSidebarOpen ? 'Hide servants sidebar' : 'Show servants sidebar'}
        >
          <PanelLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2">
          <img
            src={`${import.meta.env.BASE_URL}salute-64.png`}
            alt="Salute Icon"
            className="w-5 h-5 rounded object-cover shadow-sm"
          />
          <span className="text-xs font-semibold tracking-wider uppercase text-gray-300 font-mono">
            FGO NP Renderer
          </span>
        </div>
      </div>

      {/* Center: ID entry and loader */}
      <div className="flex items-center gap-2">
        <div className="flex items-center bg-[#0a070c] border border-[#2d1b32] rounded px-2.5 py-1 gap-2 focus-within:border-rose-500 transition-colors">
          <span className="text-[11px] text-gray-500 font-mono">NP ID:</span>
          <input
            type="text"
            value={npId}
            onChange={(e) => setNpId(e.target.value.trim())}
            placeholder="e.g. 406100"
            className="w-24 bg-transparent text-xs text-gray-100 outline-none font-mono"
            disabled={isLoading || isRendering}
          />
          <button
            onClick={onDownloadAndLoad}
            disabled={isLoading || isRendering || !npId}
            className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-rose-700 hover:bg-rose-600 disabled:opacity-40 text-white text-xs font-medium transition-colors"
            title="Download directly from AtlasAcademy CDN"
          >
            {isLoading ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <Download className="w-3 h-3" />
            )}
            <span>{isLoading ? 'Fetching...' : 'Download'}</span>
          </button>
        </div>

        {/* Local File Fallback */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onLoadLocalFile(f);
          }}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading || isRendering}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#1a111e] hover:bg-[#231728] border border-[#2d1b33] text-gray-300 text-xs font-medium transition-colors"
          title="Load local decrypted bundle file"
        >
          <Upload className="w-3.5 h-3.5 text-gray-400" />
          <span className="hidden sm:inline">Local File</span>
        </button>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onRender(true)}
          disabled={!hasBundle || isLoading || isRendering}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#1a111e] hover:bg-[#231728] border border-[#2d1b33] text-rose-300 text-xs font-medium transition-colors disabled:opacity-40"
          title="Instant 256px fast-preview"
        >
          <ImageIcon className="w-3.5 h-3.5 text-rose-400" />
          <span>Fast Preview</span>
        </button>

        <button
          onClick={() => onRender(false)}
          disabled={!hasBundle || isLoading || isRendering}
          className="flex items-center gap-1.5 px-3 py-1 rounded bg-rose-700 hover:bg-rose-600 text-white text-xs font-medium transition-colors disabled:opacity-40 shadow-sm"
          title={
            isGifRange
              ? animFormat === 'gif'
                ? `Render ${frameCount} frames as animated GIF`
                : `Render ${frameCount} frames as Animated PNG (32-bit lossless)`
              : 'Render still image'
          }
        >
          {isRendering ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3 h-3 fill-current" />
          )}
          <span>
            {isRendering
              ? 'Rendering...'
              : isGifRange
              ? `Render ${animFormat === 'gif' ? 'GIF' : 'APNG'} (${frameCount}f)`
              : 'Render'}
          </span>
        </button>

        <button
          onClick={onSavePng}
          disabled={!hasRenderedImage}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#1a111e] hover:bg-[#231728] border border-[#2d1b33] text-emerald-400 text-xs font-medium transition-colors disabled:opacity-30"
          title={
            isGif
              ? 'Export animated GIF to disk'
              : isGifRange
              ? 'Export Animated PNG to disk'
              : 'Export PNG to disk'
          }
        >
          <Save className="w-3.5 h-3.5" />
          <span>{isGif ? 'Save GIF' : isGifRange ? 'Save APNG' : 'Save PNG'}</span>
        </button>
      </div>

      {/* Progress Line */}
      {(isLoading || isRendering) && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#120e14] z-50">
          <div
            className="h-full bg-rose-500 transition-all duration-300"
            style={{ width: `${Math.max(5, progressPercent)}%` }}
          />
        </div>
      )}
    </header>
  );
};

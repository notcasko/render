import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Minimize2, Image as ImageIcon } from 'lucide-react';

interface CanvasViewportProps {
  finalImageDataUrl: string | null;
  isRendering: boolean;
  renderTimeMs: number | null;
  width: number;
  height: number;
  npId?: string;
  onDownload?: () => void;
}

export const CanvasViewport: React.FC<CanvasViewportProps> = ({
  finalImageDataUrl,
  width,
  height,
  npId,
  onDownload,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isFitMode, setIsFitMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const calculateFitScale = useCallback(() => {
    if (!containerRef.current) return 1.0;
    const { clientWidth, clientHeight } = containerRef.current;
    const pad = 64; // padding around image
    const fitW = (clientWidth - pad) / (width || 1024);
    const fitH = (clientHeight - pad) / (height || 1024);
    return Math.min(fitW, fitH, 1.0);
  }, [width, height]);

  // When a new final image arrives, fit to screen initially
  useEffect(() => {
    if (finalImageDataUrl) {
      const fit = calculateFitScale();
      setScale(fit);
      setPan({ x: 0, y: 0 });
      setIsFitMode(true);
    }
  }, [finalImageDataUrl, calculateFitScale]);

  // Global window listeners for drag & drop so it never gets stuck (Requirement #3)
  useEffect(() => {
    let rafId: number | null = null;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      // If left button is not being pressed, immediately stop dragging!
      if ((e.buttons & 1) === 0) {
        setIsDragging(false);
        return;
      }
      const newX = e.clientX - dragStartRef.current.x;
      const newY = e.clientY - dragStartRef.current.y;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setPan({ x: newX, y: newY });
        setIsFitMode(false);
      });
    };

    const handleGlobalMouseUp = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging]);

  const toggleResetView = () => {
    if (isFitMode || Math.abs(scale - 1.0) > 0.05) {
      // Switch to 100% actual pixels
      setScale(1.0);
      setPan({ x: 0, y: 0 });
      setIsFitMode(false);
    } else {
      // Switch to Fit to screen
      const fit = calculateFitScale();
      setScale(fit);
      setPan({ x: 0, y: 0 });
      setIsFitMode(true);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!finalImageDataUrl) return;
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseEnter = (e: React.MouseEvent) => {
    // If returning into container without mouse down, stop dragging immediately
    if ((e.buttons & 1) === 0 && isDragging) {
      setIsDragging(false);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!finalImageDataUrl) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setScale((prev) => Math.min(Math.max(prev * factor, 0.05), 10.0));
    setIsFitMode(false);
  };

  return (
    <div
      ref={containerRef}
      className="relative flex-1 bg-[#0a080c] overflow-hidden flex items-center justify-center select-none"
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      onWheel={handleWheel}
      style={{ cursor: finalImageDataUrl ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
    >
      {/* Background Checkerboard for Transparency */}
      <div className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(#2d1f32_1px,transparent_1px)] [background-size:16px_16px]" />

      {/* Main Render View */}
      {finalImageDataUrl ? (
        <div
          className="relative flex items-center justify-center shadow-2xl"
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})`,
            willChange: 'transform',
          }}
        >
          {/* Transparency checker pattern behind image */}
          <div
            className="rounded overflow-hidden shadow-2xl border border-[#3b2440]/70"
            style={{
              backgroundImage:
                'linear-gradient(45deg, #18121b 25%, transparent 25%), linear-gradient(-45deg, #18121b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #18121b 75%), linear-gradient(-45deg, transparent 75%, #18121b 75%)',
              backgroundSize: '20px 20px',
              backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
            }}
          >
            <img
              src={finalImageDataUrl}
              alt="FGO Render Result"
              style={{
                width: `${width}px`,
                height: `${height}px`,
                imageRendering: scale > 1.2 ? 'pixelated' : 'auto',
              }}
              className="block pointer-events-none max-w-none"
            />
          </div>
        </div>
      ) : (
        <div className="text-center p-8 text-gray-500 max-w-md select-none">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#140f16] border border-[#2d1f32] flex items-center justify-center text-rose-400">
            <ImageIcon className="w-8 h-8 opacity-60" />
          </div>
          <h3 className="text-sm font-semibold text-gray-300 mb-1">Canvas Ready</h3>
          <p className="text-xs text-gray-500 mb-4">
            {npId ? (
              <>
                Click{' '}
                <button
                  type="button"
                  onClick={onDownload}
                  className="text-rose-400 hover:text-rose-300 underline font-medium cursor-pointer transition-colors"
                  title={`Download asset ${npId}`}
                >
                  Download
                </button>{' '}
                to fetch bundle {npId}, then click <span className="text-rose-400 font-medium">Render</span> to generate the image.
              </>
            ) : (
              <>
                Select a servant from the sidebar or enter an NP ID to begin.
              </>
            )}
          </p>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-[#140f16] border border-[#2d1f32] text-[11px] text-gray-400 font-mono">
            Default: 1024x1024 • Supersample 5x • Alpha Cutoff 64 • Pad 0.05
          </div>
        </div>
      )}

      {/* Note: Top-left corner floating status box has been completely removed (Requirement #5) */}

      {/* Zoom / Viewport Controls with Reset Toggle (Requirement #6) */}
      <div className="absolute bottom-4 right-4 z-30 flex items-center bg-[#140f16]/95 backdrop-blur border border-[#3b2440] rounded-md overflow-hidden shadow-lg">
        <button
          onClick={() => {
            setScale((s) => Math.min(s * 1.25, 10.0));
            setIsFitMode(false);
          }}
          className="p-1.5 hover:bg-[#221626] text-gray-300 border-r border-[#3b2440] transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            setScale((s) => Math.max(s * 0.8, 0.05));
            setIsFitMode(false);
          }}
          className="p-1.5 hover:bg-[#221626] text-gray-300 border-r border-[#3b2440] transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        {/* Reset View Button: Toggle between 100% and Fit to Screen (Requirement #6) */}
        <button
          onClick={toggleResetView}
          className="flex items-center gap-1 p-1.5 hover:bg-[#221626] text-rose-300 text-[11px] font-mono px-2.5 transition-colors"
          title="Toggle between 100% and Fit to Screen"
        >
          {isFitMode ? (
            <>
              <Maximize2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Fit ({Math.round(scale * 100)}%)</span>
            </>
          ) : (
            <>
              <Minimize2 className="w-3.5 h-3.5 text-rose-400" />
              <span>100%</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

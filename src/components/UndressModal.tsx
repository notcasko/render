import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Scissors, X, Eye, EyeOff, Search, RotateCcw, Play, Check } from 'lucide-react';
import { TextureIsland } from '../engine/textureIslands';

interface UndressModalProps {
  isOpen: boolean;
  onClose: () => void;
  islands: TextureIsland[];
  excludedIslandIds: string[];
  onApplyAndRender: (newExcludedIds: string[]) => void;
  isRendering?: boolean;
}

export const UndressModal: React.FC<UndressModalProps> = ({
  isOpen,
  onClose,
  islands,
  excludedIslandIds,
  onApplyAndRender,
  isRendering = false,
}) => {
  const [tempExcluded, setTempExcluded] = useState<Set<string>>(new Set(excludedIslandIds));
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'all' | 'visible' | 'hidden'>('all');
  const modalContentRef = useRef<HTMLDivElement>(null);

  // Sync temp state whenever modal is opened
  useEffect(() => {
    if (isOpen) {
      setTempExcluded(new Set(excludedIslandIds));
      setSearchQuery('');
      setFilterMode('all');
    }
  }, [isOpen, excludedIslandIds]);

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const toggleIsland = (id: string) => {
    setTempExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const showAll = () => {
    setTempExcluded(new Set());
  };

  const hideAllFiltered = () => {
    setTempExcluded((prev) => {
      const next = new Set(prev);
      for (const isl of filteredIslands) {
        next.add(isl.id);
      }
      return next;
    });
  };

  const invertSelection = () => {
    setTempExcluded((prev) => {
      const next = new Set<string>();
      for (const isl of islands) {
        if (!prev.has(isl.id)) {
          next.add(isl.id);
        }
      }
      return next;
    });
  };

  const filteredIslands = useMemo(() => {
    let list = islands;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (isl) =>
          isl.internalName.toLowerCase().includes(q) ||
          isl.rawBoneName.toLowerCase().includes(q) ||
          isl.textureName.toLowerCase().includes(q)
      );
    }
    if (filterMode === 'hidden') {
      list = list.filter((isl) => tempExcluded.has(isl.id));
    } else if (filterMode === 'visible') {
      list = list.filter((isl) => !tempExcluded.has(isl.id));
    }
    return list;
  }, [islands, searchQuery, filterMode, tempExcluded]);

  if (!isOpen) return null;

  const totalHidden = tempExcluded.size;
  const totalVisible = islands.length - totalHidden;

  const handleRender = () => {
    onApplyAndRender(Array.from(tempExcluded));
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 select-none animate-in fade-in duration-150"
      onClick={(e) => {
        // Close if backdrop clicked
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={modalContentRef}
        className="w-full max-w-5xl bg-[#120d15] border border-[#3b2440] rounded-xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-gray-200"
      >
        {/* Header */}
        <div className="px-4 py-3 bg-[#18111c] border-b border-[#2d1b32] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-rose-950/80 border border-rose-700/60 text-rose-300">
              <Scissors className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-100 font-mono tracking-wide">
                  Undress / Texture Parts
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-medium bg-[#231528] border border-[#3d2245] text-gray-300">
                  {islands.length} parts
                </span>
                {totalHidden > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold bg-red-950 border border-red-700 text-red-200">
                    {totalHidden} cut / hidden
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-400">
                Click any texture sprite to toggle visibility. Cuts dresses, shields, weapons, glasses or foreground occluders.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-[#251829] transition-colors"
            title="Close without rendering"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar: Search, Filters, Quick Actions */}
        <div className="p-3 bg-[#150e18] border-b border-[#26152a] flex flex-wrap items-center justify-between gap-2.5 text-xs">
          {/* Left: Search input */}
          <div className="flex items-center bg-[#0d0910] border border-[#301c35] rounded px-2.5 py-1 gap-2 focus-within:border-rose-500 w-64 transition-colors">
            <Search className="w-3.5 h-3.5 text-gray-500 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by name (dress, hair, umbrella)..."
              className="w-full bg-transparent text-xs text-gray-200 outline-none placeholder:text-gray-600 font-mono"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-gray-500 hover:text-gray-300">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Center: Filter tabs */}
          <div className="flex items-center gap-1 bg-[#0f0a13] p-0.5 rounded border border-[#2b1930] text-[11px]">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-0.5 rounded transition-colors ${
                filterMode === 'all'
                  ? 'bg-rose-950 text-rose-200 font-semibold border border-rose-800/60'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              All ({islands.length})
            </button>
            <button
              onClick={() => setFilterMode('visible')}
              className={`px-2.5 py-0.5 rounded transition-colors ${
                filterMode === 'visible'
                  ? 'bg-emerald-950 text-emerald-200 font-semibold border border-emerald-800/60'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Visible ({totalVisible})
            </button>
            <button
              onClick={() => setFilterMode('hidden')}
              className={`px-2.5 py-0.5 rounded transition-colors ${
                filterMode === 'hidden'
                  ? 'bg-red-950 text-red-200 font-semibold border border-red-800/60'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Cut ({totalHidden})
            </button>
          </div>

          {/* Right: Quick actions */}
          <div className="flex items-center gap-1.5 text-[11px]">
            <button
              onClick={showAll}
              disabled={totalHidden === 0}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#1c1220] hover:bg-[#28182d] border border-[#382140] text-gray-300 disabled:opacity-40 transition-colors"
              title="Unhide all parts (Restore full model)"
            >
              <RotateCcw className="w-3 h-3 text-rose-400" />
              <span>Reset (Show All)</span>
            </button>
            <button
              onClick={invertSelection}
              className="px-2.5 py-1 rounded bg-[#1c1220] hover:bg-[#28182d] border border-[#382140] text-gray-300 transition-colors"
              title="Invert hidden / visible selection"
            >
              Invert
            </button>
            <button
              onClick={hideAllFiltered}
              className="px-2.5 py-1 rounded bg-red-950/60 hover:bg-red-900/80 border border-red-800/60 text-red-200 transition-colors"
              title="Hide all currently filtered items"
            >
              Hide Filtered
            </button>
          </div>
        </div>

        {/* Content: Compact Grid of Texture Islands */}
        <div className="flex-1 overflow-y-auto p-3 max-h-[60vh] custom-scrollbar bg-[#0f0b12]">
          {filteredIslands.length === 0 ? (
            <div className="py-12 text-center text-gray-500 font-mono text-xs">
              No texture parts matched the current filter.
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
              {filteredIslands.map((island) => {
                const isExcluded = tempExcluded.has(island.id);

                return (
                  <div
                    key={island.id}
                    onClick={() => toggleIsland(island.id)}
                    className={`group relative flex flex-col items-center rounded-lg border p-1.5 transition-all cursor-pointer text-center select-none ${
                      isExcluded
                        ? 'border-red-600/80 bg-red-950/30 text-red-300 shadow-sm'
                        : 'border-[#331f38] bg-[#17101b] hover:border-rose-500/70 hover:bg-[#231527] text-gray-200'
                    }`}
                    title={`${island.internalName}\nBone: ${island.rawBoneName}\nTriangles: ${island.triCount}\nTexture: ${island.textureName}\nBox: (${island.box.x0}, ${island.box.y0}) to (${island.box.x1}, ${island.box.y1})`}
                  >
                    {/* Status Badge */}
                    <div
                      className={`absolute top-1 right-1 z-10 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                        isExcluded
                          ? 'bg-red-700 text-white shadow-sm'
                          : 'bg-emerald-800/90 text-white opacity-0 group-hover:opacity-100 transition-opacity'
                      }`}
                    >
                      {isExcluded ? <X className="w-2.5 h-2.5" /> : <Check className="w-2.5 h-2.5" />}
                    </div>

                    {/* Thumbnail Container with checkered background for alpha */}
                    <div className="w-full h-14 rounded overflow-hidden flex items-center justify-center relative bg-[#1c1421] border border-[#2b1930] mb-1">
                      {/* Checkered pattern background */}
                      <div
                        className="absolute inset-0 opacity-20 pointer-events-none"
                        style={{
                          backgroundImage:
                            'repeating-conic-gradient(#555 0% 25%, transparent 0% 50%)',
                          backgroundSize: '10px 10px',
                        }}
                      />

                      {island.thumbnailUrl ? (
                        <img
                          src={island.thumbnailUrl}
                          alt={island.internalName}
                          className={`max-h-full max-w-full object-contain relative z-1 transition-opacity ${
                            isExcluded ? 'opacity-30 grayscale' : 'opacity-100'
                          }`}
                        />
                      ) : (
                        <span className="text-[9px] text-gray-600 font-mono">No preview</span>
                      )}

                      {/* Red cross-out overlay when excluded */}
                      {isExcluded && (
                        <div className="absolute inset-0 flex items-center justify-center z-10 bg-red-950/40 pointer-events-none">
                          <EyeOff className="w-5 h-5 text-red-400 drop-shadow" />
                        </div>
                      )}
                    </div>

                    {/* Label & Details */}
                    <div className="w-full">
                      <div
                        className={`text-[10px] font-mono font-medium truncate w-full ${
                          isExcluded ? 'line-through text-red-400' : 'text-gray-200'
                        }`}
                      >
                        {island.internalName}
                      </div>
                      <div className="text-[9px] text-gray-500 font-mono">
                        {island.triCount} tris
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-[#18111c] border-t border-[#2d1b32] flex items-center justify-between">
          <div className="text-[11px] text-gray-400 font-mono">
            {totalHidden > 0 ? (
              <span className="text-amber-300">
                {totalHidden} part{totalHidden > 1 ? 's' : ''} cut out. Press Render to apply.
              </span>
            ) : (
              <span>All parts visible.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isRendering}
              className="px-3.5 py-1.5 rounded bg-[#1e1323] hover:bg-[#2b1932] border border-[#3b2344] text-gray-300 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleRender}
              disabled={isRendering}
              className="flex items-center gap-1.5 px-5 py-1.5 rounded bg-gradient-to-r from-rose-700 to-pink-600 hover:from-rose-600 hover:to-pink-500 text-white text-xs font-semibold shadow-md transition-all disabled:opacity-50 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>{isRendering ? 'Rendering...' : 'Render'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

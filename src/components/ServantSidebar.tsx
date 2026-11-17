import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, X, ChevronDown, ChevronRight, RefreshCw, User, ArrowUpDown } from 'lucide-react';

export interface ServantCostume {
  id: number;
  costumeCollectionNo: number;
  battleCharaId: number;
  shortName: string;
}

export interface ServantItem {
  id: number;
  collectionNo: number;
  name: string;
  originalName?: string;
  className: string;
  rarity: number;
  face: string;
  costume?: Record<string, ServantCostume>;
}

export interface ServantNpOption {
  id: number;
  label: string;
}

export function getServantNpOptions(servant: ServantItem): ServantNpOption[] {
  const optionsMap = new Map<number, string>();

  if (servant.costume && Object.keys(servant.costume).length > 0) {
    for (const [key, cost] of Object.entries(servant.costume)) {
      const bId = cost.battleCharaId || Number(key);
      if (bId) {
        let label = cost.shortName;
        if (!label) {
          label =
            cost.id === 0
              ? 'Stage 1'
              : cost.id === 1
              ? 'Stage 2'
              : cost.id === 2 || cost.id === 3
              ? 'Stage 3'
              : `Form ${cost.id}`;
        }
        optionsMap.set(bId, label);
      }
    }
  }

  // Ensure default servant id is included if missing
  if (!optionsMap.has(servant.id)) {
    optionsMap.set(servant.id, 'Default');
  }

  return Array.from(optionsMap.entries()).map(([id, label]) => ({ id, label }));
}

interface ServantSidebarProps {
  currentNpId: string;
  onSelectNpId: (id: string) => void;
  isLoading: boolean;
  isRendering: boolean;
  isOpen: boolean;
  onClose?: () => void;
}

export const ServantSidebar: React.FC<ServantSidebarProps> = ({
  currentNpId,
  onSelectNpId,
  isLoading,
  isRendering,
  isOpen,
}) => {
  const [servants, setServants] = useState<ServantItem[]>([]);
  const [isFetchingList, setIsFetchingList] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [expandedServantId, setExpandedServantId] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(35);
  const listContainerRef = useRef<HTMLDivElement>(null);

  // Fetch servant list from Atlas Academy API
  const fetchServants = async () => {
    setIsFetchingList(true);
    setFetchError(null);
    try {
      // Check cached copy in sessionStorage for instant loading
      const cached = sessionStorage.getItem('aa_basic_servant_lang_en');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setServants(parsed);
            setIsFetchingList(false);
            return;
          }
        } catch {}
      }

      const res = await fetch('https://api.atlasacademy.io/export/JP/basic_servant_lang_en.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data: ServantItem[] = await res.json();
      setServants(data);
      try {
        sessionStorage.setItem('aa_basic_servant_lang_en', JSON.stringify(data));
      } catch {}
    } catch (err: any) {
      setFetchError(err.message || 'Failed to load servant list');
    } finally {
      setIsFetchingList(false);
    }
  };

  useEffect(() => {
    fetchServants();
  }, []);

  // Filter servants by search query and class
  const filteredServants = useMemo(() => {
    let list = servants;

    if (selectedClass !== 'all') {
      list = list.filter((s) => s.className?.toLowerCase() === selectedClass.toLowerCase());
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((s) => {
        const idMatch = String(s.id).includes(q);
        const nameMatch = s.name?.toLowerCase().includes(q);
        const origMatch = s.originalName?.toLowerCase().includes(q);
        const costumeMatch = s.costume && Object.keys(s.costume).some((cId) => cId.includes(q));
        return idMatch || nameMatch || origMatch || costumeMatch;
      });
    }

    const sorted = [...list].sort((a, b) => {
      const aVal = a.collectionNo || a.id || 0;
      const bVal = b.collectionNo || b.id || 0;
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return sorted;
  }, [servants, searchQuery, selectedClass, sortOrder]);

  // Reset pagination when search query or class changes
  useEffect(() => {
    setVisibleCount(35);
    if (listContainerRef.current) {
      listContainerRef.current.scrollTop = 0;
    }
  }, [searchQuery, selectedClass]);

  // Infinite scroll trigger
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 120) {
      setVisibleCount((prev) => Math.min(prev + 30, filteredServants.length));
    }
  };

  if (!isOpen) return null;

  const classes = [
    'all',
    'saber',
    'archer',
    'lancer',
    'rider',
    'caster',
    'assassin',
    'berserker',
    'ruler',
    'avenger',
    'alterEgo',
    'moonCancer',
    'foreigner',
    'pretender',
    'beast',
  ];

  return (
    <aside className="w-72 bg-[#100c12] border-r border-[#26192b] flex flex-col h-full overflow-hidden text-xs text-gray-300 select-none shrink-0 z-20">
      {/* Sidebar Header */}
      <div
        onWheel={(e) => {
          const target = e.currentTarget.querySelector('.overflow-x-auto');
          if (target && e.deltaY !== 0) {
            target.scrollLeft += e.deltaY;
          }
        }}
        className="p-3 border-b border-[#26192b] bg-[#140f17] flex flex-col gap-2.5"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-rose-400" />
            <span className="font-semibold text-gray-200 text-xs">Servants & Entities</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#1c1320] hover:bg-[#25182a] text-gray-400 hover:text-rose-300 border border-[#2d1e34] font-mono text-[10px] transition-colors"
              title={`Sort by Collection No: ${sortOrder === 'asc' ? 'Ascending (1 → 999)' : 'Descending (999 → 1)'}`}
            >
              <ArrowUpDown className="w-3 h-3 text-rose-400" />
              <span>{sortOrder === 'asc' ? 'No. ↑' : 'No. ↓'}</span>
            </button>
            <span className="text-[10px] font-mono text-gray-400 bg-[#1c1320] px-1.5 py-0.5 rounded border border-[#2d1e34]">
              {filteredServants.length}
            </span>
            <button
              onClick={fetchServants}
              disabled={isFetchingList}
              className="p-1 rounded hover:bg-[#201524] text-gray-400 hover:text-rose-300 transition-colors"
              title="Refresh AtlasAcademy database"
            >
              <RefreshCw className={`w-3 h-3 ${isFetchingList ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Search input */}
        <div className="relative flex items-center bg-[#0c090e] border border-[#2a1d2e] rounded px-2 py-1 gap-1.5 focus-within:border-rose-500/80 transition-colors">
          <Search className="w-3.5 h-3.5 text-gray-500 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name or ID (e.g. 406100)..."
            className="w-full bg-transparent text-xs text-gray-200 outline-none placeholder:text-gray-600 font-mono"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-gray-500 hover:text-gray-300"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Class Filter pills */}
        <div
          onWheel={(e) => {
            if (e.deltaY !== 0) {
              e.currentTarget.scrollLeft += e.deltaY;
              e.preventDefault();
            }
          }}
          className="flex items-center gap-1 overflow-x-auto custom-scrollbar pb-1 text-[10px] font-mono"
        >
          {classes.map((cls) => (
            <button
              key={cls}
              onClick={() => setSelectedClass(cls)}
              className={`px-2 py-0.5 rounded capitalize shrink-0 transition-colors ${
                selectedClass === cls
                  ? 'bg-rose-950/80 text-rose-300 border border-rose-800/60 font-medium'
                  : 'bg-[#18111d] text-gray-400 border border-[#2a1c2f] hover:text-gray-200'
              }`}
            >
              {cls}
            </button>
          ))}
        </div>
      </div>

      {/* Direct Load button if query looks like a custom ID */}
      {searchQuery.trim() && /^\d+$/.test(searchQuery.trim()) && (
        <div className="p-2 bg-[#170e1c] border-b border-[#2d1b35] flex items-center justify-between text-[11px]">
          <span className="text-gray-300 font-mono">Entity ID: {searchQuery.trim()}</span>
          <button
            onClick={() => onSelectNpId(searchQuery.trim())}
            disabled={isLoading || isRendering}
            className="px-2 py-0.5 rounded bg-rose-700 hover:bg-rose-600 text-white font-mono text-[10px] transition-colors"
          >
            Load Directly
          </button>
        </div>
      )}

      {/* Servant List Area with Infinite Scrolling */}
      <div
        ref={listContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto divide-y divide-[#1e1423] custom-scrollbar"
      >
        {isFetchingList && servants.length === 0 ? (
          <div className="p-6 text-center text-gray-500 flex flex-col items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-rose-400" />
            <span>Loading servants from Atlas Academy...</span>
          </div>
        ) : fetchError && servants.length === 0 ? (
          <div className="p-4 text-center text-rose-400 space-y-2">
            <p className="text-xs">Failed to load servant database</p>
            <p className="text-[10px] text-gray-500">{fetchError}</p>
            <button
              onClick={fetchServants}
              className="px-3 py-1 rounded bg-rose-950 border border-rose-800 text-rose-300 text-xs hover:bg-rose-900"
            >
              Retry
            </button>
          </div>
        ) : filteredServants.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No servants matched "{searchQuery}"
          </div>
        ) : (
          filteredServants.slice(0, visibleCount).map((servant) => {
            const npOptions = getServantNpOptions(servant);
            const isAnyActive = npOptions.some((opt) => String(opt.id) === currentNpId);
            const isExpanded = expandedServantId === servant.id || isAnyActive;

            return (
              <div
                key={servant.id}
                className={`transition-colors ${
                  isAnyActive ? 'bg-[#1e1223]' : 'hover:bg-[#140e19]'
                }`}
              >
                {/* Main Servant Row */}
                <div
                  onClick={() => {
                    if (expandedServantId === servant.id) {
                      setExpandedServantId(null);
                    } else {
                      setExpandedServantId(servant.id);
                    }
                    // If servant has only 1 NP option, select that ID into input
                    if (npOptions.length === 1) {
                      onSelectNpId(String(npOptions[0].id));
                    }
                  }}
                  className="p-2 flex items-center gap-2.5 cursor-pointer group"
                >
                  {/* Servant Face Icon with fallback */}
                  <div className="w-9 h-9 rounded bg-[#1c1322] border border-[#2d1e34] shrink-0 overflow-hidden relative">
                    <img
                      src={servant.face || `https://static.atlasacademy.io/JP/Faces/f_${servant.id}0.png`}
                      alt={servant.name}
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://static.atlasacademy.io/JP/Faces/f_${servant.id}0.png`;
                      }}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-medium text-gray-200 truncate group-hover:text-rose-300 text-[11px]">
                        {servant.name}
                      </span>
                      {servant.rarity && (
                        <span className="text-[10px] font-mono text-amber-400 shrink-0">
                          {servant.rarity}★
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-gray-500">
                      <span className="capitalize text-gray-400">{servant.className}</span>
                      <span>•</span>
                      <span>ID: {servant.id}</span>
                      {npOptions.length > 1 && (
                        <span className="text-[9px] bg-[#291730] text-rose-300 px-1 rounded ml-auto">
                          {npOptions.length} NPs
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expand / Collapse Indicator */}
                  {npOptions.length > 1 && (
                    <div className="text-gray-500 group-hover:text-gray-300 shrink-0">
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </div>
                  )}
                </div>

                {/* Sub-list of NP files (costumes/ascensions) */}
                {isExpanded && npOptions.length > 0 && (
                  <div className="px-3 pb-2.5 pt-0.5 flex flex-wrap gap-1 bg-[#160d1b] border-t border-[#26172e]">
                    <div className="w-full text-[9px] font-mono text-gray-500 uppercase tracking-wider mb-0.5">
                      NP Asset Files:
                    </div>
                    {npOptions.map((opt) => {
                      const isCurrent = String(opt.id) === currentNpId;
                      return (
                        <button
                          key={opt.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectNpId(String(opt.id));
                          }}
                          disabled={isLoading || isRendering}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 transition-colors ${
                            isCurrent
                              ? 'bg-rose-700 text-white font-semibold shadow-sm'
                              : 'bg-[#221429] hover:bg-[#2d1b36] border border-[#372141] text-gray-300 hover:text-white'
                          }`}
                          title={`Load NP file ${opt.id} (${opt.label})`}
                        >
                          <span>{opt.id}</span>
                          <span className="text-[9px] opacity-75">({opt.label})</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};

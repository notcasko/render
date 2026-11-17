import React, { useState, useEffect, useRef } from 'react';
import { LogEntry, RenderHistoryItem } from '../engine/types';
import { Terminal, Copy, Trash2, ArrowDownCircle, ChevronUp, ChevronDown, Check, Eye } from 'lucide-react';

interface LogConsoleProps {
  logs: LogEntry[];
  renderHistory: RenderHistoryItem[];
  onSelectHistoryItem: (item: RenderHistoryItem) => void;
  onClear: () => void;
  isRendering: boolean;
}

export const LogConsole: React.FC<LogConsoleProps> = ({
  logs,
  renderHistory,
  onSelectHistoryItem,
  onClear,
  isRendering,
}) => {
  const [autoScroll, setAutoScroll] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'preview'>('all');
  const [copied, setCopied] = useState(false);
  const consoleBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll) {
      consoleBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll, filterMode]);

  const copyLogs = () => {
    const text = logs
      .map(
        (l) =>
          `[${l.timestamp}] [${l.category}] ${l.message}${l.detail ? ` (${l.detail})` : ''}`
      )
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getCategoryColor = (cat: LogEntry['category']) => {
    switch (cat) {
      case 'Preview':
        return 'text-rose-300 bg-rose-950/70 border-rose-700/60 font-semibold';
      case 'Network':
        return 'text-sky-400 bg-sky-950/50 border-sky-800/40';
      case 'Bundle':
        return 'text-purple-400 bg-purple-950/50 border-purple-800/40';
      case 'Discovery':
        return 'text-rose-400 bg-rose-950/40 border-rose-800/40';
      case 'Animation':
        return 'text-pink-400 bg-pink-950/50 border-pink-800/40';
      case 'Skinning':
      case 'Geometry':
        return 'text-amber-400 bg-amber-950/50 border-amber-800/40';
      case 'Camera':
        return 'text-yellow-400 bg-yellow-950/50 border-yellow-800/40';
      case 'Rasterizer':
        return 'text-indigo-400 bg-indigo-950/50 border-indigo-800/40';
      case 'Done':
        return 'text-emerald-400 bg-emerald-950/60 border-emerald-700/50 font-semibold';
      case 'Error':
        return 'text-rose-500 bg-rose-950/80 border-rose-700 font-semibold';
      default:
        return 'text-gray-400 bg-gray-900 border-gray-800';
    }
  };

  const filteredLogs = filterMode === 'all'
    ? logs
    : logs.filter((l) => l.category === 'Preview');

  return (
    <div
      className={`border-t border-[#2d1f32] bg-[#0c090e] flex flex-col transition-all duration-200 select-none ${
        isExpanded ? 'h-80' : 'h-48'
      }`}
    >
      {/* Console Header Bar */}
      <div className="h-9 px-3.5 bg-[#140f16] border-b border-[#2d1f32] flex items-center justify-between text-xs text-gray-300">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-rose-400" />
          <span className="font-semibold text-gray-200 text-[11px] tracking-wide">
            Execution Log
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[#1e1522] text-rose-300 border border-[#35233b]">
            {filteredLogs.length} events
          </span>
          {isRendering && (
            <span className="flex items-center gap-1 text-[10px] font-mono text-rose-400 ml-2">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
              Streaming live...
            </span>
          )}
        </div>

        {/* Console Controls */}
        <div className="flex items-center gap-2">
          {/* Category Filter: ONLY All and Preview (Requirement #10) */}
          <select
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as 'all' | 'preview')}
            className="bg-[#18121b] border border-[#35233b] rounded px-2.5 py-0.5 text-[11px] text-rose-300 outline-none font-mono focus:border-rose-500"
          >
            <option value="all">All Events</option>
            <option value="preview">Preview Logs ({renderHistory.length} saved)</option>
          </select>

          {/* Auto-scroll toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1 rounded transition-colors ${
              autoScroll ? 'text-rose-400 bg-rose-950/50' : 'text-gray-500 hover:text-gray-300'
            }`}
            title="Auto-scroll to latest log"
          >
            <ArrowDownCircle className="w-3.5 h-3.5" />
          </button>

          {/* Copy logs */}
          <button
            onClick={copyLogs}
            className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-[#1e1522] transition-colors"
            title="Copy logs to clipboard"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Clear logs */}
          <button
            onClick={onClear}
            className="p-1 rounded text-gray-400 hover:text-rose-400 hover:bg-[#1e1522] transition-colors"
            title="Clear console"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Expand/Collapse */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-[#1e1522] transition-colors"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Render History Thumbnail Strip when in Preview mode (Requirement #11) */}
      {filterMode === 'preview' && renderHistory.length > 0 && (
        <div className="bg-[#160f18] border-b border-[#2d1f32] p-2 flex items-center gap-2 overflow-x-auto custom-scrollbar">
          <span className="text-[10px] text-gray-400 font-mono uppercase tracking-wider px-1">
            History:
          </span>
          {renderHistory.map((item, idx) => (
            <button
              key={item.id}
              onClick={() => onSelectHistoryItem(item)}
              className="flex items-center gap-2 p-1 rounded bg-[#201524] hover:bg-[#2b1b30] border border-[#3b2440] hover:border-rose-500 transition-colors shrink-0 group"
              title={`Click to open ${item.width}x${item.height} render from ${item.timestamp}`}
            >
              <img
                src={item.dataUrl}
                alt="Thumbnail"
                className="w-7 h-7 object-contain rounded bg-[#0d0910] border border-[#3b2440]"
              />
              <div className="text-left leading-tight pr-1">
                <div className="text-[10px] font-mono text-gray-300 group-hover:text-rose-300 font-medium">
                  #{idx + 1}{' '}
                  {item.isAnimated
                    ? item.animFormat === 'gif'
                      ? `GIF (${item.frameCount}f)`
                      : `APNG (${item.frameCount}f)`
                    : item.isGif
                    ? `GIF (${item.frameCount}f)`
                    : `${item.width}x${item.height}`}
                </div>
                <div className="text-[9px] text-gray-500 font-mono">
                  {item.clip} ({item.timestamp})
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Console Output Area */}
      <div className="flex-1 p-2.5 overflow-y-auto font-mono text-[11px] leading-relaxed select-text space-y-0.5 custom-scrollbar">
        {filteredLogs.length === 0 ? (
          <div className="text-gray-600 italic p-2 text-center">
            {filterMode === 'preview'
              ? 'No preview renders recorded yet. Click "Fast Preview" or "Render" to generate images.'
              : 'Logs will stream here in real time as files are downloaded, unpacked, decoded, and rasterized.'}
          </div>
        ) : (
          filteredLogs.map((log) => {
            const historyItem = log.historyId
              ? renderHistory.find((h) => h.id === log.historyId)
              : null;

            return (
              <div
                key={log.id}
                className="flex items-start gap-2 hover:bg-[#160f18]/60 py-0.5 px-1 rounded transition-colors group"
              >
                <span className="text-gray-600 select-none shrink-0 text-[10px]">
                  {log.timestamp}
                </span>
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded border uppercase tracking-wider shrink-0 select-none ${getCategoryColor(
                    log.category
                  )}`}
                >
                  {log.category}
                </span>

                <span
                  className={`break-all flex-1 ${
                    log.level === 'error'
                      ? 'text-rose-400'
                      : log.level === 'warn'
                      ? 'text-amber-400'
                      : log.level === 'success'
                      ? 'text-emerald-300'
                      : 'text-gray-300'
                  }`}
                >
                  {log.message}
                  {log.detail && (
                    <span className="text-gray-500 text-[10px] ml-1.5">[{log.detail}]</span>
                  )}
                </span>

                {/* Open Image Button for Preview Logs (Requirement #11) */}
                {historyItem && (
                  <button
                    onClick={() => onSelectHistoryItem(historyItem)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-800/60 text-rose-300 text-[10px] font-mono shrink-0 transition-colors opacity-90 group-hover:opacity-100 shadow-sm"
                    title="Open this render in main viewport"
                  >
                    <Eye className="w-3 h-3 text-rose-400" />
                    <span>Open Image</span>
                  </button>
                )}
              </div>
            );
          })
        )}
        <div ref={consoleBottomRef} />
      </div>
    </div>
  );
};

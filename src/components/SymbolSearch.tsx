import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, X } from 'lucide-react';
import { api } from '@/api';
import type { SymbolInfo } from '@/types';

interface Props {
  userId: string;
  onAdded: () => void;
}

export function SymbolSearch({ userId, onAdded }: Props) {
  const [query, setQuery] = useState('');
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [filtered, setFiltered] = useState<SymbolInfo[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.getSymbols().then((res) => setSymbols(res.symbols)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setFiltered([]);
      setShowDropdown(false);
      return;
    }
    const q = query.toUpperCase().trim();
    const matches = symbols
      .filter(
        (s) =>
          s.symbol.includes(q) ||
          s.name.toUpperCase().includes(q)
      )
      .slice(0, 8);
    setFiltered(matches);
    setShowDropdown(matches.length > 0);
  }, [query, symbols]);

  const handleAdd = useCallback(
    async (symbol: string) => {
      setAdding(symbol);
      setError(null);
      try {
        await api.addSymbol(userId, symbol);
        setQuery('');
        setShowDropdown(false);
        onAdded();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add symbol');
      } finally {
        setAdding(null);
      }
    },
    [userId, onAdded]
  );

  const handleFocus = () => {
    if (blurTimeout.current) clearTimeout(blurTimeout.current);
    if (filtered.length > 0) setShowDropdown(true);
  };

  const handleBlur = () => {
    blurTimeout.current = setTimeout(() => setShowDropdown(false), 150);
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && filtered.length > 0) {
              handleAdd(filtered[0].symbol);
            }
          }}
          placeholder="Search symbol or company name…"
          className="w-full rounded-xl border border-subtle bg-white/[0.03] pl-9 pr-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-muted focus:outline-none focus:border-[var(--accent)]/50 focus:bg-white/[0.05] transition-colors"
        />
        {error && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-negative flex items-center gap-1">
            <X size={12} />
          </span>
        )}
      </div>

      {error && (
        <p className="text-xs text-negative mt-1.5 px-1">{error}</p>
      )}

      {showDropdown && (
        <div className="glass absolute z-50 w-full mt-1.5 rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
          {filtered.map((s) => (
            <button
              key={s.symbol}
              onMouseDown={(e) => {
                e.preventDefault();
                handleAdd(s.symbol);
              }}
              disabled={adding !== null}
              className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/[0.06] transition-colors text-left group disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono-num text-sm font-semibold text-[var(--text-primary)]">
                  {s.symbol}
                </span>
                <span className="text-xs text-secondary truncate max-w-[200px]">
                  {s.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted uppercase tracking-wider">
                  {s.sector}
                </span>
                <Plus
                  size={13}
                  className="text-muted group-hover:text-accent transition-colors"
                />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

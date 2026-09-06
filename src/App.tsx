import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Eye,
  EyeOff,
  Filter,
  Info,
  RefreshCw,
  TrendingUp,
  X,
} from 'lucide-react';
import { api, getUserId } from '@/api';
import { SymbolSearch } from '@/components/SymbolSearch';
import { WatchlistRow } from '@/components/WatchlistRow';
import type { WatchlistItem } from '@/types';

const POLL_INTERVAL = 2500;
const MEANINGFUL_THRESHOLD = 2.0;
type FilterMode = 'all' | 'meaningful' | 'data-quality';

export default function App() {
  const userId = useRef(getUserId());
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acking, setAcking] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [filter, setFilter] = useState<FilterMode>('all');

  const fetchWatchlist = useCallback(async () => {
    try {
      const res = await api.getWatchlist(userId.current);
      setItems(res.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load watchlist');
    } finally {
      setLoading(false);
      setLastUpdate(new Date());
    }
  }, []);

  useEffect(() => {
    fetchWatchlist();
    const interval = setInterval(fetchWatchlist, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchWatchlist]);

  const handleAck = useCallback(async (symbol: string) => {
    setAcking(symbol);
    try {
      await api.ackSymbol(userId.current, symbol);
      await fetchWatchlist();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to acknowledge');
    } finally {
      setAcking(null);
    }
  }, [fetchWatchlist]);

  const handleRemove = useCallback(async (symbol: string) => {
    setRemoving(symbol);
    try {
      await api.removeSymbol(userId.current, symbol);
      await fetchWatchlist();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove');
    } finally {
      setRemoving(null);
    }
  }, [fetchWatchlist]);

  const meaningfulCount = items.filter((item) => item.is_meaningful).length;
  const staleCount = items.filter((item) => item.is_stale).length;
  const conflictCount = items.filter((item) => item.source2_disagree).length;
  const upCount = items.filter((item) => item.pct_change >= 0).length;
  const filteredItems = useMemo(() => {
    if (filter === 'meaningful') return items.filter((item) => item.is_meaningful);
    if (filter === 'data-quality') return items.filter((item) => item.is_stale || item.source2_disagree);
    return items;
  }, [filter, items]);
  const topMover = items[0];

  return (
    <div className="relative min-h-screen text-[var(--text-primary)]">
      <div className="aurora-field" aria-hidden="true">
        <div className="aurora-blob aurora-blob--one" />
        <div className="aurora-blob aurora-blob--two" />
        <div className="aurora-blob aurora-blob--three" />
      </div>

      <header className="sticky top-0 z-40 glass border-x-0 border-t-0">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-accent ring-1 ring-[var(--accent)]/25">
              <TrendingUp size={19} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="font-display text-sm font-semibold tracking-[0.1em] text-[var(--text-primary)]">Smart Market Watch</h1>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-muted">Signal over noise</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-secondary sm:gap-5">
            <span className="hidden items-center gap-1.5 sm:flex"><span className="status-dot bg-positive" />Market simulation live</span>
            <span className="flex items-center gap-1.5 text-muted"><RefreshCw size={11} className="animate-spin" style={{ animationDuration: '3s' }} />{lastUpdate ? lastUpdate.toLocaleTimeString() : '--:--:--'}</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-9">
        {/* Bento row 1: hero + scoring explainer */}
        <section className="mb-4 grid grid-cols-12 gap-4">
          <div className="tile-in glass col-span-12 rounded-3xl p-6 sm:p-8 lg:col-span-8" style={{ animationDelay: '0ms' }}>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">Your attention queue</p>
            <h2 className="font-display max-w-xl text-3xl font-semibold leading-[1.15] tracking-tight text-[var(--text-primary)] sm:text-4xl">
              Know what changed before you scan the market.
            </h2>
            <p className="mt-4 max-w-lg text-sm leading-6 text-secondary">
              We compare each move to that symbol&apos;s normal behavior, then surface the changes most likely to deserve your attention.
            </p>
          </div>
          <div className="tile-in glass col-span-12 flex flex-col justify-between rounded-3xl p-6 lg:col-span-4" style={{ animationDelay: '60ms' }}>
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted"><Info size={13} className="text-accent" />How scoring works</span>
              </div>
              <p className="text-xs leading-5 text-secondary">A meaningful flag means the move is statistically unusual for that stock, not simply large in isolation.</p>
            </div>
            <div className="mt-5 flex items-center justify-between rounded-2xl bg-white/[0.03] px-3 py-2.5">
              <span className="flex items-center gap-1.5 text-[10px] text-muted"><span className="legend-line" />vs. personal baseline</span>
              <span className="font-mono-num text-xs text-accent">z ≥ {MEANINGFUL_THRESHOLD.toFixed(1)}</span>
            </div>
          </div>
        </section>

        {/* Bento row 2: summary tiles */}
        <section className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SummaryCard delay={120} label="Watching" value={items.length.toString()} detail="symbols in queue" icon={<Eye size={15} />} />
          <SummaryCard delay={160} label="Needs attention" value={meaningfulCount.toString()} detail="unusual moves" icon={<Activity size={15} />} tone="accent" />
          <SummaryCard delay={200} label="Market direction" value={items.length ? `${upCount}/${items.length}` : '—'} detail="symbols moving up" icon={upCount >= items.length / 2 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />} tone={upCount >= items.length / 2 ? 'positive' : 'negative'} />
          <SummaryCard delay={240} label="Data quality" value={staleCount + conflictCount > 0 ? `${staleCount + conflictCount}` : 'Clear'} detail={staleCount + conflictCount > 0 ? 'items to review' : 'all feeds healthy'} icon={<AlertTriangle size={15} />} tone={staleCount + conflictCount > 0 ? 'warning' : 'positive'} />
        </section>

        {/* Bento row 3: search */}
        <section className="tile-in glass mb-4 rounded-3xl p-4 sm:p-5" style={{ animationDelay: '280ms' }}>
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2"><Filter size={14} className="text-muted" /><span className="text-xs font-semibold uppercase tracking-[0.15em] text-secondary">Add to your watchlist</span></div>
            <span className="text-[11px] text-muted">Search 20 simulated market symbols</span>
          </div>
          <SymbolSearch userId={userId.current} onAdded={fetchWatchlist} />
        </section>

        {error && <div className="mb-4 flex items-center justify-between rounded-2xl border border-[var(--negative)]/30 bg-[var(--negative)]/10 px-4 py-3"><p className="text-sm text-negative">{error}</p><button aria-label="Dismiss error" onClick={() => setError(null)} className="text-negative/70 hover:text-negative"><X size={15} /></button></div>}

        {loading ? (
          <div className="glass flex items-center justify-center rounded-3xl py-24"><RefreshCw size={18} className="animate-spin text-muted" /><span className="ml-2 text-sm text-muted">Building your attention queue…</span></div>
        ) : items.length === 0 ? (
          <div className="glass flex flex-col items-center justify-center rounded-3xl py-24 text-center"><EyeOff size={30} className="mb-4 text-muted" /><p className="text-sm text-secondary">Your queue is empty.</p><p className="mt-1 max-w-xs text-xs leading-5 text-muted">Search for a symbol above. We&apos;ll start its checkpoint at the price you add it.</p></div>
        ) : (
          <section className="tile-in glass overflow-hidden rounded-3xl" style={{ animationDelay: '320ms' }}>
            <div className="flex flex-col gap-3 border-b border-subtle px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div><div className="flex items-center gap-3"><h3 className="text-sm font-semibold text-[var(--text-primary)]">Watchlist signals</h3><span className="rounded-full bg-white/[0.06] px-2 py-0.5 font-mono-num text-[10px] text-muted">{filteredItems.length}/{items.length}</span></div>{topMover && <p className="mt-1 text-[11px] text-muted">Top signal: <span className="font-mono-num text-secondary">{topMover.symbol}</span>{topMover.is_meaningful ? ' is outside its normal range' : ' is being monitored'}</p>}</div>
              <div className="flex items-center gap-1 rounded-xl border border-subtle bg-white/[0.03] p-1">
                <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>All</FilterButton>
                <FilterButton active={filter === 'meaningful'} onClick={() => setFilter('meaningful')} count={meaningfulCount}>Attention</FilterButton>
                <FilterButton active={filter === 'data-quality'} onClick={() => setFilter('data-quality')} count={staleCount + conflictCount}>Data quality</FilterButton>
              </div>
            </div>
            <div className="hidden items-center gap-4 border-b border-subtle px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted md:flex"><span className="flex-1">Symbol / signal</span><span className="w-24 text-right">Price</span><span className="w-24 text-right">Change</span><span className="w-20 text-right">Attention</span><span className="w-36">Data status</span><span className="w-[68px]" /></div>
            {filteredItems.length > 0 ? filteredItems.map((item) => <WatchlistRow key={item.symbol} item={item} onAck={handleAck} onRemove={handleRemove} acking={acking} removing={removing} />) : <div className="px-5 py-14 text-center text-sm text-muted">Nothing matches this view right now.</div>}
          </section>
        )}

        {items.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-[11px] text-muted"><span className="flex items-center gap-1.5"><span className="h-3 w-0.5 bg-accent" />Meaningful: z-score ≥ {MEANINGFUL_THRESHOLD.toFixed(1)}</span><span className="flex items-center gap-1.5"><Eye size={11} />Seen resets the comparison point</span><span className="flex items-center gap-1.5"><RefreshCw size={10} />Updates every {POLL_INTERVAL / 1000}s</span></div>}
      </main>
    </div>
  );
}

function SummaryCard({ label, value, detail, icon, tone = 'neutral', delay = 0 }: { label: string; value: string; detail: string; icon: ReactNode; tone?: 'neutral' | 'accent' | 'positive' | 'negative' | 'warning'; delay?: number }) {
  const toneClass = { neutral: 'text-secondary', accent: 'text-accent', positive: 'text-positive', negative: 'text-negative', warning: 'text-[var(--warning)]' }[tone];
  return (
    <div className="tile-in glass glass-hover rounded-3xl p-4 transition-colors sm:p-5" style={{ animationDelay: `${delay}ms` }}>
      <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted">{icon}{label}</div>
      <div className={`font-mono-num text-2xl font-semibold ${toneClass}`}>{value}</div>
      <div className="mt-1 text-[11px] text-muted">{detail}</div>
    </div>
  );
}

function FilterButton({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: ReactNode; count?: number }) {
  return <button onClick={onClick} className={`rounded-lg px-2.5 py-1.5 text-[11px] transition-colors ${active ? 'bg-white/[0.08] text-[var(--text-primary)]' : 'text-muted hover:text-secondary'}`}>{children}{typeof count === 'number' && count > 0 && <span className="ml-1.5 font-mono-num text-[10px] text-accent">{count}</span>}</button>;
}

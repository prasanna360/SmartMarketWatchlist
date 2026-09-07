import { Check, X, AlertTriangle, Activity, Split, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { WatchlistItem } from '@/types';
import { Sparkline } from '@/components/Sparkline';
import { getSectorColor } from '@/lib/sectorColors';

interface Props {
  item: WatchlistItem;
  onAck: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  acking: string | null;
  removing: string | null;
  sparklineValues: number[];
}

function formatPrice(price: number): string {
  return price.toFixed(2);
}

function formatPct(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${(pct * 100).toFixed(2)}%`;
}

function formatStale(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s ago`;
}

export function WatchlistRow({ item, onAck, onRemove, acking, removing, sparklineValues }: Props) {
  const pctPositive = item.pct_change >= 0;
  const isBusy = acking === item.symbol || removing === item.symbol;
  const signalReason = item.volume_spike ? 'volume spike' : item.source2_disagree ? 'source check' : 'outside baseline';
  const sectorColor = getSectorColor(item.sector);

  return (
    <div className={`group relative border-b border-subtle px-4 py-4 transition-colors last:border-b-0 hover:bg-white/[0.03] sm:px-5 ${item.is_meaningful ? 'pulse-meaningful bg-[var(--accent)]/[0.045]' : ''}`}>
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono-num text-sm font-bold tracking-wide text-[var(--text-primary)]">{item.symbol}</span>
            {item.is_meaningful && <span className="rounded bg-[var(--accent)]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-accent">Attention</span>}
            {item.volume_spike && <span title="Volume spike detected" className="flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--warning)]"><Activity size={10} />Vol</span>}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <p className="truncate text-xs text-secondary">{item.name}</p>
            <span className="sector-tag" style={{ background: sectorColor.bg, color: sectorColor.text }}>
              <span className="sector-dot" style={{ background: sectorColor.dot }} />
              {item.sector}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-[10px] text-muted sm:hidden">
            {item.is_stale ? <><AlertTriangle size={10} className="blink text-[var(--warning)]" />Delayed feed, {formatStale(item.stale_seconds)}</> : item.source2_disagree ? <><Split size={10} className="text-[var(--warning)]" />Sources disagree</> : item.is_meaningful ? `Flagged: ${signalReason}` : 'Live feed'}
          </div>
        </div>

        <div className="hidden w-16 items-center justify-center text-secondary sm:flex">
          <Sparkline values={sparklineValues} positive={pctPositive} />
        </div>

        <div className="w-[76px] text-right sm:w-24">
          <span className="font-mono-num text-sm tabular-nums text-[var(--text-primary)]">${formatPrice(item.price)}</span>
          {item.source2_disagree && item.source2_price !== null && <p title="Second source price" className="mt-1 font-mono-num text-[10px] text-[var(--warning)]">${formatPrice(item.source2_price)} alt</p>}
        </div>

        <div className="w-[76px] text-right sm:w-24">
          <span className={`flex items-center justify-end gap-0.5 font-mono-num text-sm tabular-nums ${pctPositive ? 'text-positive' : 'text-negative'}`}>{pctPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{formatPct(item.pct_change)}</span>
          <p className="mt-1 text-[10px] text-muted">since seen</p>
        </div>

        <div className="hidden w-20 text-right sm:block">
          <span className={`font-mono-num text-sm tabular-nums ${item.is_meaningful ? 'text-accent' : 'text-secondary'}`}>{item.attention_score.toFixed(2)}</span>
          <p className="mt-1 text-[10px] text-muted">z {item.z_score.toFixed(2)}</p>
        </div>

        <div className="hidden w-36 md:block">
          {item.is_stale ? <div className="flex items-center gap-1.5 text-[var(--warning)]"><AlertTriangle size={11} className="blink" /><span className="text-[11px]">Delayed, {formatStale(item.stale_seconds)}</span></div> : item.source2_disagree ? <div className="flex items-center gap-1.5 text-[var(--warning)]"><Split size={11} /><span className="text-[11px]">Sources disagree</span></div> : <span className="flex items-center gap-1.5 text-[11px] text-positive"><span className="status-dot bg-positive" />Live</span>}
        </div>

        <div className="flex w-[58px] items-center justify-end gap-0.5 sm:w-[68px] sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
          <button onClick={() => onAck(item.symbol)} disabled={isBusy} title="Mark as seen" aria-label={`Mark ${item.symbol} as seen`} className="rounded p-1.5 text-secondary transition-colors hover:bg-[var(--positive)]/10 hover:text-positive disabled:opacity-50"><Check size={14} /></button>
          <button onClick={() => onRemove(item.symbol)} disabled={isBusy} title="Remove from watchlist" aria-label={`Remove ${item.symbol}`} className="rounded p-1.5 text-secondary transition-colors hover:bg-[var(--negative)]/10 hover:text-negative disabled:opacity-50"><X size={14} /></button>
        </div>
      </div>
    </div>
  );
}

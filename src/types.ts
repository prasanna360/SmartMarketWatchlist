export interface SymbolInfo {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  volatility: number;
}

export interface WatchlistItem {
  symbol: string;
  name: string;
  price: number;
  sector: string;
  pct_change: number;
  checkpoint_price: number;
  checkpoint_at: string;
  attention_score: number;
  z_score: number;
  volatility: number;
  is_meaningful: boolean;
  is_stale: boolean;
  stale_seconds: number;
  volume_spike: boolean;
  source2_price: number | null;
  source2_disagree: boolean;
  added_at: string;
}

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

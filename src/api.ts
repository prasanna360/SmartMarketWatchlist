import type { SymbolInfo, WatchlistItem } from '@/types';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/smart-market-api`;
const HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
  apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${FUNCTION_URL}${path}`, {
    ...options,
    headers: { ...HEADERS, ...options?.headers },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(body.error || `Request failed (${response.status})`);
  }

  return response.json();
}

export const api = {
  getSymbols: () =>
    request<{ symbols: SymbolInfo[] }>('/symbols'),

  getWatchlist: (userId: string) =>
    request<{ items: WatchlistItem[] }>(`/watchlist/${userId}`),

  addSymbol: (userId: string, symbol: string) =>
    request<{ success: boolean; symbol: string }>(`/watchlist/${userId}/add`, {
      method: 'POST',
      body: JSON.stringify({ symbol }),
    }),

  removeSymbol: (userId: string, symbol: string) =>
    request<{ success: boolean; symbol: string }>(`/watchlist/${userId}/remove`, {
      method: 'POST',
      body: JSON.stringify({ symbol }),
    }),

  ackSymbol: (userId: string, symbol: string) =>
    request<{ success: boolean; symbol: string; new_checkpoint: number }>(`/watchlist/${userId}/ack`, {
      method: 'POST',
      body: JSON.stringify({ symbol }),
    }),
};

// Generate or retrieve a persistent user ID for this browser
export function getUserId(): string {
  const KEY = 'smw_user_id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = `user_${Math.random().toString(36).substring(2, 12)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}

/*
# Smart Market Watchlist - Schema

## Purpose
Stores the simulated market feed state and per-user watchlist items with
checkpoints (the price/timestamp the last time the user acknowledged a symbol).

## Tables

### market_state
Holds the current simulated state for each fictional stock symbol:
- symbol (text, primary key) — e.g. "ZEPHYR"
- name (text) — display name, e.g. "Zephyr Energy Corp."
- price (numeric) — current simulated price
- prev_price (numeric) — previous tick price (for return calc)
- base_volatility (numeric) — the symbol's inherent volatility factor
- sector (text) — sector tag for display flavor
- last_update (timestamptz) — when the price last changed
- is_stale (boolean) — whether the feed is currently frozen
- volume_spike (boolean) — whether there's an active volume spike
- source2_price (numeric, nullable) — second-source price (null if no second source)
- source2_disagree (boolean) — whether sources currently disagree
- price_history (jsonb) — array of recent prices for volatility calc
- updated_at (timestamptz) — row modification timestamp

### watchlist
Per-user watchlist items with checkpoints:
- id (uuid, primary key)
- user_id (text) — client-generated user identifier (no auth, just a session/user label)
- symbol (text) — the watched stock symbol
- checkpoint_price (numeric) — price when user last acknowledged
- checkpoint_at (timestamptz) — when user last acknowledged
- added_at (timestamptz) — when the item was added to the watchlist
- Unique constraint on (user_id, symbol) to prevent duplicates

## Security
- Single-tenant app with no auth. RLS enabled on both tables.
- market_state is readable/writable by anon+authenticated (shared simulation state).
- watchlist is readable/writable by anon+authenticated (user_id is a client-side label).
- All policies use TO anon, authenticated since there's no sign-in screen.
*/

-- ============================================================
-- market_state table
-- ============================================================
CREATE TABLE IF NOT EXISTS market_state (
  symbol text PRIMARY KEY,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  prev_price numeric NOT NULL DEFAULT 0,
  base_volatility numeric NOT NULL DEFAULT 0.01,
  sector text NOT NULL DEFAULT 'General',
  last_update timestamptz NOT NULL DEFAULT now(),
  is_stale boolean NOT NULL DEFAULT false,
  volume_spike boolean NOT NULL DEFAULT false,
  source2_price numeric,
  source2_disagree boolean NOT NULL DEFAULT false,
  price_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE market_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_market_state" ON market_state;
CREATE POLICY "anon_select_market_state" ON market_state FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_market_state" ON market_state;
CREATE POLICY "anon_insert_market_state" ON market_state FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_market_state" ON market_state;
CREATE POLICY "anon_update_market_state" ON market_state FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_market_state" ON market_state;
CREATE POLICY "anon_delete_market_state" ON market_state FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- watchlist table
-- ============================================================
CREATE TABLE IF NOT EXISTS watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  symbol text NOT NULL,
  checkpoint_price numeric NOT NULL DEFAULT 0,
  checkpoint_at timestamptz NOT NULL DEFAULT now(),
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol)
);

ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_watchlist" ON watchlist;
CREATE POLICY "anon_select_watchlist" ON watchlist FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_watchlist" ON watchlist;
CREATE POLICY "anon_insert_watchlist" ON watchlist FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_watchlist" ON watchlist;
CREATE POLICY "anon_update_watchlist" ON watchlist FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_watchlist" ON watchlist;
CREATE POLICY "anon_delete_watchlist" ON watchlist FOR DELETE
  TO anon, authenticated USING (true);

-- Index for fast user watchlist lookups
CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON watchlist(user_id);

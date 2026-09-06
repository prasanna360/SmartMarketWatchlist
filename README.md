# Smart Market Watchlist

A stock watchlist that highlights what has **meaningfully changed** since you last checked — not just what moved the most in absolute terms.

Instead of flagging "any move over X%" as important, this app compares each stock's move since your last visit against **that stock's own normal volatility**. A 1.5% move in a normally-calm pharmaceutical stock gets flagged before a 4% move in a notoriously volatile mining stock, because it's more unusual *for that specific stock*.

## Features

- **Volatility-adjusted scoring**: Each stock's move is normalized into a z-score (how many standard deviations the move is from that stock's typical behavior)
- **Per-symbol checkpoints**: "Seen" resets the checkpoint to the current price, so you only see changes since *you* last looked
- **Stale feed detection**: Frozen/delayed data feeds are surfaced, not hidden — and the score is penalized so a frozen feed can't falsely look like a big move
- **Source conflict detection**: When two data sources disagree, the conflict is shown inline
- **Volume spike detection**: Unusual volume adds to the attention score
- **Trading terminal aesthetic**: Dark background, monospace tabular numbers, hairline dividers, colored left border on flagged rows
- **Auto-refresh**: Polls the API every 2.5 seconds, no page reload needed

## Setup

```bash
npm install
npm run dev
```

That's it. No API keys, no paid services. The database and market simulation run on Supabase (already provisioned).

## How the scoring works

For each watchlist item:

1. **% change** = (current price − checkpoint price) / checkpoint price
2. **Rolling volatility** = standard deviation of recent % returns from the price history
3. **Z-score** = % change ÷ volatility — normalizes the move relative to what's normal for that specific stock
4. **Volume spike bonus**: +0.8 to the score
5. **Source disagreement bonus**: +0.6 to the score
6. **Stale penalty**: if the feed is frozen, score × 0.3 — a delayed feed can't falsely appear as a big move
7. **Meaningful flag**: if the final score ≥ 2.0 (statistically unusual at roughly the 95% confidence level)
8. **Sort**: watchlist is sorted by attention score, highest first

## Why volatility-adjusted scoring beats a flat percentage threshold

A flat threshold (e.g. "flag anything that moves >3%") treats all stocks identically, but stocks aren't identical. A 3% move in a biotech stock that regularly swings 5% per day is noise. A 3% move in a utility stock that usually moves 0.3% is a signal. The z-score approach asks "how unusual is this *for this stock*?" instead of "how big is the number?" — which surfaces genuinely surprising moves and filters out routine volatility.

## Why checkpoints are per-user-per-symbol (last seen), not per-day

Daily resets answer the wrong question. If you check your watchlist at 9:31 AM, a "since market open" checkpoint is useless — everything just moved 30 seconds worth. If you check at 3:55 PM, "since open" buries the things that moved *since you last looked* under everything that moved all day. The checkpoint should represent **the last time you saw this symbol**, so the change shown is always the change *you haven't seen yet*. That's what makes the "Seen" button meaningful — it acknowledges "I've looked at this, show me only what changes from here."

## Why the market feed is simulated and how to swap in a real one

The simulated feed generates realistic market behavior (random-walk pricing, varying volatility per symbol, volume spikes, stale feeds, and conflicting data sources) without requiring an API key. This makes the app fully functional for demonstration and development.

To swap in a real market data API:

1. The edge function (`supabase/functions/smart-market-api/index.ts`) contains a `tickMarket()` function that updates the `market_state` table. Replace the random-walk logic with calls to your real data provider (e.g. Alpha Vantage, Finnhub, IEX Cloud).
2. The `market_state` table schema already maps to what a real quote provides: price, timestamp, volume, etc. Add columns as needed.
3. The scoring logic, REST endpoints, and frontend don't need to change — they read from `market_state` and `watchlist`, which are feed-agnostic.
4. For real-time pushes, replace the polling with Supabase Realtime subscriptions on the `market_state` table.

## How stale and conflicting data is surfaced

- **Stale feeds**: If a symbol's price hasn't updated in 20+ seconds (simulated freeze), the row shows a blinking "Delayed feed, last update Xs ago" warning, and the attention score is multiplied by 0.3 so a frozen feed can't falsely look like a big move.
- **Source conflicts**: Two symbols (QUARK and NOVEX) have a "second source" price that drifts independently. When the two sources disagree by more than 0.5%, the row shows a "Sources disagree" warning with both prices visible, and the attention score gets a bonus — conflicting data deserves attention.

## How this would scale

- **Separate ingestion from reads**: The market data simulation (or real feed ingestion) should run as a separate background process writing to the database, not inline with every API request. A scheduled function or worker would tick the market on a fixed interval regardless of incoming requests.
- **Push instead of poll**: Replace the 2.5-second polling with WebSocket subscriptions (Supabase Realtime) so clients receive updates instantly when prices change, rather than on the next poll cycle.
- **Precompute scores incrementally**: Instead of computing z-scores from scratch on every request, maintain a rolling volatility calculation that updates with each tick. Store the current attention score on the watchlist row and update it when the price changes, so reads are a simple `SELECT ... ORDER BY attention_score DESC`.
- **Connection pooling**: As users grow, the database connection pool becomes the bottleneck. Supabase's PgBouncer handles this, but for very high scale, a read replica for the watchlist queries would keep write throughput on the primary.
- **Caching**: Symbol lists and current quotes are shared across all users — cache them at the edge function level with short TTLs to reduce database load.

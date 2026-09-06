import { createClient } from "npm:@supabase/supabase-js@2.57.4";

// ============================================================
// CORS
// ============================================================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ============================================================
// Supabase client
// ============================================================
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================
// Market simulation
// ============================================================

interface MarketRow {
  symbol: string;
  name: string;
  price: number;
  prev_price: number;
  base_volatility: number;
  sector: string;
  last_update: string;
  is_stale: boolean;
  volume_spike: boolean;
  source2_price: number | null;
  source2_disagree: boolean;
  price_history: number[];
}

// Persistent simulation metadata stored alongside market_state rows.
// We use a separate table for sim control flags to keep schema clean.
const STALE_MIN_DURATION_S = 20;
const STALE_MAX_DURATION_S = 45;
const HISTORY_LENGTH = 60;
const SOURCE2_SYMBOLS = ["QUARK", "NOVEX", "COBALT"];

// Deterministic PRNG so multi-instance ticks don't diverge chaotically
// (seeded by symbol + time bucket)
function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function gaussianRandom(rng: () => number): number {
  // Box-Muller transform
  const u1 = Math.max(rng(), 1e-10);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Advance the market simulation. Called on every API request.
 * Uses elapsed real time since last_update to determine how many ticks
 * to simulate, so the market "moves" between requests even if the
 * function isn't continuously running.
 */
async function tickMarket(): Promise<void> {
  const { data: rows, error } = await supabase
    .from("market_state")
    .select("*");

  if (error || !rows) return;

  const now = Date.now();
  const updates: any[] = [];

  for (const row of rows as MarketRow[]) {
    const lastUpdate = new Date(row.last_update).getTime();
    const elapsedS = (now - lastUpdate) / 1000;

    // Simulate ~1 tick per 1.5 seconds of elapsed time
    const tickCount = Math.max(0, Math.min(20, Math.floor(elapsedS / 1.5)));

    if (tickCount === 0) continue;

    // Seed based on symbol + current time bucket for determinism within a tick window
    const timeBucket = Math.floor(now / 1500);
    const seed = (row.symbol.charCodeAt(0) * 1000 + timeBucket) % 2147483647;
    const rng = seededRandom(seed);

    let price = row.price;
    let isStale = row.is_stale;
    let volumeSpike = row.volume_spike;
    let source2Price = row.source2_price;
    let source2Disagree = row.source2_disagree;
    const history = [...(row.price_history || [])];

    for (let t = 0; t < tickCount; t++) {
      // Check if we should start/end a stale period
      if (!isStale && rng() < 0.003) {
        isStale = true;
      }
      if (isStale) {
        // Don't advance price while stale, but check if stale period should end
        const staleDuration = STALE_MIN_DURATION_S + rng() * (STALE_MAX_DURATION_S - STALE_MIN_DURATION_S);
        if (elapsedS > staleDuration) {
          isStale = false;
        } else {
          break; // price frozen — stop ticking
        }
      }

      if (isStale) break;

      // Random walk
      const vol = row.base_volatility;
      const shock = gaussianRandom(rng) * vol;
      price = price * (1 + shock);
      if (price < 1) price = 1; // floor

      // Volume spike: random chance, lasts a few ticks
      if (!volumeSpike && rng() < 0.004) {
        volumeSpike = true;
      } else if (volumeSpike && rng() < 0.3) {
        volumeSpike = false;
      }

      // Second source drift
      if (SOURCE2_SYMBOLS.includes(row.symbol)) {
        if (source2Price === null) source2Price = price;
        const s2Shock = gaussianRandom(rng) * vol * 1.3;
        source2Price = source2Price * (1 + s2Shock);
        if (source2Price < 1) source2Price = 1;

        // Disagreement if difference > 0.5% of price
        const diff = Math.abs(source2Price - price) / price;
        source2Disagree = diff > 0.005;
      }

      // Track history
      history.push(Math.round(price * 100) / 100);
      if (history.length > HISTORY_LENGTH) history.shift();
    }

    updates.push({
      symbol: row.symbol,
      prev_price: row.price,
      price: Math.round(price * 100) / 100,
      is_stale: isStale,
      volume_spike: volumeSpike,
      source2_price: source2Price !== null ? Math.round(source2Price * 100) / 100 : null,
      source2_disagree: source2Disagree,
      price_history: history,
      last_update: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
    });
  }

  // Batch update
  for (const u of updates) {
    await supabase
      .from("market_state")
      .update({
        prev_price: u.prev_price,
        price: u.price,
        is_stale: u.is_stale,
        volume_spike: u.volume_spike,
        source2_price: u.source2_price,
        source2_disagree: u.source2_disagree,
        price_history: u.price_history,
        last_update: u.last_update,
        updated_at: u.updated_at,
      })
      .eq("symbol", u.symbol);
  }
}

// ============================================================
// Scoring logic
// ============================================================

interface QuoteData {
  symbol: string;
  name: string;
  price: number;
  sector: string;
  is_stale: boolean;
  volume_spike: boolean;
  source2_price: number | null;
  source2_disagree: boolean;
  price_history: number[];
  last_update: string;
}

interface ScoredItem {
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

/**
 * Calculate rolling volatility from recent price history.
 * Returns the standard deviation of percent returns.
 */
function calculateVolatility(history: number[]): number {
  if (!history || history.length < 5) return 0.01; // default if not enough data

  // Compute percent returns
  const returns: number[] = [];
  for (let i = 1; i < history.length; i++) {
    if (history[i - 1] !== 0) {
      returns.push((history[i] - history[i - 1]) / history[i - 1]);
    }
  }

  if (returns.length === 0) return 0.01;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  // Floor at a small minimum to avoid div-by-zero
  return Math.max(stdDev, 0.0005);
}

/**
 * Compute attention score for a watchlist item.
 *
 * 1. % change = (current - checkpoint) / checkpoint
 * 2. volatility = stddev of recent % returns
 * 3. z-score = % change / volatility
 * 4. Add bonus points for volume spikes and source disagreements
 * 5. If stale, multiply score down (×0.3)
 * 6. Mark "meaningful" if score crosses threshold
 */
function scoreItem(
  quote: QuoteData,
  checkpointPrice: number,
  checkpointAt: string,
  addedAt: string
): ScoredItem {
  const pctChange = checkpointPrice > 0
    ? (quote.price - checkpointPrice) / checkpointPrice
    : 0;

  const volatility = calculateVolatility(quote.price_history);

  // z-score: how many standard deviations is this move?
  const zScore = volatility > 0 ? pctChange / volatility : 0;

  // Base score is the absolute z-score (direction doesn't matter for "attention")
  let score = Math.abs(zScore);

  // Bonus for volume spikes (surfaces unusual activity)
  if (quote.volume_spike) {
    score += 0.8;
  }

  // Bonus for source disagreement (surfaces data uncertainty)
  if (quote.source2_disagree) {
    score += 0.6;
  }

  // Stale data penalty: can't trust a frozen feed
  const now = Date.now();
  const lastUpdate = new Date(quote.last_update).getTime();
  const staleSeconds = Math.floor((now - lastUpdate) / 1000);

  let isStale = quote.is_stale;
  // Also treat as stale if no update in 30+ seconds
  if (!isStale && staleSeconds > 30) {
    isStale = true;
  }

  if (isStale) {
    score *= 0.3;
  }

  // Meaningful threshold: z-score of 2.0+ is statistically unusual
  const MEANINGFUL_THRESHOLD = 2.0;
  const isMeaningful = score >= MEANINGFUL_THRESHOLD;

  return {
    symbol: quote.symbol,
    name: quote.name,
    price: quote.price,
    sector: quote.sector,
    pct_change: pctChange,
    checkpoint_price: checkpointPrice,
    checkpoint_at: checkpointAt,
    attention_score: Math.round(score * 100) / 100,
    z_score: Math.round(zScore * 100) / 100,
    volatility: Math.round(volatility * 10000) / 10000,
    is_meaningful: isMeaningful,
    is_stale: isStale,
    stale_seconds: staleSeconds,
    volume_spike: quote.volume_spike,
    source2_price: quote.source2_price,
    source2_disagree: quote.source2_disagree,
    added_at: addedAt,
  };
}

// ============================================================
// API endpoints
// ============================================================

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

async function handleGetSymbols(): Promise<Response> {
  const { data, error } = await supabase
    .from("market_state")
    .select("symbol, name, sector, price, base_volatility")
    .order("symbol");

  if (error) return errorResponse("Failed to fetch symbols", 500);

  const symbols = (data || []).map((r: any) => ({
    symbol: r.symbol,
    name: r.name,
    sector: r.sector,
    price: r.price,
    volatility: r.base_volatility,
  }));

  return jsonResponse({ symbols });
}

async function handleGetWatchlist(userId: string): Promise<Response> {
  // Fetch watchlist items
  const { data: items, error: wError } = await supabase
    .from("watchlist")
    .select("*")
    .eq("user_id", userId);

  if (wError) return errorResponse("Failed to fetch watchlist", 500);
  if (!items || items.length === 0) return jsonResponse({ items: [] });

  // Fetch current market state for those symbols
  const symbols = items.map((i: any) => i.symbol);
  const { data: quotes, error: qError } = await supabase
    .from("market_state")
    .select("*")
    .in("symbol", symbols);

  if (qError) return errorResponse("Failed to fetch market data", 500);

  const quoteMap = new Map<string, QuoteData>();
  for (const q of quotes || []) {
    quoteMap.set(q.symbol, {
      symbol: q.symbol,
      name: q.name,
      price: Number(q.price),
      sector: q.sector,
      is_stale: q.is_stale,
      volume_spike: q.volume_spike,
      source2_price: q.source2_price !== null ? Number(q.source2_price) : null,
      source2_disagree: q.source2_disagree,
      price_history: q.price_history || [],
      last_update: q.last_update,
    });
  }

  // Score each item
  const scored: ScoredItem[] = items.map((item: any) => {
    const quote = quoteMap.get(item.symbol);
    if (!quote) {
      // Symbol no longer in market_state — return a placeholder
      return {
        symbol: item.symbol,
        name: item.symbol,
        price: 0,
        sector: "Unknown",
        pct_change: 0,
        checkpoint_price: Number(item.checkpoint_price),
        checkpoint_at: item.checkpoint_at,
        attention_score: 0,
        z_score: 0,
        volatility: 0,
        is_meaningful: false,
        is_stale: true,
        stale_seconds: 0,
        volume_spike: false,
        source2_price: null,
        source2_disagree: false,
        added_at: item.added_at,
      } as ScoredItem;
    }
    return scoreItem(
      quote,
      Number(item.checkpoint_price),
      item.checkpoint_at,
      item.added_at
    );
  });

  // Sort by attention score descending
  scored.sort((a, b) => b.attention_score - a.attention_score);

  return jsonResponse({ items: scored });
}

async function handleAddSymbol(userId: string, body: any): Promise<Response> {
  const symbol = (body?.symbol || "").toUpperCase().trim();
  if (!symbol) return errorResponse("Symbol is required");

  // Validate symbol exists in market_state
  const { data: quote, error: qError } = await supabase
    .from("market_state")
    .select("symbol, price")
    .eq("symbol", symbol)
    .maybeSingle();

  if (qError || !quote) {
    return errorResponse(`Unknown symbol: ${symbol}`, 404);
  }

  // Insert with checkpoint = current price (so it starts at 0% change)
  const { error: insertError } = await supabase
    .from("watchlist")
    .insert({
      user_id: userId,
      symbol: symbol,
      checkpoint_price: quote.price,
      checkpoint_at: new Date().toISOString(),
      added_at: new Date().toISOString(),
    });

  if (insertError) {
    // Check for duplicate
    if (insertError.code === "23505") {
      return errorResponse(`${symbol} is already in your watchlist`, 409);
    }
    return errorResponse("Failed to add symbol", 500);
  }

  return jsonResponse({ success: true, symbol });
}

async function handleRemoveSymbol(userId: string, body: any): Promise<Response> {
  const symbol = (body?.symbol || "").toUpperCase().trim();
  if (!symbol) return errorResponse("Symbol is required");

  const { error } = await supabase
    .from("watchlist")
    .delete()
    .eq("user_id", userId)
    .eq("symbol", symbol);

  if (error) return errorResponse("Failed to remove symbol", 500);

  return jsonResponse({ success: true, symbol });
}

async function handleAckSymbol(userId: string, body: any): Promise<Response> {
  const symbol = (body?.symbol || "").toUpperCase().trim();
  if (!symbol) return errorResponse("Symbol is required");

  // Get current price to use as new checkpoint
  const { data: quote, error: qError } = await supabase
    .from("market_state")
    .select("price")
    .eq("symbol", symbol)
    .maybeSingle();

  if (qError || !quote) {
    return errorResponse(`Unknown symbol: ${symbol}`, 404);
  }

  const { error } = await supabase
    .from("watchlist")
    .update({
      checkpoint_price: quote.price,
      checkpoint_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("symbol", symbol);

  if (error) return errorResponse("Failed to acknowledge symbol", 500);

  return jsonResponse({ success: true, symbol, new_checkpoint: quote.price });
}

// ============================================================
// Router
// ============================================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname;

    // Supabase can pass either the full function URL path or only the route path.
    const pathSegments = path.split("/").filter(Boolean);
    const functionSegmentIndex = pathSegments.lastIndexOf("smart-market-api");
    const segments = functionSegmentIndex >= 0
      ? pathSegments.slice(functionSegmentIndex + 1)
      : pathSegments;
    const routePath = `/${segments.join("/")}`;

    // Always tick the market on every request
    await tickMarket();

    // Route: GET /symbols
    if (segments.length === 1 && segments[0] === "symbols" && req.method === "GET") {
      return await handleGetSymbols();
    }

    // Route: GET /watchlist/:userId
    if (segments.length === 2 && segments[0] === "watchlist" && req.method === "GET") {
      return await handleGetWatchlist(segments[1]);
    }

    // Route: POST /watchlist/:userId/add
    if (segments.length === 3 && segments[0] === "watchlist" && segments[2] === "add" && req.method === "POST") {
      const body = await req.json();
      return await handleAddSymbol(segments[1], body);
    }

    // Route: POST /watchlist/:userId/remove
    if (segments.length === 3 && segments[0] === "watchlist" && segments[2] === "remove" && req.method === "POST") {
      const body = await req.json();
      return await handleRemoveSymbol(segments[1], body);
    }

    // Route: POST /watchlist/:userId/ack
    if (segments.length === 3 && segments[0] === "watchlist" && segments[2] === "ack" && req.method === "POST") {
      const body = await req.json();
      return await handleAckSymbol(segments[1], body);
    }

    // Health check
    if (routePath === "/" || routePath === "") {
      return jsonResponse({ status: "ok", service: "smart-market-api" });
    }

    return errorResponse("Not found", 404);
  } catch (err) {
    return errorResponse(`Internal error: ${err.message}`, 500);
  }
});

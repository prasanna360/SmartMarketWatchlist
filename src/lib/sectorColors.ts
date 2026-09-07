// Deterministic color assignment per sector name, so any sector string
// (from any dataset) always maps to the same color without a hardcoded list.

const PALETTE = [
  { text: '#7dd3fc', bg: 'rgba(125, 211, 252, 0.12)', dot: '#7dd3fc' }, // sky
  { text: '#a78bfa', bg: 'rgba(167, 139, 250, 0.12)', dot: '#a78bfa' }, // violet
  { text: '#4ade80', bg: 'rgba(74, 222, 128, 0.12)', dot: '#4ade80' }, // green
  { text: '#fbbf24', bg: 'rgba(251, 191, 36, 0.12)', dot: '#fbbf24' }, // amber
  { text: '#fb7185', bg: 'rgba(251, 113, 133, 0.12)', dot: '#fb7185' }, // rose
  { text: '#22d3ee', bg: 'rgba(34, 211, 238, 0.12)', dot: '#22d3ee' }, // cyan
  { text: '#f472b6', bg: 'rgba(244, 114, 182, 0.12)', dot: '#f472b6' }, // pink
  { text: '#a3e635', bg: 'rgba(163, 230, 53, 0.12)', dot: '#a3e635' }, // lime
];

export function getSectorColor(sector: string): { text: string; bg: string; dot: string } {
  if (!sector) return PALETTE[0];
  let hash = 0;
  for (let i = 0; i < sector.length; i++) {
    hash = (hash << 5) - hash + sector.charCodeAt(i);
    hash |= 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

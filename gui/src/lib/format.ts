const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 1234 -> "1.23K", 5_600_000 -> "5.60M" */
export function fmtCompact(n: number | null | undefined, digits = 2): string {
  if (!isNum(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(digits)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(digits)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(digits)}K`;
  return n.toFixed(abs >= 100 ? 0 : digits);
}

export function fmtInt(n: number | null | undefined): string {
  if (!isNum(n)) return '—';
  return Math.round(n).toLocaleString('en-US');
}

export function fmtRobux(n: number | null | undefined, digits = 1): string {
  if (!isNum(n)) return '—';
  return `R$ ${fmtCompact(n, digits)}`;
}

export function fmtUsd(n: number | null | undefined, digits = 1): string {
  if (!isNum(n)) return '—';
  return `$${fmtCompact(n, digits)}`;
}

export function fmtPct(x: number | null | undefined, digits = 2, signed = false): string {
  if (!isNum(x)) return '—';
  const v = x * 100;
  const sign = signed && v > 0 ? '+' : '';
  return `${sign}${v.toFixed(digits)}%`;
}

export function fmtMultiplier(x: number | null | undefined, digits = 2): string {
  if (!isNum(x)) return '—';
  return `${x.toFixed(digits)}×`;
}

export function fmtSigned(n: number | null | undefined, digits = 0): string {
  if (!isNum(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}`;
}

/** "2026-01-26" -> "Jan 26, 2026" without timezone drift. */
export function fmtDate(iso: string | null | undefined, withYear = true): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return withYear ? `${MONTHS[m - 1]} ${d}, ${y}` : `${MONTHS[m - 1]} ${d}`;
}

export function fmtDuration(hours: number | null | undefined): string {
  if (!isNum(hours)) return '—';
  const mins = Math.round(hours * 60);
  if (mins < 60) return `${mins} min`;
  return `${(hours).toFixed(1)} h`;
}

export function fmtAge(days: number | null | undefined): string {
  if (!isNum(days)) return '—';
  if (days < 60) return `${Math.round(days)} days`;
  if (days < 730) return `${(days / 30.4).toFixed(0)} months`;
  return `${(days / 365.25).toFixed(1)} years`;
}

export function dateToMs(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}

export function robloxUrl(g: { rootPlaceId: number | null; name: string }): string {
  if (isNum(g.rootPlaceId) && g.rootPlaceId > 0) return `https://www.roblox.com/games/${g.rootPlaceId}`;
  return `https://www.roblox.com/discover/?Keyword=${encodeURIComponent(g.name)}`;
}

export interface Constituent {
  rebalance_date: string;
  rank: number;
  prev_rank: number | null;
  rank_change: number | null;
  is_new: boolean;
  universeId: number;
  name: string;
  developer: string | null;
  rootPlaceId: number | null;
  weight: number;
  edr_7d_mean: number;
  edr_7d_mean_usd: number;
  edr_raw: number;
  edr_usd: number;
  edr_mom: number;
  edr_14d_vol: number;
  coverage_7d: number;
  obs_7d: number;
  snapshot_date: string;
  top_earning_rank: number | null;
  avg_ccu: number;
  ccu_7d_mean: number;
  dau_est: number;
  visits: number;
  visits_per_day: number | null;
  session_hours: number | null;
  favorites: number;
  likes: number;
  dislikes: number;
  like_ratio: number | null;
  gamePassCount: number | null;
  avgGamePassPrice: number | null;
  paidAccess: boolean | null;
  paidAccessPrice: number | null;
  ageDays: number | null;
  arpdau: number;
  intensity: number;
  edr_audience: number;
  edr_chart: number;
}

export interface IndexPoint {
  date: string;
  index_level: number;
  daily_return: number;
  coverage: number;
  n_constituents: number;
  basket_edr: number;
  basket_edr_daily: number;
  basket_edr_usd: number;
}

export interface HistoryPoint {
  d: string;
  edr: number;
  edr7: number;
  ccu: number;
  vpd: number | null;
  ter: number | null;
  rank: number | null;
}

export interface HistoryFile {
  rebalance_date: string;
  days: number;
  series: Record<string, HistoryPoint[]>;
}

export interface Validation {
  description: string;
  n_dates: number;
  spearman_model: number | null;
  spearman_ccu_only: number | null;
  next_spearman_model: number | null;
  next_spearman_ccu_only: number | null;
  next_spearman_chart_persistence: number | null;
}

export interface Meta {
  model_version: string;
  generated_at: string;
  rebalance_date: string;
  n_constituents: number;
  universe_size: number;
  snapshot_dates: string[];
  robux_to_usd: number;
  params: Record<string, Record<string, unknown>>;
  validation: Validation;
}

export interface Snapshot {
  date: string;
  availableDates: string[];
  indexLevel: IndexPoint[];
  games: Constituent[];
  meta: Meta | null;
}

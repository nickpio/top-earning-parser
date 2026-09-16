import { readdir, readFile } from 'fs/promises';
import { join, resolve } from 'path';

import type { Constituent, HistoryFile, HistoryPoint, IndexPoint, Meta, Snapshot } from './types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Directory holding one folder per rebalance date (override with RTE_DATA_DIR). */
export function exportsDir(): string {
  return process.env.RTE_DATA_DIR
    ? resolve(process.env.RTE_DATA_DIR)
    : join(process.cwd(), '..', 'index_data', 'exports');
}

export function isValidDate(value: string): boolean {
  return DATE_RE.test(value);
}

export async function listDates(): Promise<string[]> {
  try {
    const entries = await readdir(exportsDir());
    return entries.filter((d) => DATE_RE.test(d)).sort().reverse();
  } catch {
    return [];
  }
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

export async function loadSnapshot(date?: string): Promise<Snapshot | null> {
  const dates = await listDates();
  if (dates.length === 0) return null;

  const selected = date && isValidDate(date) && dates.includes(date) ? date : dates[0];
  const dir = join(exportsDir(), selected);

  const [games, indexLevel, meta] = await Promise.all([
    readJson<Constituent[]>(join(dir, 'rte100.json')),
    readJson<IndexPoint[]>(join(dir, 'rte100_index_level.json')),
    readJson<Meta>(join(dir, 'rte100_meta.json')),
  ]);
  if (!games) return null;

  return {
    date: selected,
    availableDates: dates,
    games,
    indexLevel: indexLevel ?? [],
    meta,
  };
}

export async function loadGameHistory(date: string, universeId: number): Promise<HistoryPoint[] | null> {
  if (!isValidDate(date)) return null;
  const file = await readJson<HistoryFile>(join(exportsDir(), date, 'rte100_history.json'));
  if (!file) return null;
  return file.series[String(universeId)] ?? [];
}

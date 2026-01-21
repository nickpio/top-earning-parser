'use client';

import { useEffect, useState } from 'react';

interface Game {
  rebalance_date: string;
  rank: number;
  universeId: number;
  name: string;
  developer: string;
  weight: number;
  score: number;
  edr_7d_mean: number;
  edr_mom: number;
  edr_14d_vol: number;
  coverage_7d: number;
  avg_ccu: number;
  visits: number;
  favorites: number;
  likes: number;
  monetization_count: number;
  median_price: number;
  price_dispersion: number;
  engagement_score: number;
  edr_raw: number;
}

export function TopGames() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayCount, setDisplayCount] = useState(10);

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('/api/index-data');
        if (!response.ok) throw new Error('Failed to fetch data');
        const result = await response.json();
        setGames(result.games);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-zinc-500">Loading games data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  const formatNumber = (num: number): string => {
    if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
    return num.toFixed(0);
  };

  const displayedGames = games.slice(0, displayCount);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Rank
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Game
              </th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Weight
              </th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Score
              </th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                EDR (7d)
              </th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                MoM
              </th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                CCU
              </th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Visits
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {displayedGames.map((game) => (
              <tr
                key={game.universeId}
                className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              >
                <td className="px-4 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  #{game.rank}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <a
                      href={`https://www.roblox.com/games/${game.universeId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      {game.name}
                    </a>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {game.developer}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-sm text-zinc-600 dark:text-zinc-400">
                  {(game.weight * 100).toFixed(2)}%
                </td>
                <td className="px-4 py-3 text-right text-sm text-zinc-600 dark:text-zinc-400">
                  {game.score.toFixed(3)}
                </td>
                <td className="px-4 py-3 text-right text-sm text-zinc-600 dark:text-zinc-400">
                  ${formatNumber(game.edr_7d_mean)}
                </td>
                <td className="px-4 py-3 text-right text-sm">
                  <span
                    className={`font-medium ${
                      game.edr_mom >= 1
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {game.edr_mom.toFixed(2)}x
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-sm text-zinc-600 dark:text-zinc-400">
                  {formatNumber(game.avg_ccu)}
                </td>
                <td className="px-4 py-3 text-right text-sm text-zinc-600 dark:text-zinc-400">
                  {formatNumber(game.visits)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {displayCount < games.length && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => setDisplayCount(prev => Math.min(prev + 10, games.length))}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            Load More ({displayCount} of {games.length})
          </button>
        </div>
      )}

      {displayCount >= games.length && games.length > 10 && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => setDisplayCount(10)}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            Show Less
          </button>
        </div>
      )}
    </div>
  );
}

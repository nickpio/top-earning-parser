'use client';

import { useEffect, useState } from 'react';

interface IndexDataPoint {
  date: string;
  index_level: number;
  daily_return: number;
  daily_log_return: number;
  coverage: number;
}

export function IndexChart() {
  const [data, setData] = useState<IndexDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('/api/index-data');
        if (!response.ok) throw new Error('Failed to fetch data');
        const result = await response.json();
        setData(result.indexLevel);
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
        <div className="text-zinc-500">Loading chart data...</div>
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

  const maxValue = Math.max(...data.map(d => d.index_level));
  const minValue = Math.min(...data.map(d => d.index_level));
  const range = maxValue - minValue;
  const padding = range * 0.1;

  const currentLevel = data[data.length - 1]?.index_level || 0;
  const previousLevel = data[data.length - 2]?.index_level || 0;
  const change = currentLevel - previousLevel;
  const changePercent = previousLevel !== 0 ? (change / previousLevel) * 100 : 0;

  return (
    <div>
      <div className="mb-6 flex items-baseline gap-4">
        <div className="text-4xl font-bold text-zinc-900 dark:text-zinc-50">
          {currentLevel.toFixed(2)}
        </div>
        <div className={`text-lg font-semibold ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {change >= 0 ? '+' : ''}{change.toFixed(2)} ({change >= 0 ? '+' : ''}{changePercent.toFixed(2)}%)
        </div>
      </div>

      <div className="relative h-64">
        <svg className="h-full w-full" viewBox="0 0 800 256" preserveAspectRatio="none">
          <defs>
            <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 1, 2, 3, 4].map(i => (
            <line
              key={i}
              x1="0"
              y1={i * 64}
              x2="800"
              y2={i * 64}
              stroke="currentColor"
              strokeOpacity="0.1"
              className="text-zinc-400"
            />
          ))}

          {/* Area fill */}
          <path
            d={`
              M 0 256
              ${data.map((point, i) => {
                const x = (i / (data.length - 1)) * 800;
                const y = 256 - ((point.index_level - minValue + padding) / (range + padding * 2)) * 256;
                return `L ${x} ${y}`;
              }).join(' ')}
              L 800 256
              Z
            `}
            fill="url(#chartGradient)"
          />

          {/* Line */}
          <path
            d={`
              M ${data.map((point, i) => {
                const x = (i / (data.length - 1)) * 800;
                const y = 256 - ((point.index_level - minValue + padding) / (range + padding * 2)) * 256;
                return `${x},${y}`;
              }).join(' L ')}
            `}
            fill="none"
            stroke="rgb(59, 130, 246)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />

          {/* Data points */}
          {data.map((point, i) => {
            const x = (i / (data.length - 1)) * 800;
            const y = 256 - ((point.index_level - minValue + padding) / (range + padding * 2)) * 256;
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="3"
                fill="rgb(59, 130, 246)"
                className="cursor-pointer hover:r-[5]"
              >
                <title>{`${new Date(point.date).toLocaleDateString()}: ${point.index_level.toFixed(2)}`}</title>
              </circle>
            );
          })}
        </svg>

        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 flex h-full flex-col justify-between text-xs text-zinc-500">
          <span>{maxValue.toFixed(0)}</span>
          <span>{minValue.toFixed(0)}</span>
        </div>
      </div>

      {/* X-axis dates */}
      <div className="mt-4 flex justify-between text-xs text-zinc-500">
        <span>{new Date(data[0]?.date).toLocaleDateString()}</span>
        <span>{new Date(data[data.length - 1]?.date).toLocaleDateString()}</span>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-3 gap-4 border-t border-zinc-200 pt-4 dark:border-zinc-700">
        <div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Coverage</div>
          <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {(data[data.length - 1]?.coverage * 100).toFixed(1)}%
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Daily Return</div>
          <div className={`text-lg font-semibold ${data[data.length - 1]?.daily_return >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {(data[data.length - 1]?.daily_return * 100).toFixed(2)}%
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Data Points</div>
          <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {data.length}
          </div>
        </div>
      </div>
    </div>
  );
}

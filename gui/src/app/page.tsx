import { IndexChart } from '@/components/IndexChart';
import { TopGames } from '@/components/TopGames';

export default async function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            RTE100 Index Dashboard
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Top 100 Roblox Games by Estimated Daily Revenue
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-8">
          <section className="rounded-lg bg-white p-6 shadow dark:bg-zinc-800">
            <h2 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              Index Performance
            </h2>
            <IndexChart />
          </section>

          <section className="rounded-lg bg-white p-6 shadow dark:bg-zinc-800">
            <h2 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              Top Ranked Games
            </h2>
            <TopGames />
          </section>
        </div>
      </main>
    </div>
  );
}

import { NextResponse } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

export async function GET() {
  try {
    const indexDataPath = join(process.cwd(), '..', 'index_data', 'exports');
    const dates = await readdir(indexDataPath);

    // Filter out non-date directories and sort
    const validDates = dates
      .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort()
      .reverse();

    if (validDates.length === 0) {
      return NextResponse.json({ error: 'No data available' }, { status: 404 });
    }

    // Get the most recent date
    const latestDate = validDates[0];
    const latestDatePath = join(indexDataPath, latestDate);

    // Read both JSON files
    const indexLevelData = await readFile(
      join(latestDatePath, 'rte100_index_level.json'),
      'utf-8'
    );
    const gamesData = await readFile(
      join(latestDatePath, 'rte100.json'),
      'utf-8'
    );

    return NextResponse.json({
      date: latestDate,
      indexLevel: JSON.parse(indexLevelData),
      games: JSON.parse(gamesData),
      availableDates: validDates,
    });
  } catch (error) {
    console.error('Error fetching index data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch index data' },
      { status: 500 }
    );
  }
}

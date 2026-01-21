import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ date: string }> }
) {
  try {
    const { date } = await params;

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
    }

    const indexDataPath = join(process.cwd(), '..', 'index_data', 'exports', date);

    // Read both JSON files
    const indexLevelData = await readFile(
      join(indexDataPath, 'rte100_index_level.json'),
      'utf-8'
    );
    const gamesData = await readFile(
      join(indexDataPath, 'rte100.json'),
      'utf-8'
    );

    return NextResponse.json({
      date,
      indexLevel: JSON.parse(indexLevelData),
      games: JSON.parse(gamesData),
    });
  } catch (error) {
    console.error('Error fetching index data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch data for the specified date' },
      { status: 404 }
    );
  }
}

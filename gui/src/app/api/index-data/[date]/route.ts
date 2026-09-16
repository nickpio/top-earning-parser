import { NextResponse } from 'next/server';

import { isValidDate, listDates, loadSnapshot } from '@/lib/data';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!isValidDate(date)) {
    return NextResponse.json({ error: 'Invalid date format, expected YYYY-MM-DD' }, { status: 400 });
  }

  const dates = await listDates();
  if (!dates.includes(date)) {
    return NextResponse.json({ error: 'No data for the specified date', availableDates: dates }, { status: 404 });
  }

  const snapshot = await loadSnapshot(date);
  if (!snapshot) {
    return NextResponse.json({ error: 'Failed to load data for the specified date' }, { status: 500 });
  }
  return NextResponse.json(snapshot);
}

import { NextResponse } from 'next/server';

import { isValidDate, listDates, loadGameHistory } from '@/lib/data';

export const dynamic = 'force-dynamic';

/** Per-constituent daily history for the detail panels: /api/games/123?date=YYYY-MM-DD */
export async function GET(request: Request, { params }: { params: Promise<{ universeId: string }> }) {
  const { universeId } = await params;
  const id = Number(universeId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid universeId' }, { status: 400 });
  }

  const requested = new URL(request.url).searchParams.get('date');
  let date = requested ?? '';
  if (!date) {
    const dates = await listDates();
    date = dates[0] ?? '';
  }
  if (!isValidDate(date)) {
    return NextResponse.json({ error: 'Invalid date format, expected YYYY-MM-DD' }, { status: 400 });
  }

  const series = await loadGameHistory(date, id);
  if (series === null) {
    return NextResponse.json({ error: 'No history available for the specified date' }, { status: 404 });
  }
  return NextResponse.json({ universeId: id, date, series });
}

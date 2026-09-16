import { NextResponse } from 'next/server';

import { loadSnapshot } from '@/lib/data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const snapshot = await loadSnapshot();
  if (!snapshot) {
    return NextResponse.json({ error: 'No data available' }, { status: 404 });
  }
  return NextResponse.json(snapshot);
}

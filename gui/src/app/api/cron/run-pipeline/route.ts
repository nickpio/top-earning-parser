import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const maxDuration = 300; // 5 minutes max execution time (Vercel limit)

export async function GET(request: Request) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Change to parent directory where Python script is located
    const projectRoot = process.cwd() + '/..';

    // Run the pipeline with today's rebalance
    const { stdout, stderr } = await execAsync(
      'python3 run_index_engine.py --rebalance-today',
      { cwd: projectRoot }
    );

    console.log('Pipeline stdout:', stdout);
    if (stderr) console.error('Pipeline stderr:', stderr);

    return NextResponse.json({
      success: true,
      message: 'Pipeline executed successfully',
      timestamp: new Date().toISOString(),
      output: stdout,
    });
  } catch (error) {
    console.error('Pipeline execution failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

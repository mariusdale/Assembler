import { NextResponse } from 'next/server';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    ok: true,
    app: '{{APP_NAME}}',
    databaseConfigured: Boolean(process.env.DATABASE_URL),
  });
}

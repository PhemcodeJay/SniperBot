import { NextResponse } from 'next/server';

export async function GET() {
  const missing: string[] = [];
  const required = ['BYBIT_API_KEY', 'BYBIT_API_SECRET'];
  for (const k of required) {
    if (!process.env[k]) missing.push(k);
  }

  return NextResponse.json({
    readyToTrade: missing.length === 0,
    missing,
    env: {
      autoExecuteClient: process.env.NEXT_PUBLIC_AUTO_EXECUTE || null,
      autoExecuteServer: process.env.AUTO_EXECUTE_ENABLED || null,
    },
  });
}

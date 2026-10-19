import type { NextRequest } from 'next/server';
import { atenderMcp, sinStreaming } from '@/lib/ia/mcp';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Igual que /api/mcp/<clave>, pero con la clave en el encabezado "Authorization: Bearer <clave>".
export async function POST(request: NextRequest) {
  return atenderMcp(request);
}
export const GET = sinStreaming;
export const DELETE = sinStreaming;

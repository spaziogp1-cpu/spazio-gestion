import type { NextRequest } from 'next/server';
import { atenderMcp, sinStreaming } from '@/lib/ia/mcp';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Conector para Claude o ChatGPT: https://spazio-gestion.vercel.app/api/mcp/<clave personal>
export async function POST(request: NextRequest, { params }: { params: Promise<{ clave: string }> }) {
  const { clave } = await params;
  return atenderMcp(request, clave);
}
export const GET = sinStreaming;
export const DELETE = sinStreaming;

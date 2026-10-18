import { NextResponse, type NextRequest } from 'next/server';
import { procesoDiario } from '@/lib/notificar/diario';
import { crearAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Lo llama Vercel todos los días hábiles a las 8 (ver vercel.json).
// Vercel manda "Authorization: Bearer <CRON_SECRET>".
export async function GET(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || request.headers.get('authorization') !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const informes = await procesoDiario(crearAdmin());
    return NextResponse.json({ ok: true, informes });
  } catch (e) {
    console.error('proceso diario', e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

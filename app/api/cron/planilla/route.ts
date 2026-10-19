import { NextResponse, type NextRequest } from 'next/server';
import { importarDeOriginal } from '@/lib/planilla/importar-origen';
import { crearAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Lo llama Supabase (pg_cron) cada 15 minutos: trae las ventas nuevas de la planilla original.
// Acepta la clave propia guardada en la base o CRON_SECRET.
async function autorizado(request: NextRequest) {
  const h = request.headers.get('authorization') ?? '';
  if (process.env.CRON_SECRET && h === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (!h.startsWith('Bearer ') || h.length < 30) return false;
  const { data } = await crearAdmin().from('integraciones').select('datos').eq('clave', 'cron_planilla').maybeSingle();
  const secreto = (data?.datos as { secreto?: string } | undefined)?.secreto;
  return Boolean(secreto) && h === `Bearer ${secreto}`;
}

async function correr(request: NextRequest) {
  if (!(await autorizado(request))) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const r = await importarDeOriginal(crearAdmin('Planilla original'));
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error('planilla original', e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const GET = correr;
export const POST = correr;

import { NextResponse, type NextRequest } from 'next/server';
import { importarDeOriginal } from '@/lib/planilla/importar-origen';
import { sincronizarPendientes } from '@/lib/planilla/sync';
import { crearAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Lo llama Supabase (pg_cron) cada 15 minutos: trae las ventas nuevas de la planilla original
// y escribe en ella los pedidos de la app que quedaron pendientes.
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
  const db = crearAdmin('Planilla original');
  // Cada parte va por separado: si falla la importación, igual se escriben los pendientes.
  const importadas = await importarDeOriginal(db).catch((e) => {
    console.error('planilla original', e);
    return { error: e instanceof Error ? e.message : String(e) };
  });
  const escritos = await sincronizarPendientes(db).catch((e) => {
    console.error('planilla pendientes', e);
    return { error: e instanceof Error ? e.message : String(e) };
  });
  const ok = !('error' in importadas) && !('error' in escritos);
  return NextResponse.json({ ok, importadas, escritos }, { status: ok ? 200 : 500 });
}

export const GET = correr;
export const POST = correr;

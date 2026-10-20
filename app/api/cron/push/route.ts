import { NextResponse, type NextRequest } from 'next/server';
import { enviarAviso } from '@/lib/push/servicio';
import { crearAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Lo llama la base (pg_net) cada vez que se crea un aviso: lo manda como notificación a los celulares.
async function autorizado(request: NextRequest) {
  const h = request.headers.get('authorization') ?? '';
  if (process.env.CRON_SECRET && h === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (!h.startsWith('Bearer ') || h.length < 30) return false;
  const { data } = await crearAdmin().from('integraciones').select('datos').eq('clave', 'push_envio').maybeSingle();
  const secreto = (data?.datos as { secreto?: string } | undefined)?.secreto;
  return Boolean(secreto) && h === `Bearer ${secreto}`;
}

export async function POST(request: NextRequest) {
  if (!(await autorizado(request))) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { id } = (await request.json().catch(() => ({}))) as { id?: string };
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: 'Falta el aviso' }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...(await enviarAviso(crearAdmin('Notificaciones'), id)) });
  } catch (e) {
    console.error('push', e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

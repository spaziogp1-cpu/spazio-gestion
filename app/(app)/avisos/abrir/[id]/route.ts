import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Abrir un aviso: lo marca como leído y lleva a lo que avisa (tarea, pedido, visita o reporte).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const volver = new URL('/avisos', request.url);
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.redirect(volver);
  const supabase = await createClient();
  const { data } = await supabase.from('notificaciones').select('id, link, leida_en').eq('id', id).maybeSingle();
  if (!data) return NextResponse.redirect(volver);
  if (!data.leida_en) await supabase.from('notificaciones').update({ leida_en: new Date().toISOString() }).eq('id', id);
  // Solo links internos.
  const destino = typeof data.link === 'string' && data.link.startsWith('/') && !data.link.startsWith('//') ? data.link : '/avisos';
  return NextResponse.redirect(new URL(destino, request.url));
}

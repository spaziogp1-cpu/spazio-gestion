'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { texto } from '@/lib/formato';
import { actualizarPedido as actualizarEnPlanilla } from '@/lib/planilla/sync';
import { miembroActual } from '@/lib/sesion';

export type EstadoEntrega = { error?: string; ok?: string };

const ENVIOS = ['retira', 'flete', 'expreso', 'coordinar'];

/** Agenda (o cambia) la entrega de un pedido desde el calendario. */
export async function agendarEntrega(_prev: EstadoEntrega, fd: FormData): Promise<EstadoEntrega> {
  const { supabase } = await miembroActual();
  const pedidoId = texto(fd.get('pedido_id'));
  const fecha = texto(fd.get('fecha'));
  const hora = texto(fd.get('hora'));
  const envio = texto(fd.get('envio'));
  if (!pedidoId) return { error: 'Elegí el pedido.' };
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'Elegí la fecha.' };

  const { data: p } = await supabase.from('pedidos').select('numero, etapa').eq('id', pedidoId).maybeSingle();
  if (!p) return { error: 'No se encontró el pedido.' };

  const cambios: Record<string, unknown> = {
    fecha_entrega_programada: fecha,
    hora_entrega_programada: hora && /^\d{2}:\d{2}$/.test(hora) ? hora : null,
  };
  if (envio && ENVIOS.includes(envio)) cambios.envio = envio;
  // Si ya estaba lista, agendar la entrega es coordinarla.
  if (p.etapa === 'lista') cambios.etapa = 'envio_coordinado';

  const { error } = await supabase.from('pedidos').update(cambios).eq('id', pedidoId);
  if (error) return { error: `No se pudo guardar: ${error.message}` };
  if (cambios.etapa) after(() => actualizarEnPlanilla(supabase, pedidoId));

  revalidatePath('/calendario');
  revalidatePath(`/pedidos/${pedidoId}`);
  revalidatePath('/pedidos');
  revalidatePath('/');
  return { ok: `Entrega del #${p.numero} agendada${cambios.etapa ? ' (pasó a "Envío o retiro coordinado")' : ''}.` };
}

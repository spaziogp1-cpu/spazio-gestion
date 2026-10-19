'use server';

import { revalidatePath } from 'next/cache';
import { texto } from '@/lib/formato';
import { miembroActual } from '@/lib/sesion';

export type EstadoTarea = { error?: string; ok?: string };

// "equipo" = tarea de todo el equipo (sin responsable): la ve cada uno en su lista.
function responsable(fd: FormData, porDefecto: string | null): string | null {
  const v = texto(fd.get('responsable_id'));
  if (v === 'equipo') return null;
  return v ?? porDefecto;
}

const fechaValida = (f: string | null) => (f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : null);
const PRIORIDADES = ['baja', 'media', 'alta'];
const ESTADOS = ['pendiente', 'en_curso', 'bloqueada', 'hecha'];

function refrescar(pedidoId?: string | null) {
  revalidatePath('/tareas');
  revalidatePath('/objetivos');
  revalidatePath('/calendario');
  revalidatePath('/showroom');
  revalidatePath('/');
  if (pedidoId) revalidatePath(`/pedidos/${pedidoId}`);
}

export async function crearTarea(_prev: EstadoTarea, fd: FormData): Promise<EstadoTarea> {
  const { miembro, supabase } = await miembroActual();
  const titulo = texto(fd.get('titulo'));
  if (!titulo) return { error: 'Escribí qué hay que hacer.' };
  const prioridad = texto(fd.get('prioridad')) ?? 'media';
  const pedidoId = texto(fd.get('pedido_id'));
  const { error } = await supabase.from('tareas').insert({
    titulo,
    descripcion: texto(fd.get('descripcion')),
    responsable_id: responsable(fd, miembro.id),
    creado_por: miembro.id,
    prioridad: PRIORIDADES.includes(prioridad) ? prioridad : 'media',
    vencimiento: fechaValida(texto(fd.get('vencimiento'))),
    pedido_id: pedidoId,
    visita_id: texto(fd.get('visita_id')),
    objetivo_id: texto(fd.get('objetivo_id')),
  });
  if (error) return { error: `No se pudo crear la tarea: ${error.message}` };
  refrescar(pedidoId);
  return { ok: 'Tarea creada' };
}

export async function cambiarEstadoTarea(id: string, estado: string, bloqueo?: string | null): Promise<EstadoTarea> {
  if (!ESTADOS.includes(estado)) return { error: 'Estado inválido.' };
  const { supabase } = await miembroActual();
  const cambios: Record<string, unknown> = { estado };
  if (estado === 'bloqueada') cambios.bloqueo = bloqueo?.trim() || null;
  if (estado !== 'bloqueada') cambios.bloqueo = null;
  const { data, error } = await supabase.from('tareas').update(cambios).eq('id', id).select('pedido_id').maybeSingle();
  if (error) return { error: 'No se pudo actualizar la tarea.' };
  refrescar(data?.pedido_id);
  return { ok: 'ok' };
}

export async function actualizarTarea(id: string, _prev: EstadoTarea, fd: FormData): Promise<EstadoTarea> {
  const { supabase } = await miembroActual();
  const titulo = texto(fd.get('titulo'));
  if (!titulo) return { error: 'El título no puede quedar vacío.' };
  const prioridad = texto(fd.get('prioridad')) ?? 'media';
  const { data, error } = await supabase
    .from('tareas')
    .update({
      titulo,
      descripcion: texto(fd.get('descripcion')),
      responsable_id: responsable(fd, null),
      prioridad: PRIORIDADES.includes(prioridad) ? prioridad : 'media',
      vencimiento: fechaValida(texto(fd.get('vencimiento'))),
    })
    .eq('id', id)
    .select('pedido_id')
    .maybeSingle();
  if (error) return { error: 'No se pudo guardar.' };
  refrescar(data?.pedido_id);
  return { ok: 'Guardado' };
}

export async function borrarTarea(id: string): Promise<void> {
  const { supabase } = await miembroActual();
  const { data } = await supabase.from('tareas').delete().eq('id', id).select('pedido_id').maybeSingle();
  refrescar(data?.pedido_id);
}

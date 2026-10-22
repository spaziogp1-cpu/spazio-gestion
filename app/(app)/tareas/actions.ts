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
const horaValida = (h: string | null) => (h && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(h) ? h.slice(0, 5) : null);
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
  const fila = {
    titulo,
    descripcion: texto(fd.get('descripcion')),
    responsable_id: responsable(fd, miembro.id),
    creado_por: miembro.id,
    prioridad: PRIORIDADES.includes(prioridad) ? prioridad : 'media',
    vencimiento: fechaValida(texto(fd.get('vencimiento'))),
    // La hora solo tiene sentido con fecha (va al calendario y avisa antes).
    hora: fechaValida(texto(fd.get('vencimiento'))) ? horaValida(texto(fd.get('hora'))) : null,
    pedido_id: pedidoId,
    visita_id: texto(fd.get('visita_id')),
    objetivo_id: texto(fd.get('objetivo_id')),
  };
  let { error } = await supabase.from('tareas').insert(fila);
  // Hasta que se corra la migración 0019 no existe la columna "hora".
  if (error && /hora/.test(error.message)) ({ error } = await supabase.from('tareas').insert({ ...fila, hora: undefined }));
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
  const cambios: Record<string, unknown> = {
    titulo,
    descripcion: texto(fd.get('descripcion')),
    responsable_id: responsable(fd, null),
    prioridad: PRIORIDADES.includes(prioridad) ? prioridad : 'media',
    vencimiento: fechaValida(texto(fd.get('vencimiento'))),
    hora: fechaValida(texto(fd.get('vencimiento'))) ? horaValida(texto(fd.get('hora'))) : null,
  };
  const guardar = (c: Record<string, unknown>) => supabase.from('tareas').update(c).eq('id', id).select('pedido_id').maybeSingle();
  let { data, error } = await guardar(cambios);
  if (error && /hora/.test(error.message)) {
    delete cambios.hora;
    ({ data, error } = await guardar(cambios));
  }
  if (error) return { error: 'No se pudo guardar.' };
  refrescar(data?.pedido_id);
  return { ok: 'Guardado' };
}

export async function borrarTarea(id: string): Promise<void> {
  const { supabase } = await miembroActual();
  const { data } = await supabase.from('tareas').delete().eq('id', id).select('pedido_id').maybeSingle();
  refrescar(data?.pedido_id);
}

'use server';

import { revalidatePath } from 'next/cache';
import { hoyAR } from '@/lib/fechas';
import { texto } from '@/lib/formato';
import { miembroActual } from '@/lib/sesion';

export type EstadoVisita = { error?: string; ok?: string };

const fechaValida = (f: string | null) => (f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : null);
const horaValida = (h: string | null) => (h && /^\d{2}:\d{2}/.test(h) ? h.slice(0, 5) : null);
const ESTADOS = ['agendada', 'confirmada', 'vino', 'no_vino', 'cancelada'];
const RESULTADOS = ['compro', 'presupuesto', 'pensando', 'no_interesado'];

function refrescar() {
  revalidatePath('/showroom');
  revalidatePath('/calendario');
  revalidatePath('/tareas');
  revalidatePath('/');
}

export async function crearVisita(_prev: EstadoVisita, fd: FormData): Promise<EstadoVisita> {
  const { miembro, supabase } = await miembroActual();
  const nombre = texto(fd.get('nombre'));
  if (!nombre) return { error: 'Escribí el nombre de quien viene.' };
  const sinTurno = fd.get('sin_turno') === '1';
  const ahora = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit' }).format(new Date());

  const fecha = sinTurno ? hoyAR() : fechaValida(texto(fd.get('fecha')));
  if (!fecha) return { error: 'Elegí el día de la visita.' };

  const { error } = await supabase.from('visitas').insert({
    nombre,
    telefono: texto(fd.get('telefono')),
    fecha,
    hora: sinTurno ? ahora : horaValida(texto(fd.get('hora'))),
    con_turno: !sinTurno,
    motivo: texto(fd.get('motivo')),
    atiende_id: texto(fd.get('atiende_id')) ?? miembro.id,
    estado: sinTurno ? 'vino' : 'agendada',
    notas: texto(fd.get('notas')),
    creado_por: miembro.id,
  });
  if (error) return { error: `No se pudo guardar la visita: ${error.message}` };
  refrescar();
  return { ok: sinTurno ? 'Visita registrada' : 'Visita agendada' };
}

export async function cambiarEstadoVisita(id: string, estado: string): Promise<EstadoVisita> {
  if (!ESTADOS.includes(estado)) return { error: 'Estado inválido.' };
  const { supabase } = await miembroActual();
  const { error } = await supabase.from('visitas').update({ estado }).eq('id', id);
  if (error) return { error: 'No se pudo actualizar.' };
  refrescar();
  return { ok: 'ok' };
}

export async function reprogramarVisita(id: string, _prev: EstadoVisita, fd: FormData): Promise<EstadoVisita> {
  const { supabase } = await miembroActual();
  const fecha = fechaValida(texto(fd.get('fecha')));
  if (!fecha) return { error: 'Elegí el nuevo día.' };
  const { error } = await supabase
    .from('visitas')
    .update({ fecha, hora: horaValida(texto(fd.get('hora'))), estado: 'agendada' })
    .eq('id', id);
  if (error) return { error: 'No se pudo reprogramar.' };
  refrescar();
  return { ok: 'Reprogramada' };
}

// Después de la visita: cómo terminó y, si hace falta, una tarea de seguimiento.
export async function cerrarVisita(id: string, _prev: EstadoVisita, fd: FormData): Promise<EstadoVisita> {
  const { miembro, supabase } = await miembroActual();
  const resultado = texto(fd.get('resultado'));
  if (resultado && !RESULTADOS.includes(resultado)) return { error: 'Resultado inválido.' };
  const { data: v, error } = await supabase
    .from('visitas')
    .update({ estado: 'vino', resultado, notas: texto(fd.get('notas')) })
    .eq('id', id)
    .select('nombre, atiende_id')
    .maybeSingle();
  if (error || !v) return { error: 'No se pudo guardar.' };

  const seguimiento = texto(fd.get('seguimiento'));
  if (seguimiento) {
    const { error: errT } = await supabase.from('tareas').insert({
      titulo: `${seguimiento} — ${v.nombre}`,
      responsable_id: v.atiende_id ?? miembro.id,
      creado_por: miembro.id,
      vencimiento: fechaValida(texto(fd.get('seguimiento_fecha'))),
      prioridad: 'media',
      visita_id: id,
    });
    if (errT) return { error: 'Se guardó la visita, pero no la tarea de seguimiento.' };
  }
  refrescar();
  return { ok: 'Guardado' };
}

export async function borrarVisita(id: string): Promise<void> {
  const { supabase } = await miembroActual();
  await supabase.from('visitas').delete().eq('id', id);
  refrescar();
}

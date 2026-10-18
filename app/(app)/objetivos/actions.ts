'use server';

import { revalidatePath } from 'next/cache';
import { leerMonto, texto } from '@/lib/formato';
import { miembroActual } from '@/lib/sesion';

export type EstadoObjetivo = { error?: string; ok?: string };

const fechaValida = (f: string | null) => (f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : null);

export async function crearObjetivo(_prev: EstadoObjetivo, fd: FormData): Promise<EstadoObjetivo> {
  const { miembro, supabase } = await miembroActual();
  const titulo = texto(fd.get('titulo'));
  if (!titulo) return { error: 'Poné un nombre al objetivo.' };
  const tipo = texto(fd.get('tipo')) === 'proyecto' ? 'proyecto' : 'numerico';
  const fila: Record<string, unknown> = {
    titulo,
    descripcion: texto(fd.get('descripcion')),
    tipo,
    responsable_id: texto(fd.get('responsable_id')),
    creado_por: miembro.id,
  };
  if (tipo === 'numerico') {
    const meta = leerMonto(fd.get('meta'));
    if (meta <= 0) return { error: 'Poné la meta (un número mayor a cero).' };
    fila.metrica = texto(fd.get('metrica')) === 'facturacion' ? 'facturacion' : 'ventas';
    fila.periodo = texto(fd.get('periodo')) === 'mes' ? 'mes' : 'semana';
    fila.meta = meta;
  } else {
    const fecha = fechaValida(texto(fd.get('fecha_limite')));
    if (!fecha) return { error: 'Poné la fecha en que tiene que estar terminado.' };
    fila.fecha_limite = fecha;
  }
  const { error } = await supabase.from('objetivos').insert(fila);
  if (error) return { error: `No se pudo crear: ${error.message}` };
  revalidatePath('/objetivos');
  revalidatePath('/');
  return { ok: 'Objetivo creado' };
}

export async function cambiarEstadoObjetivo(id: string, estado: 'activo' | 'cumplido' | 'cancelado'): Promise<void> {
  const { supabase } = await miembroActual();
  await supabase.from('objetivos').update({ estado }).eq('id', id);
  revalidatePath('/objetivos');
  revalidatePath('/');
}

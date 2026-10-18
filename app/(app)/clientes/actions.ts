'use server';

import { revalidatePath } from 'next/cache';
import { texto } from '@/lib/formato';
import { miembroActual } from '@/lib/sesion';

export type EstadoCliente = { error?: string; ok?: string };

export async function actualizarCliente(id: string, _prev: EstadoCliente, fd: FormData): Promise<EstadoCliente> {
  const nombre = texto(fd.get('nombre'));
  if (!nombre) return { error: 'El nombre es obligatorio.' };
  const { supabase } = await miembroActual();
  const { error } = await supabase
    .from('clientes')
    .update({
      nombre,
      telefono: texto(fd.get('telefono')),
      email: texto(fd.get('email')),
      dni: texto(fd.get('dni')),
      direccion: texto(fd.get('direccion')),
      localidad: texto(fd.get('localidad')),
      codigo_postal: texto(fd.get('codigo_postal')),
      notas: texto(fd.get('notas')),
    })
    .eq('id', id);
  if (error) return { error: 'No se pudo guardar.' };
  revalidatePath(`/clientes/${id}`);
  revalidatePath('/pedidos');
  return { ok: 'Datos guardados' };
}

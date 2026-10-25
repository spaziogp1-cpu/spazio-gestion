'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type EstadoTurno = { error?: string };

const limpio = (v: FormDataEntryValue | null, max = 200) => String(v ?? '').trim().slice(0, max);

export async function reservarTurno(_prev: EstadoTurno, fd: FormData): Promise<EstadoTurno> {
  // Campo oculto: si viene completo, es un robot.
  if (limpio(fd.get('sitio'))) return { error: 'No se pudo reservar.' };
  const fecha = limpio(fd.get('fecha'), 10);
  const hora = limpio(fd.get('hora'), 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(hora)) return { error: 'Elegí un día y un horario.' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('reservar_turno', {
    p: {
      nombre: limpio(fd.get('nombre'), 120),
      telefono: limpio(fd.get('telefono'), 40),
      email: limpio(fd.get('email'), 160),
      motivo: limpio(fd.get('motivo'), 500),
      fecha,
      hora,
      reemplaza: limpio(fd.get('reemplaza'), 40) || null,
    },
  });
  if (error) return { error: error.message || 'No se pudo reservar. Probá de nuevo.' };
  redirect(`/turnos/${(data as { codigo: string }).codigo}?nuevo=1`);
}

export async function cancelarTurno(codigo: string): Promise<EstadoTurno> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('cancelar_turno', { p_codigo: codigo });
  if (error) return { error: error.message };
  redirect(`/turnos/${codigo}`);
}

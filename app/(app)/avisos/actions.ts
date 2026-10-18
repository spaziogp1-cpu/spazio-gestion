'use server';

import { revalidatePath } from 'next/cache';
import { miembroActual } from '@/lib/sesion';

export async function marcarLeidos(ids?: string[]): Promise<void> {
  const { miembro, supabase } = await miembroActual();
  let q = supabase.from('notificaciones').update({ leida_en: new Date().toISOString() }).eq('usuario_id', miembro.id).is('leida_en', null);
  if (ids?.length) q = q.in('id', ids);
  await q;
  revalidatePath('/', 'layout');
}

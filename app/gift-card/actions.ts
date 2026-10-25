'use server';

import { redirect } from 'next/navigation';
import { errorMonto } from '@/lib/giftcard';
import { leerMonto } from '@/lib/formato';
import { createClient } from '@/lib/supabase/server';

export type EstadoGift = { error?: string };

const limpio = (v: FormDataEntryValue | null, max = 200) => String(v ?? '').trim().slice(0, max);

export async function pedirGiftCard(_prev: EstadoGift, fd: FormData): Promise<EstadoGift> {
  // Campo oculto: si viene completo, es un robot.
  if (limpio(fd.get('sitio'))) return { error: 'No se pudo enviar el pedido.' };
  const monto = leerMonto(limpio(fd.get('monto'), 20));
  const errMonto = errorMonto(monto);
  if (errMonto) return { error: errMonto };
  if (!limpio(fd.get('para_email')) && !limpio(fd.get('para_telefono'))) {
    return { error: 'Escribí el email o el WhatsApp de quien la recibe, así se la mandamos.' };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('gc_crear_solicitud', {
    p: {
      monto,
      ocasion: limpio(fd.get('ocasion'), 30),
      para_nombre: limpio(fd.get('para_nombre'), 80),
      para_email: limpio(fd.get('para_email'), 160),
      para_telefono: limpio(fd.get('para_telefono'), 40),
      de_nombre: limpio(fd.get('de_nombre'), 80),
      dedicatoria: limpio(fd.get('dedicatoria'), 240),
      comprador_nombre: limpio(fd.get('comprador_nombre'), 120),
      comprador_email: limpio(fd.get('comprador_email'), 160),
      comprador_telefono: limpio(fd.get('comprador_telefono'), 40),
      fecha_inicio: limpio(fd.get('fecha_inicio'), 10) || null,
    },
  });
  if (error) return { error: error.message || 'No se pudo enviar el pedido. Probá de nuevo.' };
  redirect(`/gift-card/pedido/${(data as { token: string }).token}?nuevo=1`);
}

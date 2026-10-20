'use server';

import { miembroActual } from '@/lib/sesion';

type Resultado = { error?: string; ok?: string };

/** Clave pública para suscribir este dispositivo (se crea la primera vez). */
export async function clavePublicaPush(): Promise<{ clave?: string; error?: string }> {
  await miembroActual();
  try {
    const { crearAdmin } = await import('@/lib/supabase/admin');
    const { clavesVapid } = await import('@/lib/push/servicio');
    return { clave: (await clavesVapid(crearAdmin())).publica };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function guardarSuscripcion(s: { endpoint: string; p256dh: string; auth: string }, dispositivo: string): Promise<Resultado> {
  const { miembro, supabase } = await miembroActual();
  if (!/^https:\/\//.test(s.endpoint) || !s.p256dh || !s.auth) return { error: 'La suscripción no es válida.' };
  // Si el dispositivo ya estaba con otra persona (celular compartido), pasa a esta.
  const { crearAdmin } = await import('@/lib/supabase/admin');
  await crearAdmin().from('push_suscripciones').delete().eq('endpoint', s.endpoint).neq('usuario_id', miembro.id);
  const { error } = await supabase
    .from('push_suscripciones')
    .upsert({ usuario_id: miembro.id, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth, dispositivo: dispositivo.slice(0, 80) }, { onConflict: 'endpoint' });
  if (error) return { error: error.message.includes('push_suscripciones') ? 'Falta correr la migración 0018 en Supabase.' : error.message };
  return { ok: 'Notificaciones activadas en este dispositivo.' };
}

export async function quitarSuscripcion(endpoint: string): Promise<Resultado> {
  const { supabase } = await miembroActual();
  const { error } = await supabase.from('push_suscripciones').delete().eq('endpoint', endpoint);
  return error ? { error: error.message } : { ok: 'Notificaciones desactivadas en este dispositivo.' };
}

export async function mandarmePrueba(): Promise<Resultado> {
  const { miembro } = await miembroActual();
  try {
    const { crearAdmin } = await import('@/lib/supabase/admin');
    const { enviarAUsuario } = await import('@/lib/push/servicio');
    const r = await enviarAUsuario(
      crearAdmin(),
      miembro.id,
      { titulo: 'Prueba de Spazio', cuerpo: 'Así te van a llegar los reportes y los recordatorios.', url: '/avisos', tag: 'prueba' },
      { ttl: 600, urgencia: 'high' },
    );
    if (!r.enviados && !r.fallidos && !r.borrados) return { error: 'No tenés ningún dispositivo con las notificaciones activadas.' };
    if (r.fallidos) return { error: `Se mandó a ${r.enviados} de ${r.enviados + r.fallidos} dispositivos. Probá desactivar y volver a activar en el que no llegó.` };
    return { ok: `Enviada a ${r.enviados} ${r.enviados === 1 ? 'dispositivo' : 'dispositivos'}. Tendría que llegarte en unos segundos.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

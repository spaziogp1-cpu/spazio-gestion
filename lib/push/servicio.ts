import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { enviarPush, generarClavesVapid, type ClavesVapid, type Suscripcion } from './webpush';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = SupabaseClient<any, any, any>;

const CONTACTO = `mailto:${process.env.VAPID_CONTACTO || 'avisos@spaziodesign.net'}`;

/** Claves VAPID de la app: se crean la primera vez y quedan guardadas en la base (integraciones). */
export async function clavesVapid(db: Cliente): Promise<ClavesVapid> {
  const leer = async () => {
    const { data } = await db.from('integraciones').select('datos').eq('clave', 'push_vapid').maybeSingle();
    const d = data?.datos as Partial<ClavesVapid> | undefined;
    return d?.publica && d?.privada ? ({ publica: d.publica, privada: d.privada } as ClavesVapid) : null;
  };
  const hay = await leer();
  if (hay) return hay;
  // Si dos pedidos llegan a la vez, gana el primero y el otro relee.
  await db.from('integraciones').upsert({ clave: 'push_vapid', datos: generarClavesVapid() }, { onConflict: 'clave', ignoreDuplicates: true });
  const creadas = await leer();
  if (!creadas) throw new Error('No se pudieron guardar las claves de las notificaciones');
  return creadas;
}

type Aviso = { id: string; usuario_id: string; tipo: string; titulo: string; cuerpo: string | null; anulada_en: string | null; evento_id: string | null };

// Notificaciones con el mismo tag se reemplazan: un recordatorio por evento, un reporte por tipo.
function tagDe(a: Aviso) {
  if (a.tipo.startsWith('recordatorio')) return `rec-${a.evento_id ?? a.id}`;
  if (a.tipo.startsWith('reporte')) return a.tipo;
  return a.id;
}

function opcionesDe(a: Aviso) {
  if (a.tipo.startsWith('recordatorio')) return { ttl: 40 * 60, urgencia: 'high' as const, tema: `rec${(a.evento_id ?? a.id).replace(/-/g, '').slice(0, 29)}` };
  if (a.tipo.startsWith('reporte')) return { ttl: 6 * 3600, urgencia: 'normal' as const, tema: a.tipo.replace('_', '') };
  return { ttl: 24 * 3600, urgencia: 'normal' as const };
}

/** Manda un aviso a todos los dispositivos de su destinatario. Borra las suscripciones que ya no existen. */
export async function enviarAviso(db: Cliente, id: string): Promise<{ enviados: number; fallidos: number; borrados: number }> {
  const { data: a } = await db.from('notificaciones').select('id, usuario_id, tipo, titulo, cuerpo, anulada_en, evento_id').eq('id', id).maybeSingle();
  if (!a) return { enviados: 0, fallidos: 0, borrados: 0 };
  if (a.anulada_en) {
    // Un recordatorio reprogramado o cancelado reemplaza al que quedó en el celular (mismo tag).
    // Una tarea que se completó no necesita otra notificación.
    if (!a.tipo.startsWith('recordatorio') || a.cuerpo?.startsWith('Ya se completó')) return { enviados: 0, fallidos: 0, borrados: 0 };
    return enviarAUsuario(db, a.usuario_id, { titulo: `Cambió · ${a.titulo}`, cuerpo: a.cuerpo, url: `/avisos/abrir/${a.id}`, tag: tagDe(a as Aviso) }, { ttl: 3600, urgencia: 'normal' });
  }
  return enviarAUsuario(db, a.usuario_id, { titulo: a.titulo, cuerpo: a.cuerpo, url: `/avisos/abrir/${a.id}`, tag: tagDe(a as Aviso) }, opcionesDe(a as Aviso));
}

export async function enviarAUsuario(
  db: Cliente,
  usuarioId: string,
  datos: { titulo: string; cuerpo: string | null; url: string; tag?: string },
  opciones: { ttl?: number; urgencia?: 'normal' | 'high'; tema?: string } = {},
) {
  const { data: subs } = await db.from('push_suscripciones').select('id, endpoint, p256dh, auth').eq('usuario_id', usuarioId);
  if (!subs?.length) return { enviados: 0, fallidos: 0, borrados: 0 };
  const claves = await clavesVapid(db);
  let enviados = 0, fallidos = 0, borrados = 0;
  await Promise.all(
    (subs as (Suscripcion & { id: string })[]).map(async (s) => {
      const r = await enviarPush(s, datos, claves, { contacto: CONTACTO, ...opciones });
      if (r.ok) {
        enviados++;
        await db.from('push_suscripciones').update({ ultimo_envio: new Date().toISOString(), ultimo_error: null }).eq('id', s.id);
      } else if (r.vencida) {
        borrados++;
        await db.from('push_suscripciones').delete().eq('id', s.id);
      } else {
        fallidos++;
        await db.from('push_suscripciones').update({ ultimo_error: `${r.estado} ${r.error ?? ''}`.trim().slice(0, 300) }).eq('id', s.id);
      }
    }),
  );
  return { enviados, fallidos, borrados };
}

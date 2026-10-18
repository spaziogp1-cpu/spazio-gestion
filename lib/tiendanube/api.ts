import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrdenTN } from './mapeo';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = SupabaseClient<any, any, any>;

const API = 'https://api.tiendanube.com/v1';
const AGENTE = 'Spazio Gestion (teohuber998@gmail.com)';

export type Conexion = { store_id: string; access_token: string; scope?: string; desde: string; conectado_en: string };

export const appId = () => process.env.TIENDANUBE_APP_ID?.trim() || null;
const secreto = () => process.env.TIENDANUBE_CLIENT_SECRET?.trim() || null;
export const tiendanubeConfigurada = () => Boolean(appId() && secreto());

export async function leerConexion(db: Cliente): Promise<Conexion | null> {
  const { data } = await db.from('integraciones').select('datos').eq('clave', 'tiendanube').maybeSingle();
  const d = data?.datos as Conexion | undefined;
  return d?.access_token && d?.store_id ? d : null;
}

/** Verifica que el aviso venga de Tienda Nube (firma HMAC-SHA256 del cuerpo con el secreto de la app). */
export function firmaValida(cuerpo: string, firma: string | null): boolean {
  const s = secreto();
  if (!s || !firma) return false;
  const esperada = createHmac('sha256', s).update(cuerpo, 'utf8').digest('hex');
  const a = Buffer.from(esperada);
  const b = Buffer.from(firma.trim().toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function canjearCodigo(code: string): Promise<{ access_token: string; user_id: number | string; scope?: string }> {
  const r = await fetch('https://www.tiendanube.com/apps/authorize/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': AGENTE },
    body: JSON.stringify({ client_id: appId(), client_secret: secreto(), grant_type: 'authorization_code', code }),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; user_id?: number; error?: string; error_description?: string };
  if (!r.ok || !j.access_token || !j.user_id) throw new Error(`Tienda Nube no aceptó la conexión: ${j.error_description ?? j.error ?? r.status}`);
  return { access_token: j.access_token, user_id: j.user_id, scope: (j as { scope?: string }).scope };
}

async function tn<T>(c: Conexion, ruta: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}/${c.store_id}${ruta}`, {
    ...init,
    headers: {
      Authentication: `bearer ${c.access_token}`,
      Authorization: `Bearer ${c.access_token}`,
      'User-Agent': AGENTE,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  if (r.status === 401) throw new Error('Tienda Nube rechazó el permiso: volvé a conectar desde Ajustes');
  if (r.status === 404) throw new Error('Tienda Nube: no se encontró');
  if (!r.ok) throw new Error(`Tienda Nube ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

export const obtenerOrden = (c: Conexion, id: number | string) => tn<OrdenTN>(c, `/orders/${id}`);

export async function ordenesPagadasDesde(c: Conexion, desdeISO: string): Promise<OrdenTN[]> {
  const todas: OrdenTN[] = [];
  for (let page = 1; page <= 10; page++) {
    const q = new URLSearchParams({ payment_status: 'paid', created_at_min: desdeISO, per_page: '50', page: String(page) });
    let lote: OrdenTN[];
    try {
      lote = await tn<OrdenTN[]>(c, `/orders?${q}`);
    } catch (e) {
      // Tienda Nube responde 404 cuando la página ya no tiene resultados.
      if (e instanceof Error && e.message.includes('no se encontró')) break;
      throw e;
    }
    todas.push(...lote);
    if (lote.length < 50) break;
  }
  return todas;
}

/** Deja registrados los avisos de ventas pagadas y canceladas, apuntando a esta app. */
export async function registrarWebhooks(c: Conexion, urlBase: string): Promise<string[]> {
  const url = `${urlBase.replace(/\/$/, '')}/api/tiendanube/webhook`;
  const existentes = await tn<{ id: number; event: string; url: string }[]>(c, '/webhooks').catch(() => []);
  const hechos: string[] = [];
  for (const event of ['order/paid', 'order/cancelled']) {
    if (existentes.some((w) => w.event === event && w.url === url)) {
      hechos.push(event);
      continue;
    }
    // Si quedó uno viejo apuntando a otra dirección, se borra para no recibir duplicados.
    for (const w of existentes.filter((w) => w.event === event))
      await tn(c, `/webhooks/${w.id}`, { method: 'DELETE' }).catch(() => {});
    await tn(c, '/webhooks', { method: 'POST', body: JSON.stringify({ event, url }) });
    hechos.push(event);
  }
  return hechos;
}

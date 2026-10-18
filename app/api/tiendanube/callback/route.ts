import { NextResponse, type NextRequest } from 'next/server';
import { miembroActual } from '@/lib/sesion';
import { crearAdmin } from '@/lib/supabase/admin';
import { canjearCodigo, leerConexion, registrarWebhooks, tiendanubeConfigurada, type Conexion } from '@/lib/tiendanube/api';

export const dynamic = 'force-dynamic';

// Tienda Nube vuelve acá después de autorizar la app, con un código de un solo uso.
export async function GET(request: NextRequest) {
  const { miembro } = await miembroActual();
  const url = request.nextUrl;
  const volver = (mensaje: string) => {
    const a = new URL('/ajustes', url.origin);
    a.searchParams.set('tiendanube', mensaje);
    const res = NextResponse.redirect(a);
    res.cookies.delete('tn_state');
    return res;
  };

  if (miembro.rol !== 'admin') return volver('Solo un administrador puede conectar Tienda Nube');
  if (!tiendanubeConfigurada()) return volver('Faltan TIENDANUBE_APP_ID y TIENDANUBE_CLIENT_SECRET en Vercel');

  // La conexión tiene que haber empezado desde el botón de Ajustes de esta app.
  const cookie = request.cookies.get('tn_state')?.value;
  const state = url.searchParams.get('state');
  if (!cookie || (state && state !== cookie)) return volver('Volvé a tocar "Conectar con Tienda Nube" desde Ajustes');

  const code = url.searchParams.get('code');
  if (!code) return volver('Tienda Nube no devolvió el código de autorización');

  try {
    const t = await canjearCodigo(code);
    const db = crearAdmin();
    const anterior = await leerConexion(db);
    const ahora = new Date().toISOString();
    const conexion: Conexion = {
      store_id: String(t.user_id),
      access_token: t.access_token,
      scope: t.scope,
      // Desde cuándo se importan ventas: se mantiene si es la misma tienda.
      desde: anterior && anterior.store_id === String(t.user_id) ? anterior.desde : ahora,
      conectado_en: ahora,
    };
    const { error } = await db.from('integraciones').upsert({ clave: 'tiendanube', datos: conexion, actualizado_en: ahora });
    if (error) throw new Error(error.message);
    await registrarWebhooks(conexion, url.origin);
    return volver('ok');
  } catch (e) {
    return volver(e instanceof Error ? e.message : String(e));
  }
}

import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { miembroActual } from '@/lib/sesion';
import { appId } from '@/lib/tiendanube/api';

export const dynamic = 'force-dynamic';

// Botón "Conectar con Tienda Nube" de Ajustes: manda a autorizar la app en la tienda.
export async function GET(request: NextRequest) {
  const { miembro } = await miembroActual();
  const ajustes = new URL('/ajustes', request.nextUrl.origin);
  if (miembro.rol !== 'admin') return NextResponse.redirect(ajustes);
  const id = appId();
  if (!id) {
    ajustes.searchParams.set('tiendanube', 'Falta cargar TIENDANUBE_APP_ID en Vercel');
    return NextResponse.redirect(ajustes);
  }
  const state = randomBytes(16).toString('hex');
  const res = NextResponse.redirect(`https://www.tiendanube.com/apps/${id}/authorize?state=${state}`);
  res.cookies.set('tn_state', state, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/' });
  return res;
}

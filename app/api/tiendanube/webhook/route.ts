import { after, NextResponse, type NextRequest } from 'next/server';
import { crearAdmin } from '@/lib/supabase/admin';
import { firmaValida } from '@/lib/tiendanube/api';
import { avisarCancelacion, procesarOrden } from '@/lib/tiendanube/importar';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Tienda Nube avisa acá cada venta pagada o cancelada. Hay que responder en menos de 3 segundos,
// así que se contesta enseguida y el pedido se crea después.
export async function POST(request: NextRequest) {
  const cuerpo = await request.text();
  if (!firmaValida(cuerpo, request.headers.get('x-linkedstore-hmac-sha256'))) {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 });
  }
  let aviso: { event?: string; id?: number | string; store_id?: number | string };
  try {
    aviso = JSON.parse(cuerpo);
  } catch {
    return NextResponse.json({ ok: true });
  }
  const id = Number(aviso.id);
  if (Number.isFinite(id) && id > 0) {
    if (aviso.event === 'order/paid') after(() => procesarOrden(crearAdmin(), id).then(() => undefined));
    if (aviso.event === 'order/cancelled') after(() => avisarCancelacion(crearAdmin(), id));
  }
  // Otros avisos obligatorios de Tienda Nube (datos personales): la app no guarda nada aparte.
  return NextResponse.json({ ok: true });
}

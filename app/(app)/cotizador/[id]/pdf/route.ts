// PDF del presupuesto para el cliente. Solo lee datos que ve el cliente (nunca la foto del cálculo).
import { NextResponse } from 'next/server';
import { generarPresupuestoPdf, nombrePresupuesto } from '@/lib/cotizador/pdf';
import { CLAVES_PLAZO, leerPlazos, pedidoLlevaCromado, rangoDe, textoRango } from '@/lib/plazos';
import { miembroActual } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse('No encontrado', { status: 404 });
  const { supabase } = await miembroActual();

  const [{ data: p }, { data: its }, { data: prm }] = await Promise.all([
    supabase
      .from('cot_presupuestos')
      .select('numero, fecha, valido_hasta, cliente_nombre, cliente_telefono, subtotal, descuento_pct, descuento_monto, total, total_cuotas, condiciones, necesita_aprobacion, aprobado_por, vendedor:vendedor_id(nombre)')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('cot_presupuesto_items').select('titulo, detalle, cantidad, precio_unitario, total').eq('presupuesto_id', id).order('orden'),
    supabase.from('parametros').select('clave, valor').in('clave', Object.values(CLAVES_PLAZO)),
  ]);
  if (!p) return new NextResponse('No encontrado', { status: 404 });
  if (p.necesita_aprobacion && !p.aprobado_por) {
    return new NextResponse('El descuento de este presupuesto todavía no está aprobado.', { status: 409 });
  }

  const items = (its ?? []) as { titulo: string; detalle: string | null; cantidad: number; precio_unitario: number; total: number }[];
  const plazos = leerPlazos(new Map(((prm ?? []) as { clave: string; valor: string }[]).map((x) => [x.clave, x.valor])));
  const cromado = pedidoLlevaCromado(items.map((i) => ({ producto: i.titulo, material: i.detalle })));
  const vendedor = (Array.isArray(p.vendedor) ? p.vendedor[0] : p.vendedor) as { nombre?: string } | null;

  const bytes = await generarPresupuestoPdf({
    numero: p.numero,
    fecha: p.fecha,
    validoHasta: p.valido_hasta,
    cliente: p.cliente_nombre,
    telefono: p.cliente_telefono,
    vendedor: vendedor?.nombre ?? null,
    items: items.map((i) => ({ titulo: i.titulo, detalle: i.detalle, cantidad: i.cantidad, precioUnitario: Number(i.precio_unitario), total: Number(i.total) })),
    subtotal: Number(p.subtotal),
    descuentoPct: Number(p.descuento_pct),
    descuentoMonto: Number(p.descuento_monto),
    total: Number(p.total),
    totalCuotas: Number(p.total_cuotas),
    plazo: textoRango(rangoDe(cromado, plazos)),
    condiciones: p.condiciones,
  });

  const nombre = nombrePresupuesto(p.numero, p.cliente_nombre);
  const descargar = new URL(req.url).searchParams.has('descargar');
  const cuerpo = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new NextResponse(cuerpo, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${descargar ? 'attachment' : 'inline'}; filename="presupuesto-${p.numero}.pdf"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      'Cache-Control': 'private, no-store',
    },
  });
}

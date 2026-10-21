import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { puedeVerCostos } from '@/lib/cotizador/permisos';
import type { AjustesPiezas } from '@/lib/cotizador/tipos';
import { catalogoVenta, reglasPresupuesto } from '@/lib/cotizador/servicio';
import { miembroActual } from '@/lib/sesion';
import FormPresupuesto from '../../form-presupuesto';

export const metadata: Metadata = { title: 'Editar presupuesto' };

export default async function EditarPresupuestoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase } = await miembroActual();
  const [{ data: p }, { data: items }, verCostos, catalogo, reglas] = await Promise.all([
    supabase.from('cot_presupuestos').select('id, numero, estado, pedido_id, cliente_id, cliente_nombre, cliente_telefono, descuento_pct, observaciones').eq('id', id).maybeSingle(),
    supabase.from('cot_presupuesto_items').select('producto_id, valores, cantidad, cot_presupuesto_calculos(margen, resultado)').eq('presupuesto_id', id).order('orden'),
    puedeVerCostos(),
    catalogoVenta(),
    reglasPresupuesto(),
  ]);
  if (!p) notFound();
  if (p.pedido_id || p.estado === 'aprobado') redirect(`/cotizador/${id}`);
  type Calc = { margen: number; resultado: { piezas?: AjustesPiezas } | null };
  type Fila = { producto_id: string | null; valores: Record<string, number | string>; cantidad: number; cot_presupuesto_calculos: Calc | Calc[] | null };
  const calcDe = (f: Fila) => (Array.isArray(f.cot_presupuesto_calculos) ? f.cot_presupuesto_calculos[0] : f.cot_presupuesto_calculos);
  const margenDe = (f: Fila) => {
    const c = calcDe(f);
    return c ? Number(c.margen) : null;
  };
  const lista = ((items ?? []) as unknown as Fila[]).filter(
    (i) => i.producto_id && catalogo.productos.some((x) => x.id === i.producto_id),
  );
  return (
    <>
      <div className="cabecera">
        <div>
          <Link href={`/cotizador/${id}`} className="volver">
            ← Presupuesto {p.numero}
          </Link>
          <h1>Editar presupuesto {p.numero}</h1>
        </div>
      </div>
      <FormPresupuesto
        catalogo={catalogo}
        verCostos={verCostos}
        reglas={reglas}
        inicial={{
          id: p.id,
          cliente: { id: p.cliente_id, nombre: p.cliente_nombre, telefono: p.cliente_telefono },
          items: lista.map((i) => ({
            productoId: i.producto_id!,
            valores: i.valores,
            cantidad: i.cantidad,
            margen: verCostos ? margenDe(i) : null,
            piezas: verCostos ? (calcDe(i)?.resultado?.piezas ?? null) : null,
          })),
          descuentoPct: Number(p.descuento_pct),
          observaciones: p.observaciones,
        }}
      />
    </>
  );
}

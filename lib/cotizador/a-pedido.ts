import 'server-only';
// Del presupuesto al pedido: arma los datos para precargar "Nuevo pedido" y,
// cuando el pedido se guarda, deja el presupuesto vinculado y aprobado.
import { miembroActual } from '@/lib/sesion';
import { crearAdmin } from '@/lib/supabase/admin';
import type { Cliente } from '@/lib/tipos';
import { itemParaPedido, type ItemPedido } from './a-pedido-mapeo';
import { leerReceta } from './receta';

export type DatosPedido = {
  presupuestoId: string;
  numero: number;
  cliente: Cliente | null;
  nombre: string;
  telefono: string;
  items: ItemPedido[];
  total: number;
  observaciones: string;
};

export async function datosParaPedido(presupuestoId: string): Promise<{ error?: string; datos?: DatosPedido }> {
  if (!/^[0-9a-f-]{36}$/.test(presupuestoId)) return { error: 'Presupuesto inválido.' };
  // Con la sesión de quien usa la app: si no lo puede ver, no sigue.
  const { supabase } = await miembroActual();
  const { data: p } = await supabase
    .from('cot_presupuestos')
    .select('id, numero, cliente_id, cliente_nombre, cliente_telefono, total, observaciones, pedido_id, necesita_aprobacion, aprobado_por')
    .eq('id', presupuestoId)
    .maybeSingle();
  if (!p) return { error: 'No existe ese presupuesto.' };
  if (p.pedido_id) return { error: 'Ese presupuesto ya es un pedido.' };
  if (p.necesita_aprobacion && !p.aprobado_por) return { error: 'El descuento de ese presupuesto todavía no está aprobado.' };

  // Recetas y cálculos son datos de costos: se leen con la clave de servicio y
  // solo se usan para describir el producto (nada de costos llega al navegador).
  const db = crearAdmin();
  const [{ data: items }, { data: calcs }, { data: cliente }, { data: vals }] = await Promise.all([
    db
      .from('cot_presupuesto_items')
      .select('id, titulo, valores, cantidad, precio_unitario, cot_recetas(definicion), cot_productos(cot_categorias(nombre))')
      .eq('presupuesto_id', presupuestoId)
      .order('orden'),
    db.from('cot_presupuesto_calculos').select('item_id, resultado').eq('presupuesto_id', presupuestoId),
    p.cliente_id ? supabase.from('clientes').select('*').eq('id', p.cliente_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from('cot_atributo_valores').select('atributo, valor, etiqueta'),
  ]);
  const etiquetas: Record<string, Record<string, string>> = {};
  for (const v of (vals ?? []) as { atributo: string; valor: string; etiqueta: string }[]) (etiquetas[v.atributo] ??= {})[v.valor] = v.etiqueta;
  type Calc = { item_id: string; resultado: { lineas?: { unidad: string; insumo?: string; variante?: Record<string, string> }[] } };
  const vidrioDe = new Map(
    ((calcs ?? []) as Calc[]).map((c) => [
      c.item_id,
      c.resultado.lineas?.find((l) => l.unidad === 'm2' && l.insumo?.startsWith('vidrio'))?.variante ?? null,
    ]),
  );
  type Fila = {
    id: string;
    titulo: string;
    valores: Record<string, number | string>;
    cantidad: number;
    precio_unitario: number;
    cot_recetas: { definicion: unknown } | null;
    cot_productos: { cot_categorias: { nombre: string } | null } | null;
  };
  const lista = ((items ?? []) as unknown as Fila[]).map((i) =>
    itemParaPedido({
      titulo: i.titulo,
      categoria: i.cot_productos?.cot_categorias?.nombre ?? null,
      receta: i.cot_recetas ? leerReceta(i.cot_recetas.definicion) : null,
      valores: i.valores ?? {},
      etiquetas,
      vidrio: vidrioDe.get(i.id),
      precio: Number(i.precio_unitario),
      cantidad: i.cantidad,
    }),
  );
  return {
    datos: {
      presupuestoId: p.id,
      numero: p.numero,
      cliente: (cliente as Cliente | null) ?? null,
      nombre: p.cliente_nombre,
      telefono: p.cliente_telefono ?? '',
      items: lista,
      total: Number(p.total),
      observaciones: [`Presupuesto N° ${p.numero}`, p.observaciones].filter(Boolean).join('\n'),
    },
  };
}

/** Deja el presupuesto aprobado y apuntando al pedido creado. */
export async function vincularPresupuesto(presupuestoId: string, pedidoId: string): Promise<void> {
  const { miembro, supabase } = await miembroActual();
  const { data: visible } = await supabase.from('cot_presupuestos').select('id').eq('id', presupuestoId).maybeSingle();
  if (!visible) return;
  const { error } = await crearAdmin(miembro.email)
    .from('cot_presupuestos')
    .update({ pedido_id: pedidoId, estado: 'aprobado' })
    .eq('id', presupuestoId)
    .is('pedido_id', null);
  if (error) throw new Error(error.message);
}

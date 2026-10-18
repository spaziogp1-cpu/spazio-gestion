import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { HOJA_VENTAS, estadoPlanilla, fechaPlanilla, filasDelPedido, filasPedido, type PedidoParaPlanilla } from './filas';
import { escribir, escribirVarios, leer, planillaConfigurada } from './google';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = SupabaseClient<any, any, any>;

async function cargar(db: Cliente, pedidoId: string): Promise<PedidoParaPlanilla | null> {
  const { data: p } = await db.from('pedidos_resumen').select('*').eq('id', pedidoId).maybeSingle();
  if (!p) return null;
  const [{ data: c }, { data: items }, { data: resp }] = await Promise.all([
    db.from('clientes').select('*').eq('id', p.cliente_id).single(),
    db.from('pedido_items').select('*').eq('pedido_id', pedidoId).order('orden'),
    p.responsable_id ? db.from('equipo').select('alias_planilla, nombre').eq('id', p.responsable_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return {
    ...p,
    total: Number(p.total),
    precio_envio_cliente: Number(p.precio_envio_cliente),
    pagado: Number(p.pagado),
    vendedor: resp ? (resp.alias_planilla ?? resp.nombre) : null,
    cliente: c,
    items: (items ?? []).map((i: Record<string, unknown>) => ({ ...i, precio: i.precio == null ? null : Number(i.precio) })),
  } as PedidoParaPlanilla;
}

async function registrar(db: Cliente, pedidoId: string, cambios: Record<string, unknown>) {
  const { data: actual } = await db.from('planilla_sync').select('intentos').eq('pedido_id', pedidoId).maybeSingle();
  await db.from('planilla_sync').upsert({ pedido_id: pedidoId, intentos: (actual?.intentos ?? 0) + 1, ...cambios });
}

/** Deja anotado que un pedido nuevo tiene que ir a la planilla (aunque todavía no esté configurada). */
export async function anotarPendiente(db: Cliente, pedidoId: string): Promise<void> {
  await db.from('planilla_sync').upsert({ pedido_id: pedidoId, estado: 'pendiente' }, { onConflict: 'pedido_id', ignoreDuplicates: true });
}

/** Escribe un pedido nuevo en VENTAS_2026, una fila por producto. No duplica si ya está. */
export async function agregarPedido(db: Cliente, pedidoId: string): Promise<{ ok: boolean; error?: string }> {
  if (!planillaConfigurada()) return { ok: false, error: 'Planilla sin configurar' };
  try {
    const p = await cargar(db, pedidoId);
    if (!p) return { ok: false, error: 'Pedido no encontrado' };
    const [B, D, A] = await Promise.all([leer(`${HOJA_VENTAS}!B:B`), leer(`${HOJA_VENTAS}!D:D`), leer(`${HOJA_VENTAS}!A:A`)]);
    const existentes = filasDelPedido(B, D, p.numero, p.cliente.nombre);
    if (existentes.length) {
      await registrar(db, pedidoId, { estado: 'ok', filas: existentes.length, error: null, sincronizado_en: new Date().toISOString() });
      return { ok: true };
    }
    const filas = filasPedido(p);
    const desde = Math.max(A.length, B.length) + 1;
    await escribir(`${HOJA_VENTAS}!A${desde}:AJ${desde + filas.length - 1}`, filas);
    await registrar(db, pedidoId, { estado: 'ok', filas: filas.length, error: null, sincronizado_en: new Date().toISOString() });
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await registrar(db, pedidoId, { estado: 'error', error }).catch(() => {});
    return { ok: false, error };
  }
}

/** Actualiza ESTADO y FECHA REAL DE ENTREGA de un pedido que ya está en la planilla. */
export async function actualizarPedido(db: Cliente, pedidoId: string): Promise<void> {
  if (!planillaConfigurada()) return;
  try {
    const p = await cargar(db, pedidoId);
    if (!p) return;
    const [B, D] = await Promise.all([leer(`${HOJA_VENTAS}!B:B`), leer(`${HOJA_VENTAS}!D:D`)]);
    const filas = filasDelPedido(B, D, p.numero, p.cliente.nombre);
    await escribirVarios(
      filas.flatMap((f) => [
        { range: `${HOJA_VENTAS}!K${f}`, values: [[estadoPlanilla(p.etapa)]] },
        { range: `${HOJA_VENTAS}!AD${f}`, values: [[fechaPlanilla(p.fecha_entrega_real)]] },
      ]),
    );
  } catch (e) {
    console.error('planilla: actualizar', pedidoId, e);
  }
}

/** Reintenta los pedidos que quedaron sin escribir. */
export async function sincronizarPendientes(db: Cliente): Promise<{ ok: number; error: number }> {
  if (!planillaConfigurada()) return { ok: 0, error: 0 };
  const { data } = await db.from('planilla_sync').select('pedido_id').in('estado', ['pendiente', 'error']).lt('intentos', 6).order('creado_en').limit(30);
  let ok = 0;
  let error = 0;
  for (const fila of data ?? []) {
    const r = await agregarPedido(db, fila.pedido_id);
    if (r.ok) ok++;
    else error++;
  }
  return { ok, error };
}

export async function probarConexion(): Promise<string> {
  const filas = await leer(`${HOJA_VENTAS}!A1:B1`);
  return filas[0]?.join(' · ') ?? '(vacío)';
}

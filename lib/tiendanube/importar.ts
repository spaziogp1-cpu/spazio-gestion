import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { calcularFechaLimite } from '@/lib/fechas';
import { leerReglaPlazo } from '@/lib/parametros';
import { agregarPedido as agregarAPlanilla, anotarPendiente } from '@/lib/planilla/sync';
import { leerConexion, obtenerOrden, ordenesPagadasDesde } from './api';
import { pedidoDesdeOrden, type OrdenTN } from './mapeo';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = SupabaseClient<any, any, any>;

export type Resultado = { estado: 'creado' | 'vinculado' | 'sin_pagar' | 'error' | 'omitido'; detalle?: string; pedidoId?: string };

const ultimos8 = (t: string | null | undefined) => (t ?? '').replace(/\D/g, '').slice(-8);
const masDias = (f: string, d: number) => {
  const x = new Date(`${f}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
};

/** Toma la orden para procesarla. Devuelve false si ya está hecha o la está procesando otro aviso. */
async function tomar(db: Cliente, ordenId: number, numero: number | null): Promise<boolean> {
  const ahora = new Date().toISOString();
  const { error } = await db.from('tiendanube_ordenes').insert({ orden_id: ordenId, numero, estado: 'procesando', intentos: 1, procesado_en: ahora });
  if (!error) return true;
  if (error.code !== '23505') throw new Error(error.message);

  const { data: fila } = await db.from('tiendanube_ordenes').select('estado, intentos, procesado_en').eq('orden_id', ordenId).single();
  if (!fila || fila.estado === 'creado' || fila.estado === 'vinculado') return false;
  if (fila.estado === 'procesando' && fila.procesado_en && Date.now() - new Date(fila.procesado_en).getTime() < 3 * 60_000) return false;
  const { data: tomada } = await db
    .from('tiendanube_ordenes')
    .update({ estado: 'procesando', intentos: (fila.intentos ?? 0) + 1, procesado_en: ahora, numero: numero ?? undefined })
    .eq('orden_id', ordenId)
    .eq('estado', fila.estado)
    .select('orden_id');
  return Boolean(tomada?.length);
}

async function marcar(db: Cliente, ordenId: number, estado: string, detalle: string | null, pedidoId?: string) {
  await db
    .from('tiendanube_ordenes')
    .update({ estado, detalle, procesado_en: new Date().toISOString(), ...(pedidoId ? { pedido_id: pedidoId } : {}) })
    .eq('orden_id', ordenId);
}

async function avisarEquipo(db: Cliente, tipo: string, titulo: string, cuerpo: string | null, link: string, clave: string) {
  const { data: equipo } = await db.from('equipo').select('id').eq('activo', true);
  const filas = (equipo ?? []).map((m: { id: string }) => ({ usuario_id: m.id, tipo, titulo, cuerpo, link, clave: `${clave}:${m.id}` }));
  if (filas.length) await db.from('notificaciones').upsert(filas, { onConflict: 'clave', ignoreDuplicates: true });
}

/** Busca un pedido cargado a mano para la misma venta (mismo cliente, canal Tienda Nube, fechas cercanas). */
async function buscarCargadoAMano(db: Cliente, email: string | null, telefono: string | null, fecha: string) {
  const { data } = await db
    .from('pedidos')
    .select('id, numero, clientes!inner(email, telefono)')
    .eq('canal', 'tiendanube')
    .is('tiendanube_id', null)
    .neq('etapa', 'cancelado')
    .gte('fecha_venta', masDias(fecha, -4))
    .lte('fecha_venta', masDias(fecha, 4));
  const mail = email?.trim().toLowerCase();
  const tel = ultimos8(telefono);
  return ((data ?? []) as unknown as { id: string; numero: number; clientes: { email: string | null; telefono: string | null } }[]).find(
    (p) => (mail && p.clientes.email?.trim().toLowerCase() === mail) || (tel.length === 8 && ultimos8(p.clientes.telefono) === tel),
  );
}

/**
 * Convierte una venta de Tienda Nube en pedido. Es seguro llamarla varias veces con la misma
 * orden (Tienda Nube puede mandar el aviso repetido): nunca crea dos pedidos.
 */
export async function procesarOrden(db: Cliente, ordenId: number, yaLeida?: OrdenTN): Promise<Resultado> {
  if (!(await tomar(db, ordenId, yaLeida?.number ?? null))) return { estado: 'omitido' };
  try {
    const conexion = await leerConexion(db);
    if (!conexion) throw new Error('Tienda Nube no está conectada');
    const orden = yaLeida ?? (await obtenerOrden(conexion, ordenId));
    if (orden.number) await db.from('tiendanube_ordenes').update({ numero: orden.number }).eq('orden_id', ordenId);

    if (orden.payment_status !== 'paid' || orden.status === 'cancelled') {
      const det = orden.status === 'cancelled' ? 'Cancelada en Tienda Nube' : `Pago: ${orden.payment_status ?? 'sin dato'}`;
      await marcar(db, ordenId, 'sin_pagar', det);
      return { estado: 'sin_pagar', detalle: det };
    }

    const { data: ya } = await db.from('pedidos').select('id, numero').eq('tiendanube_id', String(orden.id)).maybeSingle();
    if (ya) {
      await marcar(db, ordenId, 'vinculado', `Ya estaba como pedido #${ya.numero}`, ya.id);
      return { estado: 'vinculado', pedidoId: ya.id };
    }

    const datos = pedidoDesdeOrden(orden);

    const manual = await buscarCargadoAMano(db, datos.cliente.email, datos.cliente.telefono, datos.fecha_venta);
    if (manual) {
      await db.from('pedidos').update({ tiendanube_id: datos.tiendanube_id }).eq('id', manual.id);
      await marcar(db, ordenId, 'vinculado', `Ya estaba cargado a mano como #${manual.numero}`, manual.id);
      return { estado: 'vinculado', pedidoId: manual.id, detalle: `#${manual.numero}` };
    }

    const { regla, feriados } = await leerReglaPlazo(db as never);
    const fecha_limite = calcularFechaLimite(datos.fecha_venta, regla, new Set(feriados));
    // Las tareas automáticas del pedido quedan a cargo del administrador.
    const { data: encargado } = await db.from('equipo').select('id').eq('activo', true).eq('rol', 'admin').order('creado_en').limit(1).maybeSingle();

    const { data: pedidoId, error } = await db.rpc('crear_pedido_externo', {
      p: { ...datos, fecha_limite, creado_por: encargado?.id ?? null },
    });
    if (error || !pedidoId) throw new Error(error?.message ?? 'No se pudo crear el pedido');

    await marcar(db, ordenId, 'creado', null, pedidoId);

    const { data: nuevo } = await db.from('pedidos').select('numero').eq('id', pedidoId).single();
    await avisarEquipo(
      db,
      'venta_tiendanube',
      `Venta en Tienda Nube: #${nuevo?.numero ?? ''} ${datos.cliente.nombre}`,
      datos.items.map((i) => `${i.cantidad > 1 ? `${i.cantidad} × ` : ''}${i.producto}${i.modelo ? ` ${i.modelo}` : ''}`).join(' · '),
      `/pedidos/${pedidoId}`,
      `tnventa:${orden.id}`,
    );

    await anotarPendiente(db, pedidoId).catch(() => {});
    await agregarAPlanilla(db, pedidoId).catch((e) => console.error('planilla tn', e));
    return { estado: 'creado', pedidoId };
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e);
    await marcar(db, ordenId, 'error', detalle).catch(() => {});
    return { estado: 'error', detalle };
  }
}

/** Avisa al equipo cuando una venta que ya es pedido se cancela en Tienda Nube. No cancela nada solo. */
export async function avisarCancelacion(db: Cliente, ordenId: number): Promise<void> {
  const { data: p } = await db.from('pedidos').select('id, numero, etapa').eq('tiendanube_id', String(ordenId)).maybeSingle();
  if (!p || p.etapa === 'cancelado') return;
  await avisarEquipo(db, 'venta_cancelada', `Cancelada en Tienda Nube: pedido #${p.numero}`, 'Revisá si hay que frenar el pedido al proveedor.', `/pedidos/${p.id}`, `tncancel:${ordenId}`);
}

/** Trae las ventas pagadas desde una fecha y crea las que falten (reintento diario y botón de Ajustes). */
export async function importarDesde(db: Cliente, desde?: string): Promise<{ revisadas: number; creadas: number; vinculadas: number; errores: string[] }> {
  const conexion = await leerConexion(db);
  if (!conexion) return { revisadas: 0, creadas: 0, vinculadas: 0, errores: [] };
  // Nunca antes del día en que se conectó, para no duplicar ventas viejas.
  const inicio = desde && desde > conexion.desde ? desde : conexion.desde;
  const ordenes = await ordenesPagadasDesde(conexion, inicio);

  const ids = ordenes.map((o) => o.id);
  const { data: hechas } = ids.length
    ? await db.from('tiendanube_ordenes').select('orden_id').in('orden_id', ids).in('estado', ['creado', 'vinculado'])
    : { data: [] };
  const listas = new Set((hechas ?? []).map((h: { orden_id: number }) => Number(h.orden_id)));

  const r = { revisadas: ordenes.length, creadas: 0, vinculadas: 0, errores: [] as string[] };
  for (const o of ordenes.filter((o) => !listas.has(Number(o.id)))) {
    const x = await procesarOrden(db, o.id, o);
    if (x.estado === 'creado') r.creadas++;
    else if (x.estado === 'vinculado') r.vinculadas++;
    else if (x.estado === 'error') r.errores.push(`#${o.number ?? o.id}: ${x.detalle}`);
  }
  return r;
}

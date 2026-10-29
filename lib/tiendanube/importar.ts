import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { calcularFechaLimite } from '@/lib/fechas';
import { leerReglaPlazo } from '@/lib/parametros';
import { agregarPedido as agregarAPlanilla, anotarPendiente } from '@/lib/planilla/sync';
import { generarRemito } from '@/lib/remitos/servicio';
import { leerConexion, obtenerOrden, ordenesPagadasDesde } from './api';
import { pagoMarcadoDespues, pedidoDesdeOrden, type OrdenTN } from './mapeo';

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

const soloDigitos = (t: string | null | undefined) => (t ?? '').replace(/\D/g, '');

/**
 * Busca un pedido ya cargado (a mano o desde la planilla) para la misma venta: mismo cliente
 * (email, teléfono o DNI) y fecha de venta cercana a la compra en Tienda Nube.
 * `amplio`: para un pago marcado al entregar, mira más días y cualquier canal, porque ahí
 * la venta seguro ya está cargada y solo hace falta encontrarla.
 */
async function buscarCargado(
  db: Cliente,
  cliente: { email: string | null; telefono: string | null; dni: string | null },
  fecha: string,
  amplio = false,
) {
  let q = db
    .from('pedidos')
    .select('id, numero, clientes!inner(email, telefono, dni)')
    .is('tiendanube_id', null)
    .neq('etapa', 'cancelado')
    .gte('fecha_venta', masDias(fecha, amplio ? -10 : -4))
    .lte('fecha_venta', masDias(fecha, amplio ? 10 : 4));
  if (!amplio) q = q.eq('canal', 'tiendanube');
  const { data } = await q;
  const mail = cliente.email?.trim().toLowerCase();
  const tel = ultimos8(cliente.telefono);
  const dni = soloDigitos(cliente.dni);
  return ((data ?? []) as unknown as { id: string; numero: number; clientes: { email: string | null; telefono: string | null; dni: string | null } }[]).find(
    (p) =>
      (mail && p.clientes.email?.trim().toLowerCase() === mail) ||
      (tel.length === 8 && ultimos8(p.clientes.telefono) === tel) ||
      (dni.length >= 7 && soloDigitos(p.clientes.dni) === dni),
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

    // Pago marcado al entregar (transferencia con seña) o compra anterior a la conexión:
    // la venta ya fue cargada, así que nunca se crea un pedido nuevo.
    const anterior = Boolean(orden.created_at && new Date(orden.created_at).getTime() < new Date(conexion.desde).getTime());
    const yaCargada = pagoMarcadoDespues(orden) || anterior;

    const manual = await buscarCargado(db, datos.cliente, datos.fecha_venta, yaCargada);
    if (manual) {
      // Solo se vincula: no se tocan pagos, etapa ni productos del pedido que ya existe.
      await db.from('pedidos').update({ tiendanube_id: datos.tiendanube_id }).eq('id', manual.id);
      await marcar(db, ordenId, 'vinculado', `Ya estaba cargado como #${manual.numero}`, manual.id);
      return { estado: 'vinculado', pedidoId: manual.id, detalle: `#${manual.numero}` };
    }

    if (yaCargada) {
      const det = anterior
        ? 'Compra anterior a la conexión con la app: no se creó un pedido nuevo'
        : 'Pago marcado al entregar: no se creó un pedido nuevo y no se encontró el pedido original';
      await marcar(db, ordenId, 'sin_pagar', det);
      await avisarEquipo(
        db,
        'venta_tiendanube',
        `Pago recibido en Tienda Nube #${orden.number ?? orden.id} (${datos.cliente.nombre})`,
        'No se cargó como venta nueva porque se marcó pagada después de la compra. No encontré el pedido original para vincularlo: revisá que esté cargado.',
        '/pedidos',
        `tnpagotarde:${orden.id}`,
      );
      return { estado: 'sin_pagar', detalle: det };
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
    await generarRemito(pedidoId, { quien: 'Tienda Nube' }).catch((e) => console.error('remito tn', e));
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

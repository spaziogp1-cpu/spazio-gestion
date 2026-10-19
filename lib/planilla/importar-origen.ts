import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { calcularFechaLimite } from '@/lib/fechas';
import { leerReglaPlazo } from '@/lib/parametros';
import { HOJA_VENTAS } from './filas';
import { leerOrigen, planillaConfigurada } from './google';
import { normalizarNombre, ventasDesdeFilas, type VentaPlanilla } from './origen';
import { agregarPedido as agregarACopia, anotarPendiente } from './sync';

// Trae a la app las ventas que el equipo carga a mano en la planilla original.
// Cada venta nueva se crea como pedido (con sus tareas y avisos) y la app la escribe en la copia.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = SupabaseClient<any, any, any>;
type Existente = { id: string; numero: number; fecha_venta: string; clientes: { nombre: string; email: string | null; telefono: string | null } };

export type ResultadoOrigen = { revisadas: number; creadas: string[]; vinculadas: number; errores: string[]; pendientes: number };

const ultimos8 = (t: string | null | undefined) => (t ?? '').replace(/\D/g, '').slice(-8);
const masDias = (f: string, d: number) => {
  const x = new Date(`${f}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
};

/** Mismo nombre, o todas las palabras del más corto están en el otro (mínimo dos). */
export function mismoNombre(a: string, b: string): boolean {
  const na = normalizarNombre(a);
  const nb = normalizarNombre(b);
  if (na === nb) return true;
  const ta = na.split(' ');
  const tb = nb.split(' ');
  const [corto, largo] = ta.length <= tb.length ? [ta, new Set(tb)] : [tb, new Set(ta)];
  return corto.length >= 2 && corto.every((t) => largo.has(t));
}

function yaEstaEnLaApp(v: VentaPlanilla, cercanos: Existente[]): Existente | undefined {
  const mail = v.cliente.email;
  const tel = ultimos8(v.cliente.telefono);
  return (
    // Mismo número y mismo cliente (las ventas que ya se importaron de la planilla).
    cercanos.find((p) => v.numero != null && p.numero === v.numero && mismoNombre(p.clientes.nombre, v.cliente.nombre)) ??
    // Misma persona, pocos días de diferencia (cargada a mano en la app o llegada de Tienda Nube).
    cercanos.find(
      (p) =>
        Math.abs(new Date(p.fecha_venta).getTime() - new Date(v.fecha_venta).getTime()) <= 4 * 86400000 &&
        ((mail && p.clientes.email?.toLowerCase() === mail) || (tel.length === 8 && ultimos8(p.clientes.telefono) === tel) || mismoNombre(p.clientes.nombre, v.cliente.nombre)),
    )
  );
}

export async function importarDeOriginal(db: Cliente, opciones: { simular?: boolean; maximo?: number } = {}): Promise<ResultadoOrigen> {
  const r: ResultadoOrigen = { revisadas: 0, creadas: [], vinculadas: 0, errores: [], pendientes: 0 };
  if (!planillaConfigurada()) return r;

  const { data: param } = await db.from('parametros').select('valor').eq('clave', 'planilla_origen_desde').maybeSingle();
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(param?.valor ?? '') ? param!.valor : '2026-10-15';

  const filas = await leerOrigen(`${HOJA_VENTAS}!A1:AJ5000`);
  const ventas = ventasDesdeFilas(filas, desde);
  r.revisadas = ventas.length;
  if (!ventas.length) return r;

  const { data: hechas } = await db.from('planilla_origen').select('clave').in('estado', ['creado', 'vinculado']);
  const listas = new Set((hechas ?? []).map((h: { clave: string }) => h.clave));
  const nuevas = ventas.filter((v) => !listas.has(v.clave));
  r.pendientes = nuevas.length;
  if (!nuevas.length) return r;

  // Pedidos de la app en el mismo período, para no duplicar.
  const { data: cercanosData } = await db
    .from('pedidos')
    .select('id, numero, fecha_venta, clientes!inner(nombre, email, telefono)')
    .gte('fecha_venta', masDias(desde, -5));
  const cercanos = (cercanosData ?? []) as unknown as Existente[];

  const [{ data: equipo }, { regla, feriados }] = await Promise.all([
    db.from('equipo').select('id, nombre, alias_planilla, rol, activo, creado_en').order('creado_en'),
    leerReglaPlazo(db as never),
  ]);
  const miembros = (equipo ?? []) as { id: string; nombre: string; alias_planilla: string | null; rol: string; activo: boolean }[];
  const encargado = miembros.find((m) => m.rol === 'admin' && m.activo)?.id ?? null;
  const vendedorId = (alias: string | null) => {
    if (!alias) return null;
    const a = normalizarNombre(alias);
    return miembros.find((m) => normalizarNombre(m.alias_planilla ?? '') === a || normalizarNombre(m.nombre).split(' ')[0] === a)?.id ?? null;
  };

  for (const v of nuevas.slice(0, opciones.maximo ?? 25)) {
    const registro = { clave: v.clave, numero_planilla: v.numero, filas: v.filas.join(',') };
    try {
      const existente = yaEstaEnLaApp(v, cercanos);
      if (existente) {
        r.vinculadas++;
        if (!opciones.simular)
          await db.from('planilla_origen').upsert({ ...registro, pedido_id: existente.id, estado: 'vinculado', detalle: `Ya estaba como #${existente.numero}` });
        continue;
      }
      if (opciones.simular) {
        r.creadas.push(`#${v.numero ?? '?'} ${v.cliente.nombre}`);
        continue;
      }

      const { data: pedidoId, error } = await db.rpc('crear_pedido_externo', {
        p: {
          numero: v.numero,
          tipo_venta: v.tipo_venta,
          canal: v.canal,
          responsable_id: vendedorId(v.vendedor),
          fecha_venta: v.fecha_venta,
          fecha_limite: v.fecha_limite ?? calcularFechaLimite(v.fecha_venta, regla, new Set(feriados)),
          envio: v.envio,
          forma_pago: v.forma_pago,
          total: v.total,
          sena: v.sena,
          precio_envio_cliente: v.precio_envio_cliente,
          observaciones: v.observaciones,
          pauta: v.pauta,
          campana: v.campana,
          dm_inbound: v.dm_inbound,
          cliente: v.cliente,
          items: v.items,
          creado_por: encargado,
          nota_pago: 'Cargado en la planilla',
        },
      });
      if (error || !pedidoId) throw new Error(error?.message ?? 'No se pudo crear el pedido');

      const { data: nuevo } = await db.from('pedidos').select('id, numero, observaciones').eq('id', pedidoId).single();
      const cambios: Record<string, unknown> = {};
      if (v.etapa !== 'senado') cambios.etapa = v.etapa;
      if (v.etapa === 'entregado') cambios.fecha_entrega_real = v.fecha_entrega_real ?? v.fecha_venta;
      if (v.numero && nuevo && nuevo.numero !== v.numero)
        cambios.observaciones = [nuevo.observaciones, `En la planilla original figura como #${v.numero} (ese número ya estaba usado en la app).`].filter(Boolean).join('\n');
      if (Object.keys(cambios).length) await db.from('pedidos').update(cambios).eq('id', pedidoId);

      await db.from('planilla_origen').upsert({ ...registro, pedido_id: pedidoId, estado: 'creado', detalle: null });
      cercanos.push({ id: pedidoId, numero: nuevo?.numero ?? 0, fecha_venta: v.fecha_venta, clientes: { nombre: v.cliente.nombre, email: v.cliente.email, telefono: v.cliente.telefono } });
      r.creadas.push(`#${nuevo?.numero ?? '?'} ${v.cliente.nombre}`);

      await anotarPendiente(db, pedidoId).catch(() => {});
      await agregarACopia(db, pedidoId).catch((e) => console.error('copia', e));
    } catch (e) {
      const detalle = e instanceof Error ? e.message : String(e);
      r.errores.push(`#${v.numero ?? '?'} ${v.cliente.nombre}: ${detalle}`);
      if (!opciones.simular) await db.from('planilla_origen').upsert({ ...registro, estado: 'error', detalle }).then(() => undefined, () => undefined);
    }
  }
  return r;
}

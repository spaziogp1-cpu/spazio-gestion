import { ETAPAS_ACTIVAS } from '@/lib/constantes';
import { hoyAR, sumarDiasCorridos } from '@/lib/fechas';
import { calcularAvances, type Avance } from '@/lib/objetivos';
import type { Objetivo, PedidoProveedor, PedidoResumen, Tarea, Visita } from '@/lib/tipos';
import type { SupabaseClient } from '@supabase/supabase-js';

export type Resumen = {
  hoy: string;
  tareasVencidas: Tarea[];
  tareasHoy: Tarea[];
  tareasProximas: Tarea[];
  visitasHoy: Visita[];
  entregasHoy: PedidoResumen[];
  entregasSemana: PedidoResumen[];
  atrasados: PedidoResumen[];
  porVencer: PedidoResumen[];
  listasSinAvisar: PedidoResumen[];
  saldos: PedidoResumen[];
  proveedoresDemorados: PedidoProveedor[];
  objetivos: Avance[];
};

/**
 * Arma el resumen del día. Con `miembroId` es "Mi día" (lo de esa persona);
 * sin él, la vista general de todo el negocio.
 * Funciona con el cliente del usuario o con el cliente de servicio (proceso diario).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function armarResumen(supabase: SupabaseClient<any, any, any>, miembroId: string | null, avisoDias = 3): Promise<Resumen> {
  const hoy = hoyAR();
  const en3 = sumarDiasCorridos(hoy, 3);
  const en7 = sumarDiasCorridos(hoy, 6);

  let tareasQ = supabase.from('tareas_resumen').select('*').neq('estado', 'hecha').lte('vencimiento', en3);
  if (miembroId) tareasQ = tareasQ.or(`responsable_id.eq.${miembroId},responsable_id.is.null`);
  let visitasQ = supabase.from('visitas').select('*').eq('fecha', hoy).in('estado', ['agendada', 'confirmada', 'vino']).order('hora');
  if (miembroId) visitasQ = visitasQ.eq('atiende_id', miembroId);

  const [tareasR, visitasR, pedidosR, provR, objR] = await Promise.all([
    tareasQ.order('vencimiento').order('prioridad'),
    visitasQ,
    supabase.from('pedidos_resumen').select('*').in('etapa', [...ETAPAS_ACTIVAS, 'entregado']).order('fecha_limite'),
    supabase.from('proveedor_pendientes').select('*').eq('estado', 'pedido').lt('fecha_esperada', hoy).order('fecha_esperada'),
    supabase.from('objetivos').select('*').eq('estado', 'activo'),
  ]);

  const tareas = (tareasR.data ?? []) as Tarea[];
  const todos = (pedidosR.data ?? []) as PedidoResumen[];
  const mios = miembroId ? todos.filter((p) => p.responsable_id === miembroId) : todos;
  const activos = mios.filter((p) => p.etapa !== 'entregado');
  const objetivos = ((objR.data ?? []) as Objetivo[]).filter((o) => !miembroId || !o.responsable_id || o.responsable_id === miembroId);

  return {
    hoy,
    tareasVencidas: tareas.filter((t) => t.vencimiento && t.vencimiento < hoy),
    tareasHoy: tareas.filter((t) => t.vencimiento === hoy),
    tareasProximas: tareas.filter((t) => t.vencimiento && t.vencimiento > hoy),
    visitasHoy: (visitasR.data ?? []) as Visita[],
    // Las entregas se muestran a todos: cualquiera puede tener que estar.
    entregasHoy: todos.filter((p) => p.etapa !== 'entregado' && p.fecha_entrega_programada === hoy),
    entregasSemana: todos.filter(
      (p) => p.etapa !== 'entregado' && p.fecha_entrega_programada && p.fecha_entrega_programada > hoy && p.fecha_entrega_programada <= en7,
    ),
    atrasados: activos.filter((p) => p.atrasado),
    porVencer: activos.filter(
      (p) => !p.atrasado && ['senado', 'en_fabricacion'].includes(p.etapa) && p.dias_restantes >= 0 && p.dias_restantes <= avisoDias,
    ),
    listasSinAvisar: activos.filter((p) => p.etapa === 'lista'),
    saldos: mios.filter((p) => Number(p.saldo) > 0 && ['lista', 'cliente_avisado', 'envio_coordinado', 'entregado'].includes(p.etapa)),
    proveedoresDemorados: (provR.data ?? []) as PedidoProveedor[],
    objetivos: await calcularAvances(supabase, objetivos),
  };
}

export function hayAlgo(r: Resumen): boolean {
  return (
    r.tareasVencidas.length + r.tareasHoy.length + r.visitasHoy.length + r.entregasHoy.length + r.atrasados.length + r.porVencer.length + r.listasSinAvisar.length >
    0
  );
}

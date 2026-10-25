import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sumarDiasCorridos } from '@/lib/fechas';
import type { Entrega } from './tipos';
import { leerMedidas, type EntregaPlan, type Punto, type VehiculoPlan } from './planificador';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = SupabaseClient<any, any, any>;

export type Vehiculo = {
  id: string;
  nombre: string;
  fletero: string | null;
  telefono: string | null;
  capacidad: number;
  largo_max: number;
  ancho_max: number;
  alto_max: number;
  personas_max: number;
  jornada_desde: string;
  jornada_hasta: string;
  vuelve_deposito: boolean;
  dias: string;
  precio_entrega: number;
  descuento_desde: number;
  precio_descuento: number | null;
  activo: boolean;
  orden: number;
};

export const vehiculoPlan = (v: Vehiculo): VehiculoPlan => ({
  id: v.id,
  nombre: v.nombre,
  capacidad: Number(v.capacidad),
  largo: v.largo_max,
  ancho: v.ancho_max,
  alto: v.alto_max,
  personas: v.personas_max,
  desde: v.jornada_desde.slice(0, 5),
  hasta: v.jornada_hasta.slice(0, 5),
  vuelve: v.vuelve_deposito,
});

export async function deposito(db: Cliente): Promise<Punto | null> {
  const { data } = await db.from('parametros').select('clave, valor').in('clave', ['deposito_lat', 'deposito_lng']);
  const m = Object.fromEntries(((data ?? []) as { clave: string; valor: string }[]).map((x) => [x.clave, Number(x.valor)]));
  return Number.isFinite(m.deposito_lat) && Number.isFinite(m.deposito_lng) && m.deposito_lat && m.deposito_lng ? { lat: m.deposito_lat, lng: m.deposito_lng } : null;
}

/** Las entregas como las usa el planificador: medidas de cada mesa y si es urgente (vence en 2 días o antes). */
export async function entregasPlan(db: Cliente, entregas: Entrega[], fecha: string): Promise<EntregaPlan[]> {
  const pedidos = [...new Set(entregas.map((e) => e.pedido_id))];
  if (!pedidos.length) return [];
  const [{ data: items }, { data: peds }] = await Promise.all([
    db.from('pedido_items').select('pedido_id, medidas, cantidad').in('pedido_id', pedidos),
    db.from('pedidos').select('id, fecha_limite').in('id', pedidos),
  ]);
  const limite = new Map(((peds ?? []) as { id: string; fecha_limite: string }[]).map((p) => [p.id, p.fecha_limite]));
  const urgenteHasta = sumarDiasCorridos(fecha, 2);
  return entregas
    .filter((e) => e.lat != null && e.lng != null && e.franja_desde && e.franja_hasta)
    .map((e) => ({
      id: e.id,
      punto: { lat: e.lat!, lng: e.lng! },
      desde: e.franja_desde!.slice(0, 5),
      hasta: e.franja_hasta!.slice(0, 5),
      minutos: e.minutos,
      unidades: Number(e.unidades),
      personas: e.personas,
      medidas: ((items ?? []) as { pedido_id: string; medidas: string | null }[])
        .filter((i) => i.pedido_id === e.pedido_id)
        .map((i) => leerMedidas(i.medidas))
        .filter((m) => m.length >= 2),
      urgente: (limite.get(e.pedido_id) ?? '9999-12-31') <= urgenteHasta,
    }));
}

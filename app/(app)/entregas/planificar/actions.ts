'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { deposito, entregasPlan, vehiculoPlan, type Vehiculo } from '@/lib/entregas/datos-plan';
import { optimizacionConfigurada, optimizarConGoogle, tramosConGoogle } from '@/lib/entregas/google-rutas';
import { armarPedidoGoogle, costoViaje, horariosConOrden, leerRespuestaGoogle, planificarEstimado, type Plan, type RutaPlan } from '@/lib/entregas/planificador';
import type { Entrega } from '@/lib/entregas/tipos';
import { actualizarPedido as actualizarEnPlanilla } from '@/lib/planilla/sync';
import { miembroActual } from '@/lib/sesion';

export type EstadoPlan = { ok?: string; error?: string; aviso?: string };
type Db = Awaited<ReturnType<typeof miembroActual>>['supabase'];

const fechaValida = (f: string) => /^\d{4}-\d{2}-\d{2}$/.test(f);
const refrescar = () => {
  revalidatePath('/entregas/planificar');
  revalidatePath('/entregas');
};

async function guardarRuta(db: Db, fecha: string, r: RutaPlan, v: Vehiculo, calculo: Plan['calculo'], rutaId?: string) {
  const fila = {
    fecha,
    vehiculo_id: v.id,
    estado: 'propuesta',
    salida: r.salida,
    regreso: r.regreso,
    km: r.km,
    minutos: r.minutos,
    costo_estimado: costoViaje(r.paradas.length, { precio_entrega: Number(v.precio_entrega), descuento_desde: v.descuento_desde, precio_descuento: v.precio_descuento == null ? null : Number(v.precio_descuento) }),
    polyline: r.polyline ?? null,
    calculo,
  };
  let id = rutaId;
  if (id) {
    const { error } = await db.from('rutas').update(fila).eq('id', id).eq('estado', 'propuesta');
    if (error) throw new Error(error.message);
    await db.from('ruta_paradas').delete().eq('ruta_id', id);
  } else {
    const { data, error } = await db.from('rutas').insert(fila).select('id').single();
    if (error || !data) throw new Error(error?.message ?? 'No se pudo guardar la ruta');
    id = data.id as string;
  }
  if (r.paradas.length) {
    const { error } = await db.from('ruta_paradas').insert(
      r.paradas.map((p, i) => ({
        ruta_id: id,
        entrega_id: p.entregaId,
        orden: i + 1,
        llegada: p.llegada,
        salida: p.salida,
        minutos_viaje: p.minutosViaje,
        km_desde_anterior: p.km,
        fuera_de_franja: p.fueraDeFranja,
        espera_minutos: p.espera,
      })),
    );
    if (error) throw new Error(error.message);
  } else {
    await db.from('rutas').update({ estado: 'descartada' }).eq('id', id);
  }
  return id;
}

/** Arma la propuesta del día con las entregas listas para esa fecha y los vehículos elegidos. */
export async function proponer(fecha: string, vehiculoIds: string[]): Promise<EstadoPlan> {
  if (!fechaValida(fecha)) return { error: 'Fecha inválida.' };
  const { supabase } = await miembroActual();
  const dep = await deposito(supabase);
  if (!dep) return { error: 'Falta ubicar el depósito: guardalo en Ajustes → Reparto (con la clave de Google Maps cargada).' };
  const [{ data: vs }, { data: es }, { data: confirmadas }] = await Promise.all([
    supabase.from('vehiculos').select('*').in('id', vehiculoIds.length ? vehiculoIds : ['00000000-0000-0000-0000-000000000000']).eq('activo', true).order('orden'),
    supabase.from('entregas').select('*').eq('estado', 'lista').eq('fecha_acordada', fecha),
    supabase.from('rutas').select('vehiculo_id').eq('fecha', fecha).in('estado', ['confirmada', 'en_curso']),
  ]);
  const ocupados = new Set(((confirmadas ?? []) as { vehiculo_id: string }[]).map((r) => r.vehiculo_id));
  const vehiculos = ((vs ?? []) as Vehiculo[]).filter((v) => !ocupados.has(v.id));
  if (!vehiculos.length) return { error: 'Elegí al menos un vehículo libre ese día.' };
  const entregas = (es ?? []) as Entrega[];
  if (!entregas.length) return { error: 'No hay entregas listas para ese día.' };

  const planes = await entregasPlan(supabase, entregas, fecha);
  const vp = vehiculos.map(vehiculoPlan);
  let plan: Plan | null = null;
  let aviso: string | undefined;
  if (optimizacionConfigurada()) {
    const r = await optimizarConGoogle(armarPedidoGoogle(fecha, dep, vp, planes));
    if (r.ok) plan = leerRespuestaGoogle(r.respuesta as never, vp, planes);
    else aviso = `${r.error}. Se armó con distancias estimadas.`;
  } else {
    aviso = 'Sin Route Optimization todavía: los tiempos son estimados en línea recta.';
  }
  plan ??= planificarEstimado(dep, vp, planes);

  try {
    // La propuesta nueva reemplaza a la anterior del día (las confirmadas no se tocan).
    await supabase.from('rutas').update({ estado: 'descartada' }).eq('fecha', fecha).eq('estado', 'propuesta');
    await supabase.from('rutas_omitidas').delete().eq('fecha', fecha);
    for (const r of plan.rutas) await guardarRuta(supabase, fecha, r, vehiculos.find((v) => v.id === r.vehiculoId)!, plan.calculo);
    if (plan.omitidas.length) await supabase.from('rutas_omitidas').insert(plan.omitidas.map((o) => ({ fecha, entrega_id: o.entregaId, motivo: o.motivo })));
  } catch (e) {
    return { error: `No se pudo guardar la propuesta: ${e instanceof Error ? e.message : String(e)}` };
  }
  refrescar();
  const n = plan.rutas.reduce((s, r) => s + r.paradas.length, 0);
  return { ok: `Propuesta lista: ${n} de ${entregas.length} entregas en ${plan.rutas.length} ${plan.rutas.length === 1 ? 'vehículo' : 'vehículos'}.`, aviso };
}

/** Recalcula horarios y km de una ruta en propuesta con este orden de entregas. */
async function recalcularRuta(db: Db, rutaId: string, orden: string[]): Promise<void> {
  const { data: ru } = await db.from('rutas').select('*, vehiculos(*)').eq('id', rutaId).single();
  if (!ru || ru.estado !== 'propuesta') throw new Error('Solo se cambian rutas en propuesta.');
  const v = ru.vehiculos as unknown as Vehiculo;
  const dep = await deposito(db);
  if (!dep) throw new Error('Falta ubicar el depósito.');
  const { data: es } = orden.length ? await db.from('entregas').select('*').in('id', orden) : { data: [] };
  const planes = await entregasPlan(db, (es ?? []) as Entrega[], ru.fecha);
  const enOrden = orden.map((id) => planes.find((p) => p.id === id)).filter(Boolean) as typeof planes;
  const vp = vehiculoPlan(v);
  const tramos = await tramosConGoogle(dep, enOrden.map((e) => e.punto), vp.vuelve ? dep : null);
  const r = horariosConOrden(dep, vp, enOrden, undefined, tramos ?? undefined);
  await guardarRuta(db, ru.fecha, { vehiculoId: v.id, ...r }, v, tramos ? 'google' : 'estimado', rutaId);
}

export async function reordenar(rutaId: string, orden: string[]): Promise<EstadoPlan> {
  const { supabase } = await miembroActual();
  try {
    await recalcularRuta(supabase, rutaId, orden);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  refrescar();
  return { ok: 'Horarios recalculados.' };
}

/** Pasa una entrega a otro vehículo (o la saca de la propuesta) y recalcula las dos rutas. */
export async function moverEntrega(fecha: string, entregaId: string, destinoVehiculo: string | null): Promise<EstadoPlan> {
  const { supabase } = await miembroActual();
  try {
    const { data: actual } = await supabase.from('ruta_paradas').select('ruta_id, rutas!inner(estado, fecha)').eq('entrega_id', entregaId).eq('rutas.estado', 'propuesta').eq('rutas.fecha', fecha).maybeSingle();
    if (actual) {
      const { data: resto } = await supabase.from('ruta_paradas').select('entrega_id').eq('ruta_id', actual.ruta_id).order('orden');
      await recalcularRuta(supabase, actual.ruta_id, ((resto ?? []) as { entrega_id: string }[]).map((x) => x.entrega_id).filter((x) => x !== entregaId));
    }
    if (destinoVehiculo) {
      let { data: destino } = await supabase.from('rutas').select('id').eq('fecha', fecha).eq('vehiculo_id', destinoVehiculo).eq('estado', 'propuesta').maybeSingle();
      if (!destino) {
        const { data: v } = await supabase.from('vehiculos').select('*').eq('id', destinoVehiculo).single();
        const { data: nueva, error } = await supabase.from('rutas').insert({ fecha, vehiculo_id: (v as Vehiculo).id, estado: 'propuesta' }).select('id').single();
        if (error || !nueva) throw new Error(error?.message ?? 'No se pudo crear la ruta');
        destino = nueva;
      }
      const { data: paradas } = await supabase.from('ruta_paradas').select('entrega_id').eq('ruta_id', destino.id).order('orden');
      await recalcularRuta(supabase, destino.id, [...((paradas ?? []) as { entrega_id: string }[]).map((x) => x.entrega_id), entregaId]);
    }
    await supabase.from('rutas_omitidas').delete().eq('fecha', fecha).eq('entrega_id', entregaId);
    if (!destinoVehiculo) await supabase.from('rutas_omitidas').insert({ fecha, entrega_id: entregaId, motivo: 'La sacó el encargado' });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  refrescar();
  return { ok: destinoVehiculo ? 'Entrega movida.' : 'Entrega sacada de la propuesta.' };
}

export async function confirmarRuta(rutaId: string): Promise<EstadoPlan> {
  const { supabase } = await miembroActual();
  const { data: ru } = await supabase.from('rutas').select('desactualizada, ruta_paradas(fuera_de_franja, entrega_id)').eq('id', rutaId).single();
  const { error } = await supabase.rpc('ruta_confirmar', { p_ruta: rutaId });
  if (error) return { error: error.message };
  // Los pedidos pasan a "coordinado": se actualiza la planilla.
  const { data: es } = await supabase.from('entregas').select('pedido_id').in('id', ((ru?.ruta_paradas ?? []) as { entrega_id: string }[]).map((p) => p.entrega_id));
  after(async () => {
    for (const e of (es ?? []) as { pedido_id: string }[]) await actualizarEnPlanilla(supabase, e.pedido_id);
  });
  refrescar();
  revalidatePath('/calendario');
  revalidatePath('/pedidos');
  const tarde = ((ru?.ruta_paradas ?? []) as { fuera_de_franja: boolean }[]).filter((p) => p.fuera_de_franja).length;
  return { ok: `Ruta confirmada.${tarde ? ` Ojo: ${tarde} ${tarde === 1 ? 'parada llega' : 'paradas llegan'} fuera de franja.` : ''}` };
}

export async function deshacerRuta(rutaId: string): Promise<EstadoPlan> {
  const { supabase } = await miembroActual();
  const { error } = await supabase.rpc('ruta_deshacer', { p_ruta: rutaId });
  if (error) return { error: error.message };
  refrescar();
  revalidatePath('/calendario');
  return { ok: 'Listo: las entregas volvieron a la lista.' };
}

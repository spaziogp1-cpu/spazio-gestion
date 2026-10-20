'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { sumarDiasCorridos, hoyAR } from '@/lib/fechas';
import { texto } from '@/lib/formato';
import { cargarCatalogo } from '@/lib/cotizador/catalogo';
import { calcularItem, paraVenta, reglasPresupuesto, subirA, type ResultadoVenta } from '@/lib/cotizador/servicio';
import type { Catalogo } from '@/lib/cotizador/tipos';
import { miembroActual } from '@/lib/sesion';
import { crearAdmin } from '@/lib/supabase/admin';

const ESTADOS = ['borrador', 'enviado', 'seguimiento', 'aprobado', 'rechazado', 'vencido'] as const;
type Estado = (typeof ESTADOS)[number];
const fallo = (e: unknown) => ({ error: e instanceof Error ? e.message : String(e) });

async function quien() {
  const ctx = await miembroActual();
  const verCostos =
    ctx.miembro.rol === 'admin' || (await ctx.supabase.rpc('puede', { p_permiso: 'cotizador.costos' })).data === true;
  return { ...ctx, verCostos };
}

function valoresSeguros(v: unknown): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 40)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(k)) continue;
    if (typeof x === 'number' && Number.isFinite(x)) out[k] = x;
    else if (typeof x === 'string' && x.length <= 80) out[k] = x;
  }
  return out;
}

/** Precio en vivo mientras el vendedor completa medidas y opciones. */
export async function precioItem(productoId: string, valores: unknown, cantidad: number): Promise<{ error?: string; resultado?: ResultadoVenta }> {
  try {
    const { verCostos } = await quien();
    const c = await calcularItem(productoId, valoresSeguros(valores), Math.max(1, Math.round(Number(cantidad) || 1)));
    return { resultado: paraVenta(c, verCostos) };
  } catch (e) {
    return fallo(e);
  }
}

export type ItemPedido = { productoId: string; valores: Record<string, number | string>; cantidad: number };
export type DatosPresupuesto = {
  cliente: { id?: string | null; nombre: string; telefono?: string | null };
  items: ItemPedido[];
  descuentoPct: number; // 0.05 = 5%
  observaciones?: string | null;
};

/**
 * Guarda un presupuesto nuevo o reemplaza los ítems de uno existente.
 * Siempre recalcula en el servidor: el precio que manda el navegador no se usa.
 */
export async function guardarPresupuesto(id: string | null, datos: DatosPresupuesto): Promise<{ error?: string; id?: string }> {
  let nuevoId: string;
  try {
    const { miembro, supabase } = await miembroActual();
    const nombre = datos.cliente?.nombre?.trim();
    if (!nombre) return { error: 'Falta el nombre del cliente.' };
    if (!Array.isArray(datos.items) || datos.items.length === 0) return { error: 'Agregá al menos un producto.' };
    if (datos.items.length > 30) return { error: 'Son demasiados productos para un presupuesto.' };
    const pct = Number(datos.descuentoPct) || 0;
    if (pct < 0 || pct >= 0.8) return { error: 'El descuento tiene que estar entre 0% y 80%.' };

    const db = crearAdmin(`${miembro.email}`);
    if (id) {
      const { data: actual } = await db.from('cot_presupuestos').select('estado, pedido_id').eq('id', id).maybeSingle();
      if (!actual) return { error: 'No existe ese presupuesto.' };
      if (actual.pedido_id) return { error: 'Ya se convirtió en pedido: no se puede cambiar. Duplicalo para hacer otro.' };
      if (actual.estado === 'aprobado') return { error: 'Está aprobado: duplicalo para cambiarlo.' };
    }

    // Cálculo de cada ítem con los precios de hoy.
    const cache: { catalogo?: Catalogo; db: typeof db } = { db };
    cache.catalogo = await cargarCatalogo(db);
    const calculos = [];
    for (const it of datos.items) {
      const cantidad = Math.max(1, Math.min(999, Math.round(Number(it.cantidad) || 1)));
      const c = await calcularItem(String(it.productoId), valoresSeguros(it.valores), cantidad, cache);
      if (!c.resultado.ok) {
        const motivo = c.resultado.avisos.find((a) => a.nivel === 'error')?.mensaje ?? 'no se pudo calcular';
        return { error: `${c.productoNombre}: ${motivo}` };
      }
      calculos.push(c);
    }

    const reglas = await reglasPresupuesto(db);
    const subtotal = calculos.reduce((s, c) => s + c.resultado.precioTotal, 0);
    const total = subirA(subtotal * (1 - pct), reglas.redondeo);
    const totalCuotas = subirA(total * (1 + reglas.recargoCuotas), reglas.redondeo);
    const necesita = pct > reglas.topeDescuento + 1e-9;
    const esAdmin = miembro.rol === 'admin';

    // Cliente: el elegido o uno nuevo (con los permisos de quien está usando la app).
    let clienteId = datos.cliente.id ?? null;
    if (!clienteId) {
      const { data: c, error } = await supabase
        .from('clientes')
        .insert({ nombre, telefono: texto(datos.cliente.telefono ?? null) })
        .select('id')
        .single();
      if (error) return { error: `No se pudo crear el cliente: ${error.message}` };
      clienteId = c.id as string;
    }

    const cabecera = {
      cliente_id: clienteId,
      cliente_nombre: nombre,
      cliente_telefono: texto(datos.cliente.telefono ?? null),
      subtotal,
      descuento_pct: pct,
      descuento_monto: Math.max(0, subtotal - total),
      total,
      total_cuotas: totalCuotas,
      necesita_aprobacion: necesita,
      aprobado_por: necesita && esAdmin ? miembro.id : null,
      observaciones: texto(datos.observaciones ?? null),
    };
    if (id) {
      const { error } = await db.from('cot_presupuestos').update(cabecera).eq('id', id);
      if (error) return { error: error.message };
      const { error: e2 } = await db.from('cot_presupuesto_items').delete().eq('presupuesto_id', id);
      if (e2) return { error: e2.message };
      nuevoId = id;
    } else {
      const { data, error } = await db
        .from('cot_presupuestos')
        .insert({ ...cabecera, vendedor_id: miembro.id, creado_por: miembro.id, valido_hasta: sumarDiasCorridos(hoyAR(), reglas.validezDias) })
        .select('id')
        .single();
      if (error) return { error: error.message };
      nuevoId = data.id as string;
    }

    for (const [orden, c] of calculos.entries()) {
      const r = c.resultado;
      const { data: item, error } = await db
        .from('cot_presupuesto_items')
        .insert({
          presupuesto_id: nuevoId,
          orden,
          producto_id: c.productoId,
          receta_id: c.recetaId,
          titulo: c.productoNombre,
          detalle: c.detalle,
          valores: c.valores,
          cantidad: r.cantidad,
          precio_unitario: r.precioUnitario,
          precio_unitario_cuotas: r.precioUnitarioCuotas,
          total: r.precioTotal,
          estimado: r.lineas.some((l) => l.estimado),
        })
        .select('id')
        .single();
      if (error) return { error: error.message };
      const { error: e2 } = await db.from('cot_presupuesto_calculos').insert({
        item_id: item.id,
        presupuesto_id: nuevoId,
        receta: c.receta,
        resultado: { valores: c.valores, lineas: r.lineas, avisos: r.avisos, tarifasUsadas: r.tarifasUsadas, precioUnitario: r.precioUnitario },
        costo_unitario: r.costoUnitario,
        margen: c.margen,
        motor: r.motor,
      });
      if (e2) return { error: e2.message };
    }
  } catch (e) {
    return fallo(e);
  }
  revalidatePath('/cotizador');
  redirect(`/cotizador/${nuevoId}`);
}

export async function cambiarEstado(id: string, estado: string): Promise<{ error?: string }> {
  try {
    if (!ESTADOS.includes(estado as Estado)) return { error: 'Estado inválido.' };
    const { supabase } = await miembroActual();
    const { error } = await supabase.from('cot_presupuestos').update({ estado }).eq('id', id);
    if (error) return { error: error.message };
    revalidatePath(`/cotizador/${id}`);
    revalidatePath('/cotizador');
    return {};
  } catch (e) {
    return fallo(e);
  }
}

export async function aprobarDescuento(id: string): Promise<{ error?: string }> {
  try {
    const { miembro } = await miembroActual();
    if (miembro.rol !== 'admin') return { error: 'Solo un administrador puede aprobar el descuento.' };
    const { error } = await crearAdmin(miembro.email).from('cot_presupuestos').update({ aprobado_por: miembro.id }).eq('id', id);
    if (error) return { error: error.message };
    revalidatePath(`/cotizador/${id}`);
    return {};
  } catch (e) {
    return fallo(e);
  }
}

export async function guardarNotas(id: string, observaciones: string): Promise<{ error?: string }> {
  try {
    const { supabase } = await miembroActual();
    const { error } = await supabase.from('cot_presupuestos').update({ observaciones: texto(observaciones) }).eq('id', id);
    if (error) return { error: error.message };
    revalidatePath(`/cotizador/${id}`);
    return {};
  } catch (e) {
    return fallo(e);
  }
}

/** Copia un presupuesto en uno nuevo, recalculado con los precios de hoy. */
export async function duplicarPresupuesto(id: string): Promise<{ error?: string; id?: string }> {
  try {
    await miembroActual();
    const db = crearAdmin();
    const [{ data: p }, { data: items }] = await Promise.all([
      db.from('cot_presupuestos').select('cliente_id, cliente_nombre, cliente_telefono, descuento_pct, observaciones').eq('id', id).maybeSingle(),
      db.from('cot_presupuesto_items').select('producto_id, valores, cantidad').eq('presupuesto_id', id).order('orden'),
    ]);
    if (!p) return { error: 'No existe ese presupuesto.' };
    const lista = ((items ?? []) as { producto_id: string | null; valores: Record<string, number | string>; cantidad: number }[]).filter((i) => i.producto_id);
    if (!lista.length) return { error: 'Los productos de este presupuesto ya no existen.' };
    const r = await guardarPresupuesto(null, {
      cliente: { id: p.cliente_id, nombre: p.cliente_nombre, telefono: p.cliente_telefono },
      items: lista.map((i) => ({ productoId: i.producto_id!, valores: i.valores, cantidad: i.cantidad })),
      descuentoPct: Number(p.descuento_pct),
      observaciones: p.observaciones,
    });
    return r;
  } catch (e) {
    // redirect() de guardarPresupuesto llega acá como excepción: hay que dejarla pasar.
    if (e && typeof e === 'object' && 'digest' in e && String((e as { digest: unknown }).digest).startsWith('NEXT_REDIRECT')) throw e;
    return fallo(e);
  }
}

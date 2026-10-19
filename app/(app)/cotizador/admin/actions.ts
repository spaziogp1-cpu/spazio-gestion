'use server';

import { revalidatePath } from 'next/cache';
import { exigirPermisoCostos } from '@/lib/cotizador/permisos';
import { leerMonto, texto } from '@/lib/formato';

export type EstadoPanel = { error?: string; ok?: string };

const RUTA = '/cotizador/admin';
const error = (e: unknown): EstadoPanel => ({ error: e instanceof Error ? e.message : String(e) });

/**
 * Cambia (o crea) el precio de una combinación. Con el precio vacío, la da de baja.
 * La base cierra la tarifa anterior y abre una nueva: el historial queda.
 */
export async function cambiarPrecio(
  insumoId: string,
  variante: Record<string, string>,
  referencia: number | null,
  tarifaId: number | string | null,
  precioTexto: string,
): Promise<EstadoPanel & { precio?: number | null }> {
  try {
    const { supabase } = await exigirPermisoCostos();
    const limpio = precioTexto.trim();
    if (limpio === '') {
      if (tarifaId == null) return { ok: 'Sin cambios', precio: null };
      const { error: e } = await supabase.rpc('cot_quitar_tarifa', { p_id: Number(tarifaId) });
      if (e) return { error: e.message };
      revalidatePath(RUTA);
      return { ok: 'Precio quitado', precio: null };
    }
    const precio = leerMonto(limpio);
    if (!(precio > 0)) return { error: 'Escribí un precio mayor a cero.' };
    if (precio > 1e10) return { error: 'El precio es demasiado alto.' };
    const { error: e } = await supabase.rpc('cot_cambiar_precio', {
      p_insumo: insumoId,
      p_variante: variante,
      p_precio: precio,
      p_referencia: referencia,
      p_nota: null,
    });
    if (e) return { error: e.message };
    revalidatePath(RUTA);
    return { ok: 'Guardado', precio };
  } catch (e) {
    return error(e);
  }
}

const PORCENTAJES = new Set(['recargo_cuotas', 'tope_descuento', 'ajuste_vidpro']);

export async function guardarAjustes(_prev: EstadoPanel, fd: FormData): Promise<EstadoPanel> {
  try {
    const { supabase } = await exigirPermisoCostos();
    const { data: actuales } = await supabase.from('cot_ajustes').select('clave');
    for (const { clave } of (actuales ?? []) as { clave: string }[]) {
      const crudo = texto(fd.get(clave));
      if (crudo == null) continue;
      const n = Number(crudo.replace(',', '.'));
      if (!Number.isFinite(n) || n < 0) return { error: `Revisá el valor de ${clave.replace('_', ' ')}.` };
      const valor = PORCENTAJES.has(clave) ? n / 100 : n;
      if (PORCENTAJES.has(clave) && valor >= 1) return { error: 'Los porcentajes tienen que ser menores a 100%.' };
      const { error: e } = await supabase.from('cot_ajustes').update({ valor }).eq('clave', clave);
      if (e) return { error: e.message };
    }
    revalidatePath(RUTA);
    return { ok: 'Reglas guardadas' };
  } catch (e) {
    return error(e);
  }
}

export async function aumentoMasivo(_prev: EstadoPanel, fd: FormData): Promise<EstadoPanel> {
  try {
    const { supabase } = await exigirPermisoCostos();
    const proveedor = texto(fd.get('proveedor_id'));
    const tipo = texto(fd.get('tipo'));
    const pct = Number(String(fd.get('porcentaje') ?? '').replace(',', '.'));
    if (!proveedor) return { error: 'Elegí el proveedor.' };
    if (!Number.isFinite(pct) || pct === 0 || pct <= -100 || pct > 500) return { error: 'Escribí un porcentaje válido (por ejemplo 8 o -5).' };
    const { data, error: e } = await supabase.rpc('cot_aumento_masivo', {
      p_proveedor: proveedor,
      p_porcentaje: pct,
      p_tipo: tipo,
      p_nota: texto(fd.get('nota')),
    });
    if (e) return { error: e.message };
    revalidatePath(RUTA);
    const n = Number(data ?? 0);
    return { ok: n ? `${n} precios actualizados (${pct > 0 ? '+' : ''}${pct}%)` : 'Ese proveedor no tiene precios cargados.' };
  } catch (e) {
    return error(e);
  }
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

/** Alta o cambio de un color: a qué columna de precio de Vidpro pertenece. */
export async function guardarColor(id: string | null, _prev: EstadoPanel, fd: FormData): Promise<EstadoPanel> {
  try {
    const { supabase } = await exigirPermisoCostos();
    const etiqueta = texto(fd.get('etiqueta'));
    if (!etiqueta) return { error: 'Escribí el nombre del color.' };
    const grupo = texto(fd.get('grupo'));
    const muestra = texto(fd.get('muestra'));
    if (muestra && !/^#[0-9a-f]{6}$/i.test(muestra)) return { error: 'El color de muestra no es válido.' };
    const fila = {
      etiqueta,
      grupos: grupo ? [grupo] : [],
      muestra,
      activo: fd.get('activo') !== null || !id,
    };
    if (id) {
      const { error: e } = await supabase.from('cot_atributo_valores').update(fila).eq('id', id);
      if (e) return { error: e.message };
    } else {
      const valor = slug(etiqueta);
      if (!valor) return { error: 'El nombre del color no es válido.' };
      const { error: e } = await supabase.from('cot_atributo_valores').insert({ ...fila, atributo: 'color', valor, orden: 100 });
      if (e) return { error: e.message.includes('duplicate') ? 'Ya hay un color con ese nombre.' : e.message };
    }
    revalidatePath(RUTA);
    return { ok: id ? 'Guardado' : 'Color agregado' };
  } catch (e) {
    return error(e);
  }
}

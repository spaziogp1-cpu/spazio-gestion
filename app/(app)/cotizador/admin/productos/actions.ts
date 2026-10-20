'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cargarCatalogo } from '@/lib/cotizador/catalogo';
import { cotizar, validarReceta } from '@/lib/cotizador/motor';
import { exigirPermisoCostos } from '@/lib/cotizador/permisos';
import { insumosDeReceta, leerReceta } from '@/lib/cotizador/receta';
import type { Aviso, ResultadoCalculo } from '@/lib/cotizador/tipos';
import { texto } from '@/lib/formato';

export type EstadoProducto = { error?: string; ok?: string };
const fallo = (e: unknown) => ({ error: e instanceof Error ? e.message : String(e) });

function leerMargen(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? '').replace(',', '.').replace('%', '').trim();
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n >= 95) return NaN;
  return n / 100;
}

export async function crearProducto(_prev: EstadoProducto, fd: FormData): Promise<EstadoProducto> {
  let id: string;
  try {
    const { supabase } = await exigirPermisoCostos();
    const nombre = texto(fd.get('nombre'));
    if (!nombre) return { error: 'Escribí el nombre del producto.' };
    const margen = leerMargen(fd.get('margen'));
    if (margen === null || Number.isNaN(margen)) return { error: 'Escribí el margen (entre 0 y 94%).' };
    const { data, error } = await supabase
      .from('cot_productos')
      .insert({ nombre, categoria_id: texto(fd.get('categoria_id')) })
      .select('id')
      .single();
    if (error) return { error: error.message.includes('duplicate') ? 'Ya hay un producto con ese nombre.' : error.message };
    id = data.id as string;
    const { error: e2 } = await supabase.from('cot_margenes').insert({ producto_id: id, margen });
    if (e2) return { error: `Se creó el producto, pero no el margen: ${e2.message}` };
    const { error: e3 } = await supabase.rpc('cot_borrador', { p_producto: id });
    if (e3) return { error: e3.message };
  } catch (e) {
    return fallo(e);
  }
  revalidatePath('/cotizador/admin/productos');
  redirect(`/cotizador/admin/productos/${id}`);
}

export async function guardarProducto(id: string, _prev: EstadoProducto, fd: FormData): Promise<EstadoProducto> {
  try {
    const { supabase } = await exigirPermisoCostos();
    const nombre = texto(fd.get('nombre'));
    if (!nombre) return { error: 'El producto necesita un nombre.' };
    const foto = texto(fd.get('foto_url'));
    if (foto && !/^https:\/\//.test(foto)) return { error: 'La foto tiene que ser un link que empiece con https://' };
    const link = texto(fd.get('tiendanube_url'));
    if (link && !/^https:\/\//.test(link)) return { error: 'El link de la tienda tiene que empezar con https://' };
    const margen = leerMargen(fd.get('margen'));
    if (margen === null || Number.isNaN(margen)) return { error: 'Escribí el margen (entre 0 y 94%).' };

    const { error } = await supabase
      .from('cot_productos')
      .update({
        nombre,
        categoria_id: texto(fd.get('categoria_id')),
        descripcion: texto(fd.get('descripcion')),
        foto_url: foto,
        tiendanube_url: link,
        activo: fd.get('activo') === 'on',
      })
      .eq('id', id);
    if (error) return { error: error.message.includes('duplicate') ? 'Ya hay un producto con ese nombre.' : error.message };
    const { error: e2 } = await supabase.from('cot_margenes').upsert({ producto_id: id, margen }, { onConflict: 'producto_id' });
    if (e2) return { error: e2.message };
    revalidatePath(`/cotizador/admin/productos/${id}`);
    revalidatePath('/cotizador/admin/productos');
    return { ok: 'Guardado' };
  } catch (e) {
    return fallo(e);
  }
}

/** Guarda el borrador tal como está (puede tener errores: es un borrador). */
export async function guardarBorrador(productoId: string, definicion: unknown): Promise<EstadoProducto & { avisos?: Aviso[] }> {
  try {
    const { supabase } = await exigirPermisoCostos();
    const receta = leerReceta(definicion);
    const { data: borrador, error: e1 } = await supabase.rpc('cot_borrador', { p_producto: productoId });
    if (e1) return { error: e1.message };
    const { error } = await supabase.from('cot_recetas').update({ definicion: receta }).eq('id', borrador as string).eq('estado', 'borrador');
    if (error) return { error: error.message };
    const catalogo = await cargarCatalogo(supabase);
    revalidatePath(`/cotizador/admin/productos/${productoId}`);
    return { ok: 'Borrador guardado', avisos: validarReceta(receta, catalogo) };
  } catch (e) {
    return fallo(e);
  }
}

/** Calcula con la receta del editor (aunque no esté guardada) para el probador. */
export async function probarReceta(
  definicion: unknown,
  valores: Record<string, number | string>,
  margen: number,
  cantidad: number,
): Promise<{ error?: string; resultado?: ResultadoCalculo; validacion?: Aviso[] }> {
  try {
    const { supabase } = await exigirPermisoCostos();
    const receta = leerReceta(definicion);
    const catalogo = await cargarCatalogo(supabase);
    const validacion = validarReceta(receta, catalogo);
    if (!receta.lineas.length) return { validacion };
    const resultado = cotizar({ receta, catalogo, valores, margen, cantidad });
    return { resultado, validacion };
  } catch (e) {
    return fallo(e);
  }
}

/** Publica el borrador: desde ese momento es la versión que se cotiza. */
export async function publicarReceta(productoId: string, definicion: unknown, nota: string | null): Promise<EstadoProducto & { avisos?: Aviso[] }> {
  try {
    const { supabase } = await exigirPermisoCostos();
    const receta = leerReceta(definicion);
    const catalogo = await cargarCatalogo(supabase);
    const errores = validarReceta(receta, catalogo).filter((a) => a.nivel === 'error');
    if (errores.length) return { error: 'La receta tiene errores: corregilos antes de publicar.', avisos: errores };

    // Una prueba con las medidas por defecto, para no publicar algo que no calcula.
    const valores: Record<string, number | string> = {};
    for (const [k, e] of Object.entries(receta.entradas)) {
      const def = e.def ?? (e.tipo === 'opcion' ? e.permitidos?.[0] : undefined);
      if (def != null) valores[k] = def;
    }
    const prueba = cotizar({ receta, catalogo, valores, margen: 0.4 });
    const fallas = prueba.avisos.filter((a) => a.nivel === 'error' && !/^Falta /.test(a.mensaje));
    if (fallas.length) return { error: 'Con las medidas por defecto la receta no calcula: revisá los avisos.', avisos: fallas };

    const { data: borrador, error: e1 } = await supabase.rpc('cot_borrador', { p_producto: productoId });
    if (e1) return { error: e1.message };
    const { error: e2 } = await supabase.from('cot_recetas').update({ definicion: receta }).eq('id', borrador as string).eq('estado', 'borrador');
    if (e2) return { error: e2.message };
    const usados = insumosDeReceta(receta, Object.keys(catalogo.insumos));
    const { data: version, error: e3 } = await supabase.rpc('cot_publicar', { p_receta: borrador, p_insumos: usados, p_nota: nota });
    if (e3) return { error: e3.message };
    revalidatePath(`/cotizador/admin/productos/${productoId}`);
    revalidatePath('/cotizador/admin/productos');
    return { ok: `Versión ${version} publicada` };
  } catch (e) {
    return fallo(e);
  }
}

/** Vuelve a empezar el borrador desde la versión publicada. */
export async function descartarBorrador(productoId: string): Promise<EstadoProducto> {
  try {
    const { supabase } = await exigirPermisoCostos();
    const { data: pub } = await supabase.from('cot_recetas').select('definicion').eq('producto_id', productoId).eq('estado', 'publicada').maybeSingle();
    if (!pub) return { error: 'No hay una versión publicada para volver.' };
    const { error } = await supabase.from('cot_recetas').update({ definicion: pub.definicion }).eq('producto_id', productoId).eq('estado', 'borrador');
    if (error) return { error: error.message };
    revalidatePath(`/cotizador/admin/productos/${productoId}`);
    return { ok: 'Borrador descartado' };
  } catch (e) {
    return fallo(e);
  }
}

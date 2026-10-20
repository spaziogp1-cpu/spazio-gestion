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

const PORCENTAJES = new Set(['recargo_cuotas', 'tope_descuento', 'ajuste_vidpro', 'recargo_forma', 'recargo_molde']);

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

const TIPOS = ['vidrio', 'espejo', 'madera', 'estructura', 'herraje', 'proceso', 'mano_obra', 'embalaje', 'flete', 'otro'];
const UNIDADES = ['m2', 'ml', 'unidad', 'fijo', 'kg', 'hora'];
const PESTANA_DE: Record<string, string> = {
  vidrio: 'Vidrios',
  espejo: 'Espejos',
  proceso: 'Procesos',
  mano_obra: 'Mano de obra',
  estructura: 'Estructuras',
};

/**
 * Alta de un costo nuevo (con su proveedor, que puede ser nuevo).
 * Si tiene opciones (ej. especies de madera), cada opción lleva su precio.
 */
export async function crearInsumo(_prev: EstadoPanel, fd: FormData): Promise<EstadoPanel> {
  try {
    const { supabase } = await exigirPermisoCostos();
    const nombre = texto(fd.get('nombre'));
    const tipo = String(fd.get('tipo') ?? '');
    const unidad = String(fd.get('unidad') ?? '');
    if (!nombre) return { error: 'Escribí qué es (ej. Ruedas con freno).' };
    if (!TIPOS.includes(tipo)) return { error: 'Elegí el tipo de costo.' };
    if (!UNIDADES.includes(unidad)) return { error: 'Elegí cómo se cobra.' };

    const minimoTxt = texto(fd.get('minimo'));
    const minimo = minimoTxt ? Number(minimoTxt.replace(',', '.')) : null;
    if (minimo != null && !(minimo > 0)) return { error: 'El mínimo tiene que ser mayor a cero.' };
    const minimoPor = minimo != null ? (fd.get('minimo_por') === 'item' ? 'item' : 'pieza') : null;

    // Opciones con su precio, o un solo precio.
    const nombresOp = fd.getAll('op_nombre').map((v) => String(v).trim());
    const preciosOp = fd.getAll('op_precio').map((v) => String(v).trim());
    const opciones = nombresOp
      .map((n, i) => ({ etiqueta: n, valor: slug(n), precio: leerMonto(preciosOp[i] ?? '') }))
      .filter((o) => o.etiqueta !== '');
    if (opciones.some((o) => !o.valor)) return { error: 'Revisá los nombres de las opciones.' };
    if (new Set(opciones.map((o) => o.valor)).size !== opciones.length) return { error: 'Hay opciones repetidas.' };
    if (opciones.some((o) => !(o.precio > 0))) return { error: 'Cada opción necesita su precio.' };
    const precioUnico = leerMonto(String(fd.get('precio') ?? ''));
    if (!opciones.length && !(precioUnico > 0)) return { error: 'Escribí el precio.' };

    // Proveedor: uno existente o uno nuevo.
    let proveedorId = texto(fd.get('proveedor_id'));
    if (proveedorId === 'nuevo') {
      const nombreProv = texto(fd.get('proveedor_nombre'));
      if (!nombreProv) return { error: 'Escribí el nombre del proveedor nuevo.' };
      const { data: existe } = await supabase.from('proveedores').select('id').ilike('nombre', nombreProv).maybeSingle();
      if (existe) proveedorId = existe.id as string;
      else {
        const { data: nuevo, error: e } = await supabase
          .from('proveedores')
          .insert({ nombre: nombreProv, que_provee: nombre })
          .select('id')
          .single();
        if (e) return { error: `No se pudo crear el proveedor: ${e.message}` };
        proveedorId = nuevo.id as string;
      }
    }

    // Código único para las recetas (ej. ruedas-con-freno, ruedas-con-freno-2).
    const base = slug(nombre) || 'insumo';
    const { data: parecidos } = await supabase.from('cot_insumos').select('codigo').like('codigo', `${base}%`);
    const usados = new Set(((parecidos ?? []) as { codigo: string }[]).map((x) => x.codigo));
    let codigo = base;
    for (let n = 2; usados.has(codigo); n++) codigo = `${base}-${n}`;

    let atributos: string[] = [];
    if (opciones.length) {
      const clave = `v_${codigo.replace(/-/g, '_')}`.slice(0, 60);
      const { error: e1 } = await supabase.from('cot_atributos').insert({ clave, nombre: `Opción de ${nombre}`, orden: 100 });
      if (e1) return { error: `No se pudieron crear las opciones: ${e1.message}` };
      const { error: e2 } = await supabase
        .from('cot_atributo_valores')
        .insert(opciones.map((o, orden) => ({ atributo: clave, valor: o.valor, etiqueta: o.etiqueta, orden })));
      if (e2) return { error: `No se pudieron crear las opciones: ${e2.message}` };
      atributos = [clave];
    }

    const { data: ins, error: e3 } = await supabase
      .from('cot_insumos')
      .insert({ codigo, tipo, nombre, unidad, atributos, proveedor_id: proveedorId, minimo, minimo_por: minimoPor, orden: 1000 })
      .select('id')
      .single();
    if (e3) return { error: `No se pudo guardar: ${e3.message}` };

    const precios = opciones.length
      ? opciones.map((o) => ({ variante: { [atributos[0]]: o.valor }, precio: o.precio }))
      : [{ variante: {}, precio: precioUnico }];
    for (const p of precios) {
      const { error: e4 } = await supabase.rpc('cot_cambiar_precio', {
        p_insumo: ins.id,
        p_variante: p.variante,
        p_precio: p.precio,
        p_referencia: null,
        p_nota: null,
      });
      if (e4) return { error: `Se creó, pero falló un precio: ${e4.message}` };
    }
    revalidatePath(RUTA);
    return { ok: `Agregado en la pestaña ${PESTANA_DE[tipo] ?? 'Otros'}` };
  } catch (e) {
    return error(e);
  }
}

/** Suma una opción con su precio a un costo que tiene opciones. */
export async function agregarOpcion(insumoId: string, _prev: EstadoPanel, fd: FormData): Promise<EstadoPanel> {
  try {
    const { supabase } = await exigirPermisoCostos();
    const etiqueta = texto(fd.get('etiqueta'));
    const precio = leerMonto(String(fd.get('precio') ?? ''));
    if (!etiqueta) return { error: 'Escribí el nombre de la opción.' };
    if (!(precio > 0)) return { error: 'Escribí el precio.' };
    const { data: ins } = await supabase.from('cot_insumos').select('atributos').eq('id', insumoId).maybeSingle();
    const clave = ((ins?.atributos ?? []) as string[])[0];
    if (!clave || !clave.startsWith('v_')) return { error: 'Este costo no admite opciones nuevas desde acá.' };
    const valor = slug(etiqueta);
    if (!valor) return { error: 'El nombre no es válido.' };
    const { error: e1 } = await supabase.from('cot_atributo_valores').insert({ atributo: clave, valor, etiqueta, orden: 100 });
    if (e1) return { error: e1.message.includes('duplicate') ? 'Ya existe esa opción.' : e1.message };
    const { error: e2 } = await supabase.rpc('cot_cambiar_precio', {
      p_insumo: insumoId,
      p_variante: { [clave]: valor },
      p_precio: precio,
      p_referencia: null,
      p_nota: null,
    });
    if (e2) return { error: e2.message };
    revalidatePath(RUTA);
    return { ok: 'Opción agregada' };
  } catch (e) {
    return error(e);
  }
}

/** Deja de ofrecer un costo. Los presupuestos hechos con él no cambian. */
export async function darDeBajaInsumo(insumoId: string): Promise<EstadoPanel> {
  try {
    const { supabase } = await exigirPermisoCostos();
    const { error: e } = await supabase.from('cot_insumos').update({ activo: false }).eq('id', insumoId);
    if (e) return { error: e.message };
    revalidatePath(RUTA);
    return { ok: 'Dado de baja' };
  } catch (e) {
    return error(e);
  }
}

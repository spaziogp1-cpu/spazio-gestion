import 'server-only';
// =====================================================================
// Cálculo para presupuestos.
//
// Los vendedores no pueden leer costos en la base, pero el precio sale
// de los costos. Por eso el cálculo corre acá, en el servidor, con la
// clave de servicio, y a quien no tiene el permiso cotizador.costos se
// le devuelve solo el precio de venta. El navegador nunca recibe costos
// de alguien sin permiso, ni puede pedir esta información directo.
// =====================================================================
import type { SupabaseClient } from '@supabase/supabase-js';
import { crearAdmin } from '@/lib/supabase/admin';
import { cargarCatalogo } from './catalogo';
import { cotizar, entradasVisibles } from './motor';
import { leerReceta } from './receta';
import type { Aviso, Catalogo, Receta, ResultadoCalculo } from './tipos';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export type ProductoVenta = {
  id: string;
  nombre: string;
  categoria: string | null;
  foto_url: string | null;
  descripcion: string | null;
  recetaId: string;
  entradas: Receta['entradas'];
};

/** Lo que necesita la pantalla del vendedor: productos cotizables, sus entradas y las etiquetas de opciones. */
export async function catalogoVenta(): Promise<{ productos: ProductoVenta[]; etiquetas: Record<string, Record<string, string>>; muestras: Record<string, string> }> {
  const db = crearAdmin();
  const [{ data: prods }, { data: vals }] = await Promise.all([
    db
      .from('cot_productos')
      .select('id, nombre, foto_url, descripcion, orden, receta_publicada_id, cot_categorias(nombre, orden), cot_recetas!cot_productos_receta_fk(definicion)')
      .eq('activo', true)
      .not('receta_publicada_id', 'is', null)
      .order('orden')
      .order('nombre'),
    db.from('cot_atributo_valores').select('atributo, valor, etiqueta, muestra, activo').eq('activo', true).order('orden'),
  ]);
  type Fila = {
    id: string;
    nombre: string;
    foto_url: string | null;
    descripcion: string | null;
    receta_publicada_id: string;
    cot_categorias: { nombre: string; orden: number } | null;
    cot_recetas: { definicion: unknown } | null;
  };
  const productos = ((prods ?? []) as unknown as Fila[])
    .filter((p) => p.cot_recetas)
    .map((p) => ({
      id: p.id,
      nombre: p.nombre,
      categoria: p.cot_categorias?.nombre ?? null,
      orden: p.cot_categorias?.orden ?? 999,
      foto_url: p.foto_url,
      descripcion: p.descripcion,
      recetaId: p.receta_publicada_id,
      entradas: leerReceta(p.cot_recetas!.definicion).entradas,
    }))
    .sort((a, b) => a.orden - b.orden)
    .map(({ orden: _o, ...p }) => p);
  const etiquetas: Record<string, Record<string, string>> = {};
  const muestras: Record<string, string> = {};
  for (const v of (vals ?? []) as { atributo: string; valor: string; etiqueta: string; muestra: string | null }[]) {
    (etiquetas[v.atributo] ??= {})[v.valor] = v.etiqueta;
    if (v.atributo === 'color' && v.muestra) muestras[v.valor] = v.muestra;
  }
  return { productos, etiquetas, muestras };
}

export type CalculoItem = {
  productoId: string;
  productoNombre: string;
  recetaId: string;
  receta: Receta;
  margen: number;
  valores: Record<string, number | string>;
  resultado: ResultadoCalculo;
  detalle: string;
};

/** Calcula un producto con su receta publicada y el margen vigente. */
export async function calcularItem(
  productoId: string,
  valores: Record<string, number | string>,
  cantidad: number,
  cache?: { catalogo?: Catalogo; db?: Db },
): Promise<CalculoItem> {
  const db = cache?.db ?? crearAdmin();
  const [{ data: prod }, { data: margen }] = await Promise.all([
    db
      .from('cot_productos')
      .select('id, nombre, activo, receta_publicada_id, cot_recetas!cot_productos_receta_fk(definicion)')
      .eq('id', productoId)
      .maybeSingle(),
    db.from('cot_margenes').select('margen').eq('producto_id', productoId).maybeSingle(),
  ]);
  const p = prod as unknown as { id: string; nombre: string; activo: boolean; receta_publicada_id: string | null; cot_recetas: { definicion: unknown } | null } | null;
  if (!p || !p.activo) throw new Error('Ese producto no existe o no se cotiza.');
  if (!p.receta_publicada_id || !p.cot_recetas) throw new Error(`${p.nombre} no tiene una receta publicada.`);
  if (!margen) throw new Error(`Falta cargar el margen de ${p.nombre} (Ajustes → Cotizador → Productos y recetas).`);

  const receta = leerReceta(p.cot_recetas.definicion);
  const catalogo = cache?.catalogo ?? (await cargarCatalogo(db));
  if (cache) cache.catalogo = catalogo;
  // Solo se usan los valores de entradas que existen y se piden.
  const visibles = new Set(entradasVisibles(receta, valores));
  const limpios: Record<string, number | string> = {};
  for (const k of Object.keys(receta.entradas)) if (visibles.has(k) && valores[k] != null && valores[k] !== '') limpios[k] = valores[k];
  const resultado = cotizar({ receta, catalogo, valores: limpios, cantidad, margen: Number(margen.margen) });
  return {
    productoId: p.id,
    productoNombre: p.nombre,
    recetaId: p.receta_publicada_id,
    receta,
    margen: Number(margen.margen),
    valores: limpios,
    resultado,
    detalle: describirItem(receta, limpios, catalogo),
  };
}

/** "140 × 60 × 35 cm · Bronce · 10 mm" a partir de lo elegido. */
export function describirItem(receta: Receta, valores: Record<string, number | string>, catalogo: Catalogo): string {
  const medidas: string[] = [];
  const opciones: string[] = [];
  const visibles = new Set(entradasVisibles(receta, valores));
  for (const [k, e] of Object.entries(receta.entradas)) {
    if (!visibles.has(k)) continue;
    const v = valores[k] ?? e.def;
    if (v == null || v === '') continue;
    if (e.tipo === 'medida') medidas.push(`${/^di[aá]metro$/i.test(e.nombre) ? 'Ø ' : ''}${String(v).replace('.', ',')}`);
    else {
      const etq = (e.atributo && catalogo.valores[e.atributo]?.[String(v)]?.etiqueta) || String(v);
      opciones.push(e.nombre.toLowerCase() === 'color' ? etq : `${e.nombre.toLowerCase()} ${etq}`);
    }
  }
  return [medidas.length ? `${medidas.join(' × ')} cm` : '', ...opciones].filter(Boolean).join(' · ');
}

/** Lo que puede ver alguien sin permiso de costos. */
export type ResultadoVenta = {
  ok: boolean;
  precioUnitario: number;
  precioUnitarioCuotas: number;
  precioTotal: number;
  precioTotalCuotas: number;
  estimado: boolean;
  avisos: Aviso[];
  detalle: string;
  // Solo con permiso de costos:
  costos?: {
    costoUnitario: number;
    margen: number;
    margenReal: number;
    lineas: { nombre: string; costo: number; estimado?: string; minimoAplicado?: string }[];
  };
};

export function paraVenta(c: CalculoItem, verCostos: boolean): ResultadoVenta {
  const r = c.resultado;
  const base: ResultadoVenta = {
    ok: r.ok,
    precioUnitario: r.precioUnitario,
    precioUnitarioCuotas: r.precioUnitarioCuotas,
    precioTotal: r.precioTotal,
    precioTotalCuotas: r.precioTotalCuotas,
    estimado: r.lineas.some((l) => l.estimado),
    // Los avisos dicen qué falta o qué está estimado, sin montos.
    avisos: r.avisos.map((a) => ({ nivel: a.nivel, mensaje: a.mensaje })),
    detalle: c.detalle,
  };
  if (!verCostos) return base;
  return {
    ...base,
    costos: {
      costoUnitario: r.costoUnitario,
      margen: r.margen,
      margenReal: r.margenReal,
      lineas: r.lineas.map((l) => ({ nombre: l.nombre, costo: l.costo, estimado: l.estimado, minimoAplicado: l.minimoAplicado })),
    },
  };
}

/** Reglas generales que necesita el presupuesto (redondeo, cuotas, tope, validez). */
export async function reglasPresupuesto(db?: Db) {
  const { data } = await (db ?? crearAdmin()).from('cot_ajustes').select('clave, valor');
  const a = Object.fromEntries(((data ?? []) as { clave: string; valor: number | string }[]).map((x) => [x.clave, Number(x.valor)]));
  return {
    redondeo: a.redondeo || 1,
    recargoCuotas: a.recargo_cuotas ?? 0,
    topeDescuento: a.tope_descuento ?? 0.1,
    validezDias: a.validez_dias || 7,
  };
}

export const subirA = (n: number, m: number) => (m > 0 ? Math.ceil(n / m - 1e-9) * m : Math.round(n));

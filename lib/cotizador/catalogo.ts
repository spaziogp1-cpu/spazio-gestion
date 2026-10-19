// Arma el catálogo que usa el motor a partir de las filas de la base.
// Las tarifas solo las puede leer quien tiene el permiso cotizador.costos:
// para cotizar como vendedor, esto se llama con el cliente de servidor.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Catalogo, Insumo, Tarifa, TipoInsumo, Unidad } from './tipos';

export type FilaInsumo = {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  unidad: string;
  atributos: string[] | null;
  minimo: number | string | null;
  minimo_por: string | null;
  activo?: boolean;
};
export type FilaTarifa = {
  id: number | string;
  insumo_id: string;
  variante: Record<string, string> | null;
  referencia: number | string | null;
  precio: number | string;
  minimo: number | string | null;
  incremento: number | string | null;
  nota: string | null;
};
export type FilaValor = { atributo: string; valor: string; etiqueta: string; grupos: string[] | null; activo?: boolean };
export type FilaAjuste = { clave: string; valor: number | string };

const n = (v: number | string | null | undefined) => (v == null || v === '' ? null : Number(v));

export function armarCatalogo(insumos: FilaInsumo[], tarifas: FilaTarifa[], valores: FilaValor[], ajustes: FilaAjuste[]): Catalogo {
  const porInsumo = new Map<string, Tarifa[]>();
  for (const t of tarifas) {
    const lista = porInsumo.get(t.insumo_id) ?? [];
    lista.push({
      id: t.id,
      variante: t.variante ?? {},
      precio: Number(t.precio),
      referencia: n(t.referencia),
      minimo: n(t.minimo),
      incremento: n(t.incremento),
      nota: t.nota,
    });
    porInsumo.set(t.insumo_id, lista);
  }
  const cat: Catalogo = { insumos: {}, valores: {}, ajustes: {} };
  for (const i of insumos) {
    if (i.activo === false) continue;
    const ins: Insumo = {
      id: i.id,
      codigo: i.codigo,
      nombre: i.nombre,
      tipo: i.tipo as TipoInsumo,
      unidad: i.unidad as Unidad,
      atributos: i.atributos ?? [],
      minimo: n(i.minimo),
      minimo_por: (i.minimo_por as 'pieza' | 'item' | null) ?? null,
      tarifas: porInsumo.get(i.id) ?? [],
    };
    cat.insumos[i.codigo] = ins;
  }
  for (const v of valores) {
    (cat.valores[v.atributo] ??= {})[v.valor] = { etiqueta: v.etiqueta, grupos: v.grupos ?? [] };
  }
  for (const a of ajustes) cat.ajustes[a.clave] = Number(a.valor);
  return cat;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function cargarCatalogo(db: SupabaseClient<any, any, any>): Promise<Catalogo> {
  const [ins, tar, val, aj] = await Promise.all([
    db.from('cot_insumos').select('id, codigo, nombre, tipo, unidad, atributos, minimo, minimo_por, activo'),
    db.from('cot_tarifas').select('id, insumo_id, variante, referencia, precio, minimo, incremento, nota').is('vigente_hasta', null).limit(10000),
    db.from('cot_atributo_valores').select('atributo, valor, etiqueta, grupos, activo'),
    db.from('cot_ajustes').select('clave, valor'),
  ]);
  const error = ins.error ?? tar.error ?? val.error ?? aj.error;
  if (error) throw new Error(`No se pudo leer el catálogo de costos: ${error.message}`);
  return armarCatalogo(
    (ins.data ?? []) as FilaInsumo[],
    (tar.data ?? []) as FilaTarifa[],
    (val.data ?? []) as FilaValor[],
    (aj.data ?? []) as FilaAjuste[],
  );
}

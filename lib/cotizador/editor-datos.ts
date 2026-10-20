// Lo que necesita el editor de recetas para armar sus listas: insumos,
// atributos con sus valores y, por insumo, qué valores tienen precio.
import type { SupabaseClient } from '@supabase/supabase-js';

export type InsumoEditor = {
  codigo: string;
  nombre: string;
  tipo: string;
  unidad: string;
  atributos: string[];
  /** atributo → valores que tienen precio cargado (incluye grupos como "color" o "gris-bronce") */
  valores: Record<string, string[]>;
  /** tiene precios por medida (STG) */
  porMedida: boolean;
};
export type AtributoEditor = { clave: string; nombre: string; valores: { valor: string; etiqueta: string }[] };
export type DatosEditor = { insumos: InsumoEditor[]; atributos: AtributoEditor[] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function cargarDatosEditor(db: SupabaseClient<any, any, any>): Promise<DatosEditor> {
  const [ins, tar, at, val] = await Promise.all([
    db.from('cot_insumos').select('id, codigo, nombre, tipo, unidad, atributos, orden').eq('activo', true).order('orden'),
    db.from('cot_tarifas').select('insumo_id, variante, referencia').is('vigente_hasta', null).limit(10000),
    db.from('cot_atributos').select('clave, nombre, orden').order('orden'),
    db.from('cot_atributo_valores').select('atributo, valor, etiqueta, orden, activo').eq('activo', true).order('orden'),
  ]);
  const error = ins.error ?? tar.error ?? at.error ?? val.error;
  if (error) throw new Error(`No se pudieron leer los costos: ${error.message}`);

  type FilaIns = { id: string; codigo: string; nombre: string; tipo: string; unidad: string; atributos: string[] | null };
  type FilaTar = { insumo_id: string; variante: Record<string, string> | null; referencia: number | null };
  const porInsumo = new Map<string, { valores: Map<string, Set<string>>; porMedida: boolean }>();
  for (const t of (tar.data ?? []) as FilaTar[]) {
    const x = porInsumo.get(t.insumo_id) ?? { valores: new Map(), porMedida: false };
    for (const [a, v] of Object.entries(t.variante ?? {})) {
      if (!x.valores.has(a)) x.valores.set(a, new Set());
      x.valores.get(a)!.add(v);
    }
    if (t.referencia != null) x.porMedida = true;
    porInsumo.set(t.insumo_id, x);
  }

  const insumos = ((ins.data ?? []) as FilaIns[]).map((i) => {
    const x = porInsumo.get(i.id);
    return {
      codigo: i.codigo,
      nombre: i.nombre,
      tipo: i.tipo,
      unidad: i.unidad,
      atributos: i.atributos ?? [],
      valores: Object.fromEntries([...(x?.valores ?? new Map()).entries()].map(([a, s]) => [a, [...s]])),
      porMedida: x?.porMedida ?? false,
    };
  });
  const valoresPor = new Map<string, { valor: string; etiqueta: string }[]>();
  for (const v of (val.data ?? []) as { atributo: string; valor: string; etiqueta: string }[]) {
    valoresPor.set(v.atributo, [...(valoresPor.get(v.atributo) ?? []), { valor: v.valor, etiqueta: v.etiqueta }]);
  }
  const atributos = ((at.data ?? []) as { clave: string; nombre: string }[]).map((a) => ({
    clave: a.clave,
    nombre: a.nombre,
    valores: valoresPor.get(a.clave) ?? [],
  }));
  return { insumos, atributos };
}

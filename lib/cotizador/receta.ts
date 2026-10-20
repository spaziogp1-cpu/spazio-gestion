// Lectura segura de una receta guardada en la base (jsonb) y datos que
// se derivan de ella. No depende de la base ni de React.
import { compilar } from './formula';
import type { Entrada, Linea, Receta, Regla } from './tipos';

const REGLAS: Regla[] = ['m2', 'ml', 'unidad', 'fijo', 'porcentaje', 'tabla', 'formula'];
const txt = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);

/** Convierte lo que venga de la base (o del editor) en una Receta con la forma correcta. */
export function leerReceta(crudo: unknown): Receta {
  const o = (crudo && typeof crudo === 'object' ? crudo : {}) as Record<string, unknown>;
  const entradas: Record<string, Entrada> = {};
  const ents = o.entradas && typeof o.entradas === 'object' ? (o.entradas as Record<string, Record<string, unknown>>) : {};
  // La base (jsonb) reordena las claves: se respeta el orden guardado aparte.
  const guardado = Array.isArray(o.orden) ? (o.orden as unknown[]).map(String).filter((k) => k in ents) : [];
  const claves = [...new Set([...guardado, ...Object.keys(ents)])];
  for (const k of claves) {
    const e = ents[k];
    if (!e || typeof e !== 'object') continue;
    const nombre = txt(e.nombre) ?? k;
    const mostrarSi = txt(e.mostrarSi) || undefined;
    if (e.tipo === 'medida') {
      entradas[k] = { tipo: 'medida', nombre, min: num(e.min), max: num(e.max), def: num(e.def), mostrarSi };
    } else {
      entradas[k] = {
        tipo: 'opcion',
        nombre,
        atributo: txt(e.atributo) || undefined,
        permitidos: Array.isArray(e.permitidos) ? e.permitidos.map(String).filter(Boolean) : undefined,
        def: txt(e.def) || undefined,
        mostrarSi,
      };
    }
  }
  const lineas: Linea[] = [];
  for (const l of Array.isArray(o.lineas) ? (o.lineas as Record<string, unknown>[]) : []) {
    if (!l || typeof l !== 'object') continue;
    const regla = REGLAS.includes(l.regla as Regla) ? (l.regla as Regla) : 'unidad';
    const variante: Record<string, string> = {};
    if (l.variante && typeof l.variante === 'object')
      for (const [a, f] of Object.entries(l.variante as Record<string, unknown>)) {
        const s = txt(f);
        if (s) variante[a] = s;
      }
    const linea: Linea = { id: txt(l.id) ?? '', nombre: txt(l.nombre) ?? '', regla };
    for (const campo of ['insumo', 'insumoFormula', 'condicion', 'cantidad', 'ancho', 'largo', 'metros', 'porcentaje', 'referencia', 'monto', 'nota'] as const) {
      const s = txt(l[campo]);
      if (s && s.trim() !== '') linea[campo] = s.trim();
    }
    if (Object.keys(variante).length) linea.variante = variante;
    if (Array.isArray(l.sobre)) linea.sobre = l.sobre.map(String).filter(Boolean);
    lineas.push(linea);
  }
  const precioMinimo = num(o.precioMinimo);
  return { entradas, orden: Object.keys(entradas), lineas, ...(precioMinimo ? { precioMinimo } : {}) };
}

/** Códigos de insumos que usa la receta (incluye los que aparecen entre comillas en una fórmula de insumo). */
export function insumosDeReceta(receta: Receta, codigosExistentes: string[]): string[] {
  const out = new Set<string>();
  const existe = new Set(codigosExistentes);
  for (const l of receta.lineas) {
    if (l.insumo) out.add(l.insumo);
    if (l.insumoFormula) {
      try {
        compilar(l.insumoFormula);
      } catch {
        continue;
      }
      for (const m of l.insumoFormula.matchAll(/'([^']+)'|"([^"]+)"/g)) {
        const c = m[1] ?? m[2];
        if (existe.has(c)) out.add(c);
      }
    }
  }
  return [...out].filter((c) => existe.has(c));
}

/** Un id corto para una línea a partir de su nombre: "Tapa superior" → tapa_superior. */
export function idDesdeNombre(nombre: string, usados: Iterable<string>): string {
  const base =
    nombre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^[0-9_]+/, '')
      .slice(0, 24) || 'pieza';
  const set = new Set(usados);
  let id = base;
  for (let n = 2; set.has(id); n++) id = `${base}_${n}`;
  return id;
}

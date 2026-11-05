// Plazos de producción según el producto.
// Todo lo que lleva estructura cromada (STG) tarda más que lo que es solo vidrio.
// Son días hábiles desde la venta; la fecha límite del pedido usa el máximo del rango.
import type { ReglaPlazo } from '@/lib/fechas';

export type Rango = { min: number; max: number };
export type Plazos = { normal: Rango; cromado: Rango };

export const PLAZOS_DEFECTO: Plazos = {
  normal: { min: 20, max: 25 },
  cromado: { min: 30, max: 35 },
};

/** Claves en la tabla parametros (se cambian en Ajustes → Plazos). */
export const CLAVES_PLAZO = {
  normal_min: 'plazo_normal_min',
  normal_max: 'plazo_normal_max',
  cromado_min: 'plazo_cromado_min',
  cromado_max: 'plazo_cromado_max',
} as const;

// Modelos cuya estructura cromada la hace STG (insumo "Estructura STG" del cotizador).
// La Cesca y la Cesca Cerrada no van: su estructura es de Alberto.
const MODELOS_CROMADOS = ['modulo', 'bar', 'binario', 'arcos', 'helios', 'saturno', 'nexo', 'duna'];

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const PALABRAS_CROMADO = /croma|cromo|\bstg\b/;

type ItemTexto = { producto?: string | null; modelo?: string | null; color?: string | null; puntas?: string | null; tapa?: string | null; material?: string | null; medidas?: string | null };

/** ¿El producto lleva estructura cromada? Mira el modelo y cualquier mención a "cromado". */
export function itemLlevaCromado(i: ItemTexto): boolean {
  const texto = sinAcentos([i.producto, i.modelo, i.color, i.puntas, i.tapa, i.material].filter(Boolean).join(' '));
  if (PALABRAS_CROMADO.test(texto)) return true;
  const nombre = sinAcentos([i.producto, i.modelo].filter(Boolean).join(' '));
  if (/cesca/.test(nombre)) return false;
  return MODELOS_CROMADOS.some((m) => new RegExp(`\\b${m}\\b`).test(nombre));
}

/** ¿El pedido lleva estructura cromada? Basta con un producto, o con que las observaciones lo digan. */
export function pedidoLlevaCromado(items: ItemTexto[], observaciones?: string | null): boolean {
  if (items.some(itemLlevaCromado)) return true;
  return Boolean(observaciones && /estructura cromada/.test(sinAcentos(observaciones)));
}

export function rangoDe(cromado: boolean, plazos: Plazos = PLAZOS_DEFECTO): Rango {
  return cromado ? plazos.cromado : plazos.normal;
}

/** Regla para la fecha límite: el máximo del rango, en días hábiles. */
export function reglaDe(cromado: boolean, plazos: Plazos = PLAZOS_DEFECTO): ReglaPlazo {
  return { dias: rangoDe(cromado, plazos).max, tipo: 'habiles' };
}

/** "20-25 días hábiles" */
export function textoRango(r: Rango): string {
  return `${r.min}-${r.max} días hábiles`;
}

export function leerPlazos(mapa: Map<string, string>): Plazos {
  const n = (clave: string, defecto: number) => {
    const v = Math.round(Number(mapa.get(clave)));
    return Number.isFinite(v) && v > 0 ? v : defecto;
  };
  const armar = (min: number, max: number): Rango => ({ min: Math.min(min, max), max: Math.max(min, max) });
  return {
    normal: armar(n(CLAVES_PLAZO.normal_min, PLAZOS_DEFECTO.normal.min), n(CLAVES_PLAZO.normal_max, PLAZOS_DEFECTO.normal.max)),
    cromado: armar(n(CLAVES_PLAZO.cromado_min, PLAZOS_DEFECTO.cromado.min), n(CLAVES_PLAZO.cromado_max, PLAZOS_DEFECTO.cromado.max)),
  };
}

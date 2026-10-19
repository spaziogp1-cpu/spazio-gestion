// Cómo se muestran las tarifas de un insumo en el panel: como grilla
// (espesor × color, como la lista de Vidpro) cuando tiene dos atributos, o
// como lista cuando tiene uno, ninguno o medidas de referencia (STG).

export type ValorAtributo = { valor: string; etiqueta: string; orden?: number | null };
export type TarifaPanel = {
  id: number | string;
  variante: Record<string, string>;
  referencia: number | null;
  precio: number;
  minimo: number | null;
  incremento: number | null;
  nota: string | null;
  vigente_desde: string;
};

// Columnas de precio de la lista que no son un valor elegible (grupos y rangos).
const ETIQUETAS_GRUPO: Record<string, string> = {
  'gris-bronce': 'Gris / bronce',
  color: 'Color',
  combinado: 'Combinado',
  satinado: 'Satinado',
  '4-6': '4 a 6 mm',
  '8-10': '8 a 10 mm',
  '12-15': '12 a 15 mm',
  '4-10': '4 a 10 mm',
  '12-20': '12 a 20 mm',
};

export function etiquetaValor(atributo: string, valor: string, valores: Record<string, ValorAtributo[]>): string {
  return valores[atributo]?.find((v) => v.valor === valor)?.etiqueta ?? ETIQUETAS_GRUPO[valor] ?? valor;
}

function posicion(atributo: string, valor: string, valores: Record<string, ValorAtributo[]>): number {
  const conocidos = valores[atributo] ?? [];
  const i = conocidos.findIndex((x) => x.valor === valor);
  return i < 0 ? Number.MAX_SAFE_INTEGER : (conocidos[i].orden ?? i);
}

function comparar(atributo: string, a: string, b: string, valores: Record<string, ValorAtributo[]>): number {
  return posicion(atributo, a, valores) - posicion(atributo, b, valores) || a.localeCompare(b, 'es', { numeric: true });
}

function ordenar(atributo: string, lista: string[], valores: Record<string, ValorAtributo[]>): string[] {
  return [...lista].sort((a, b) => comparar(atributo, a, b, valores));
}

export type Grilla =
  | { tipo: 'matriz'; filaAtributo: string; colAtributo: string; filas: string[]; columnas: string[]; celdas: Record<string, TarifaPanel> }
  | { tipo: 'lista'; filas: TarifaPanel[] };

export const claveCelda = (fila: string, col: string) => `${fila}\u0001${col}`;

export function armarGrilla(atributos: string[], tarifas: TarifaPanel[], valores: Record<string, ValorAtributo[]>): Grilla {
  if (atributos.length === 2 && tarifas.every((t) => t.referencia == null)) {
    const [fa, ca] = atributos;
    const filas = ordenar(fa, [...new Set(tarifas.map((t) => t.variante[fa]).filter(Boolean))], valores);
    const columnas = ordenar(ca, [...new Set(tarifas.map((t) => t.variante[ca]).filter(Boolean))], valores);
    const celdas: Record<string, TarifaPanel> = {};
    for (const t of tarifas) celdas[claveCelda(t.variante[fa], t.variante[ca])] = t;
    return { tipo: 'matriz', filaAtributo: fa, colAtributo: ca, filas, columnas, celdas };
  }
  const filas = [...tarifas].sort((a, b) => {
    for (const x of atributos) {
      const c = comparar(x, a.variante[x] ?? '', b.variante[x] ?? '', valores);
      if (c) return c;
    }
    return (a.referencia ?? 0) - (b.referencia ?? 0);
  });
  return { tipo: 'lista', filas };
}

/** Grupo de pestañas del panel para cada tipo de insumo. */
export const PESTANAS = [
  { clave: 'vidrios', nombre: 'Vidrios', tipos: ['vidrio'] },
  { clave: 'espejos', nombre: 'Espejos', tipos: ['espejo'] },
  { clave: 'procesos', nombre: 'Procesos', tipos: ['proceso'] },
  { clave: 'mano-de-obra', nombre: 'Mano de obra', tipos: ['mano_obra'] },
  { clave: 'estructuras', nombre: 'Estructuras', tipos: ['estructura'] },
  { clave: 'otros', nombre: 'Otros', tipos: ['madera', 'herraje', 'embalaje', 'flete', 'otro'] },
] as const;

export const UNIDADES: Record<string, string> = {
  m2: 'por m²',
  ml: 'por metro lineal',
  unidad: 'por unidad',
  fijo: 'precio fijo',
  kg: 'por kg',
  hora: 'por hora',
};

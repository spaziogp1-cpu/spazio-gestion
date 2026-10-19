// Tipos del cotizador. El motor no conoce la base de datos: recibe estos
// objetos ya cargados y devuelve el resultado.

export type Unidad = 'm2' | 'ml' | 'unidad' | 'fijo' | 'kg' | 'hora';
export type TipoInsumo =
  | 'vidrio'
  | 'espejo'
  | 'madera'
  | 'estructura'
  | 'herraje'
  | 'proceso'
  | 'mano_obra'
  | 'embalaje'
  | 'flete'
  | 'otro';

export type Tarifa = {
  id?: number | string;
  variante: Record<string, string>;
  precio: number;
  referencia?: number | null;
  minimo?: number | null;
  incremento?: number | null;
  nota?: string | null;
};

export type Insumo = {
  id?: string;
  codigo: string;
  nombre: string;
  tipo: TipoInsumo;
  unidad: Unidad;
  atributos: string[];
  minimo?: number | null;
  minimo_por?: 'pieza' | 'item' | null;
  tarifas: Tarifa[];
};

/** Valores de atributos con sus grupos de precio (rosa → "color"). */
export type ValoresAtributos = Record<string, Record<string, { etiqueta?: string; grupos: string[] }>>;

export type Catalogo = {
  insumos: Record<string, Insumo>;
  valores: ValoresAtributos;
  /** Reglas generales: recargo_cuotas, redondeo, ajuste_vidpro... */
  ajustes: Record<string, number>;
};

// ---------------------------------------------------------------------
// Recetas
// ---------------------------------------------------------------------
export type EntradaMedida = { tipo: 'medida'; nombre: string; min?: number; max?: number; def?: number };
export type EntradaOpcion = {
  tipo: 'opcion';
  nombre: string;
  atributo?: string; // de qué atributo salen los valores (color, espesor...)
  permitidos?: string[]; // si falta, todos los activos del atributo
  def?: string;
};
export type Entrada = EntradaMedida | EntradaOpcion;

export type Regla = 'm2' | 'ml' | 'unidad' | 'fijo' | 'porcentaje' | 'tabla' | 'formula';

export type Linea = {
  id: string; // corto y sin espacios: tapa, lat, uv
  nombre: string;
  regla: Regla;
  insumo?: string; // código del insumo (no hace falta en "porcentaje")
  insumoFormula?: string; // alternativa: una fórmula que devuelve el código
  variante?: Record<string, string>; // atributo → fórmula
  condicion?: string; // si es falsa, la línea no va
  cantidad?: string; // cuántas piezas (por defecto 1)
  ancho?: string; // cm, para m2
  largo?: string; // cm, para m2
  metros?: string; // metros lineales por pieza, para ml (si falta en una pieza con ancho y largo: el perímetro)
  porcentaje?: string; // para "porcentaje": 0.20 o aj.ajuste_vidpro
  sobre?: string[]; // ids de líneas anteriores sobre las que se calcula el porcentaje
  referencia?: string; // para "tabla": la medida con la que se busca o estima el precio
  monto?: string; // para "formula": el costo; puede usar "precio" (la tarifa)
  nota?: string;
};

export type Receta = {
  entradas: Record<string, Entrada>;
  lineas: Linea[];
  precioMinimo?: number | null;
};

// ---------------------------------------------------------------------
// Pedido de cálculo y resultado
// ---------------------------------------------------------------------
export type PedidoCalculo = {
  receta: Receta;
  catalogo: Catalogo;
  valores: Record<string, number | string>; // medidas y opciones elegidas
  cantidad?: number;
  margen: number; // 0.45 = 45% sobre el precio de venta
};

export type LineaResultado = {
  id: string;
  nombre: string;
  regla: Regla;
  insumo?: string;
  insumoNombre?: string;
  variante?: Record<string, string>;
  cantidad: number;
  ancho?: number;
  largo?: number;
  medida: number; // m², metros o unidades que se cobran (con mínimos)
  medidaReal: number; // sin mínimos
  unidad: Unidad | 'porcentaje';
  precioUnitario: number;
  costo: number;
  minimoAplicado?: string;
  estimado?: string; // texto interno: "estimada, confirmar con STG"
  tarifaId?: number | string;
};

export type Aviso = { nivel: 'error' | 'advertencia'; linea?: string; mensaje: string };

export type ResultadoCalculo = {
  ok: boolean;
  lineas: LineaResultado[];
  costoUnitario: number;
  precioUnitario: number; // transferencia, redondeado
  precioUnitarioCuotas: number;
  cantidad: number;
  costoTotal: number;
  precioTotal: number;
  precioTotalCuotas: number;
  margen: number;
  margenReal: number; // después del redondeo
  avisos: Aviso[];
  /** Copia de todo lo que se usó, para la foto del presupuesto. */
  tarifasUsadas: { insumo: string; tarifa: Tarifa }[];
  motor: string;
};

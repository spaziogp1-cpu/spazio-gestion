// Cómo se ve un producto del presupuesto en el pedido (las columnas de la planilla:
// producto, modelo, medidas, color, material, puntas, tapa). Sin base ni servidor.
import type { Receta } from './tipos';

const PRODUCTO_POR_CATEGORIA: Record<string, string> = {
  'mesas ratonas': 'mesa ratona',
  'mesas auxiliares': 'mesa auxiliar',
  'mesas de comedor': 'mesa alta',
  escritorios: 'escritorio',
  'recibidores y consolas': 'recibidor',
  espejos: 'espejo',
  estantes: 'estante',
  'sillas y taburetes': 'silla',
};

export type ItemPedido = {
  producto: string;
  modelo: string;
  medidas: string;
  color: string;
  material: string;
  puntas: string;
  tapa: string;
  precio: number;
  cantidad: number;
};

export function itemParaPedido(d: {
  titulo: string;
  categoria: string | null;
  receta: Receta | null;
  valores: Record<string, number | string>;
  etiquetas: Record<string, Record<string, string>>;
  /** variante del primer vidrio calculado (espesor o composición) */
  vidrio?: Record<string, string> | null;
  precio: number;
  cantidad: number;
}): ItemPedido {
  const medidas: string[] = [];
  let color = '';
  let puntas = '';
  let tapa = '';
  for (const [k, e] of Object.entries(d.receta?.entradas ?? {})) {
    const v = d.valores[k];
    if (v == null || v === '') continue;
    if (e.tipo === 'medida') {
      medidas.push(String(v).replace('.', ','));
      continue;
    }
    const etq = ((e.atributo && d.etiquetas[e.atributo]?.[String(v)]) || String(v)).toLowerCase();
    if (k === 'color' || e.atributo === 'color') color = etq;
    else if (k === 'puntas') puntas = etq;
    else if (k === 'terminacion' || /tapa/i.test(e.nombre)) tapa = etq;
  }
  const esp = d.vidrio?.composicion ?? (d.vidrio?.espesor ? `${d.vidrio.espesor}mm` : '');
  return {
    producto: PRODUCTO_POR_CATEGORIA[(d.categoria ?? '').toLowerCase()] ?? 'mueble',
    modelo: d.titulo.replace(/^mesa\s+/i, '').toLowerCase(),
    medidas: medidas.join('x'),
    color,
    material: esp,
    puntas,
    tapa,
    precio: d.precio,
    cantidad: d.cantidad,
  };
}

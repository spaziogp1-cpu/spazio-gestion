import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armarGrilla, claveCelda, etiquetaValor, type TarifaPanel } from './grilla';

const t = (id: number, variante: Record<string, string>, precio: number, referencia: number | null = null): TarifaPanel => ({
  id, variante, precio, referencia, minimo: null, incremento: null, nota: null, vigente_desde: '2026-10-15',
});
const valores = {
  espesor: [
    { valor: '3', etiqueta: '3 mm', orden: 0 },
    { valor: '8', etiqueta: '8 mm', orden: 4 },
    { valor: '10', etiqueta: '10 mm', orden: 5 },
  ],
  color: [{ valor: 'incoloro', etiqueta: 'Incoloro', orden: 0 }],
  modelo: [
    { valor: 'helios', etiqueta: 'Helios', orden: 5 },
    { valor: 'saturno', etiqueta: 'Mesa Saturno', orden: 10 },
  ],
};

test('vidrio con dos atributos se muestra como la lista de Vidpro', () => {
  const g = armarGrilla(['espesor', 'color'], [t(1, { espesor: '10', color: 'gris-bronce' }, 115500), t(2, { espesor: '3', color: 'incoloro' }, 23700), t(3, { espesor: '10', color: 'incoloro' }, 73500)], valores);
  assert.equal(g.tipo, 'matriz');
  if (g.tipo !== 'matriz') return;
  assert.deepEqual(g.filas, ['3', '10']);
  assert.deepEqual(g.columnas, ['incoloro', 'gris-bronce']);
  assert.equal(g.celdas[claveCelda('10', 'gris-bronce')].precio, 115500);
  assert.equal(g.celdas[claveCelda('3', 'gris-bronce')], undefined);
  assert.equal(etiquetaValor('color', 'gris-bronce', valores), 'Gris / bronce');
});

test('estructuras con medida de referencia se muestran como lista ordenada', () => {
  const g = armarGrilla(['modelo'], [t(1, { modelo: 'saturno' }, 270000, 90), t(2, { modelo: 'helios' }, 200000, 130), t(3, { modelo: 'saturno' }, 200000, 50)], valores);
  assert.equal(g.tipo, 'lista');
  if (g.tipo !== 'lista') return;
  assert.deepEqual(g.filas.map((f) => f.id), [2, 3, 1]);
});

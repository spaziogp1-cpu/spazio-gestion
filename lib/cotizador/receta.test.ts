import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idDesdeNombre, insumosDeReceta, leerReceta } from './receta';

test('lee una receta de la base y descarta lo que no corresponde', () => {
  const r = leerReceta({
    entradas: {
      L: { tipo: 'medida', nombre: 'Largo', min: '60', max: 200, def: 120 },
      color: { tipo: 'opcion', nombre: 'Color', atributo: 'color', permitidos: ['bronce', 'rosa'], mostrarSi: '' },
      roto: 'nada',
    },
    lineas: [
      { id: 'tapa', nombre: 'Tapa', regla: 'm2', insumo: 'vidrio-float', ancho: 'L', largo: ' P ', variante: { color: 'color', vacio: '' }, extra: 1 },
      { id: 'raro', nombre: 'Raro', regla: 'inventada' },
      null,
    ],
    precioMinimo: 0,
  });
  assert.deepEqual(r.entradas.L, { tipo: 'medida', nombre: 'Largo', min: 60, max: 200, def: 120, mostrarSi: undefined });
  assert.equal(r.entradas.roto, undefined);
  assert.equal(r.lineas.length, 2);
  assert.deepEqual(r.lineas[0], { id: 'tapa', nombre: 'Tapa', regla: 'm2', insumo: 'vidrio-float', ancho: 'L', largo: 'P', variante: { color: 'color' } });
  assert.equal(r.lineas[1].regla, 'unidad');
  assert.equal(r.precioMinimo, undefined);
  assert.deepEqual(leerReceta(null), { entradas: {}, orden: [], lineas: [] });
  // El orden guardado manda (la base devuelve las claves ordenadas a su manera).
  const ordenada = leerReceta({ entradas: { H: { tipo: 'medida', nombre: 'Alto' }, L: { tipo: 'medida', nombre: 'Largo' }, color: { tipo: 'opcion', nombre: 'Color' } }, orden: ['L', 'H', 'color', 'no-existe'], lineas: [] });
  assert.deepEqual(Object.keys(ordenada.entradas), ['L', 'H', 'color']);
  assert.deepEqual(ordenada.orden, ['L', 'H', 'color']);
});

test('insumos que usa una receta', () => {
  const r = leerReceta({
    entradas: {},
    lineas: [
      { id: 'a', nombre: 'A', regla: 'm2', insumoFormula: "si(en(color, 'gris'), 'vidrio-float', 'vidrio-laminado')" },
      { id: 'b', nombre: 'B', regla: 'ml', insumo: 'pegado-uv' },
      { id: 'c', nombre: 'C', regla: 'porcentaje' },
    ],
  });
  assert.deepEqual(insumosDeReceta(r, ['vidrio-float', 'vidrio-laminado', 'pegado-uv']).sort(), ['pegado-uv', 'vidrio-float', 'vidrio-laminado']);
});

test('id de línea a partir del nombre', () => {
  assert.equal(idDesdeNombre('Tapa superior', []), 'tapa_superior');
  assert.equal(idDesdeNombre('Tapa', ['tapa']), 'tapa_2');
  assert.equal(idDesdeNombre('2 laterales', []), 'laterales');
  assert.equal(idDesdeNombre('Pegado ÚV', []), 'pegado_uv');
  assert.equal(idDesdeNombre('—', []), 'pieza');
});

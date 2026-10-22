import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemParaPedido } from './a-pedido-mapeo';
import { leerReceta } from './receta';

const etiquetas = { color: { incoloro: 'Incoloro', rosa: 'Rosa' } };

test('Mesa Luna al pedido, como en la planilla', () => {
  const receta = leerReceta({
    orden: ['L', 'P', 'H', 'color', 'puntas'],
    entradas: {
      H: { tipo: 'medida', nombre: 'Alto de las bases' },
      L: { tipo: 'medida', nombre: 'Largo' },
      P: { tipo: 'medida', nombre: 'Profundidad' },
      color: { tipo: 'opcion', nombre: 'Color', atributo: 'color' },
      puntas: { tipo: 'opcion', nombre: 'Puntas', permitidos: ['redondeadas', 'rectas'] },
    },
    lineas: [],
  });
  const it = itemParaPedido({
    titulo: 'Mesa Luna',
    categoria: 'Mesas ratonas',
    receta,
    valores: { L: 100, P: 70, H: 35, color: 'rosa', puntas: 'redondeadas' },
    etiquetas,
    vidrio: { composicion: '5+5', color: 'rosa' },
    precio: 675000,
    cantidad: 1,
  });
  assert.deepEqual(it, { producto: 'mesa ratona', modelo: 'luna', medidas: '100x70x35', color: 'rosa', material: '5+5', puntas: 'redondeadas', tapa: '', precio: 675000, cantidad: 1 });
});

test('Aire alta redonda: tapa de melamina y espesor de float', () => {
  const receta = leerReceta({
    orden: ['D', 'H', 'terminacion', 'color'],
    entradas: {
      D: { tipo: 'medida', nombre: 'Diámetro' },
      H: { tipo: 'medida', nombre: 'Alto' },
      terminacion: { tipo: 'opcion', nombre: 'Tapa', permitidos: ['Madera roble'] },
      color: { tipo: 'opcion', nombre: 'Vidrio', atributo: 'color' },
    },
    lineas: [],
  });
  const it = itemParaPedido({
    titulo: 'Mesa Aire Alta Redonda',
    categoria: 'Mesas de comedor',
    receta,
    valores: { D: 120, H: 76, terminacion: 'Madera roble', color: 'incoloro' },
    etiquetas,
    vidrio: { espesor: '10', color: 'incoloro' },
    precio: 711000,
    cantidad: 2,
  });
  assert.equal(it.producto, 'mesa alta');
  assert.equal(it.modelo, 'aire alta redonda');
  assert.equal(it.medidas, '120x76');
  assert.equal(it.tapa, 'madera roble');
  assert.equal(it.material, '10mm');
  assert.equal(it.cantidad, 2);
  assert.equal(itemParaPedido({ titulo: 'Cosa', categoria: null, receta: null, valores: {}, etiquetas, precio: 1, cantidad: 1 }).producto, 'mueble');
});

test('sillas, taburetes y espejos como en la planilla', () => {
  const etiquetas = { tapizado: { mocca: 'Mocca' } };
  const receta = { entradas: { color: { tipo: 'opcion' as const, nombre: 'Tapizado', atributo: 'tapizado' } }, lineas: [] };
  const silla = itemParaPedido({ titulo: 'Silla Cesca', categoria: 'Sillas y taburetes', receta, valores: { color: 'mocca' }, etiquetas, precio: 1, cantidad: 4 });
  assert.equal(silla.producto, 'sillas');
  assert.equal(silla.modelo, 'cesca');
  assert.equal(silla.color, 'mocca');
  const tab = itemParaPedido({ titulo: 'Taburete Duna', categoria: 'Sillas y taburetes', receta, valores: {}, etiquetas, precio: 1, cantidad: 1 });
  assert.equal(tab.producto, 'taburete');
  assert.equal(tab.modelo, 'duna');
  const esp = itemParaPedido({ titulo: 'Espejo Personalizado', categoria: 'Personalizados', receta: null, valores: {}, etiquetas, precio: 1, cantidad: 1 });
  assert.deepEqual([esp.producto, esp.modelo], ['espejos', 'personalizado']);
});

test('combos de la web', () => {
  const a = itemParaPedido({ titulo: 'Combo Mesa Tiempo + 4 Sillas Cesca', categoria: 'Combos', receta: null, valores: {}, etiquetas: {}, precio: 1, cantidad: 1 });
  assert.deepEqual([a.producto, a.modelo], ['mesa alta', 'tiempo + 4 sillas cesca']);
  const b = itemParaPedido({ titulo: 'Combo Silla Duna', categoria: 'Combos', receta: null, valores: {}, etiquetas: {}, precio: 1, cantidad: 1 });
  assert.deepEqual([b.producto, b.modelo], ['sillas', 'duna']);
});

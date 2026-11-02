import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filtrarPedidos, leerFiltros, ordenarPedidos, ordenValido } from './pedidos-orden';

const base = {
  canal: 'whatsapp', responsable_id: null as string | null, envio: 'flete', tipo_venta: 'minorista',
  fecha_entrega_programada: null as string | null, total: 100, saldo: 0,
};
const ps = [
  { ...base, numero: 1, cliente_nombre: 'Zoe', fecha_venta: '2026-10-01', fecha_limite: '2026-11-19', creado_en: '2026-10-01T10:00:00Z', total: 300, saldo: '50' },
  { ...base, numero: 2, cliente_nombre: 'ana', fecha_venta: '2026-10-05', fecha_limite: '2026-11-10', creado_en: '2026-10-20T10:00:00Z', canal: 'instagram', fecha_entrega_programada: '2026-11-04' },
  { ...base, numero: 3, cliente_nombre: 'Bruno', fecha_venta: '2026-10-03', fecha_limite: '2026-11-15', creado_en: '2026-10-03T10:00:00Z', responsable_id: 'm1', total: 50, saldo: 200 },
];
const nums = (l: { numero: number }[]) => l.map((p) => p.numero);

test('ordenamientos', () => {
  assert.deepEqual(nums(ordenarPedidos(ps, 'limite')), [2, 3, 1]);
  assert.deepEqual(nums(ordenarPedidos(ps, 'creado_desc')), [2, 3, 1]);
  assert.deepEqual(nums(ordenarPedidos(ps, 'creado_asc')), [1, 3, 2]);
  assert.deepEqual(nums(ordenarPedidos(ps, 'venta_desc')), [2, 3, 1]);
  assert.deepEqual(nums(ordenarPedidos(ps, 'entrega')), [2, 3, 1]);
  assert.deepEqual(nums(ordenarPedidos(ps, 'saldo_desc')), [3, 1, 2]);
  assert.deepEqual(nums(ordenarPedidos(ps, 'total_desc')), [1, 2, 3]);
  assert.deepEqual(nums(ordenarPedidos(ps, 'cliente')), [2, 3, 1]);
  assert.deepEqual(nums(ordenarPedidos(ps, 'numero_desc')), [3, 2, 1]);
  assert.deepEqual(nums(ps), [1, 2, 3], 'no modifica la lista original');
});

test('filtros extra', () => {
  assert.deepEqual(nums(filtrarPedidos(ps, { canal: 'instagram' })), [2]);
  assert.deepEqual(nums(filtrarPedidos(ps, { responsable: 'm1' })), [3]);
  assert.deepEqual(nums(filtrarPedidos(ps, { responsable: 'ninguno' })), [1, 2]);
  assert.deepEqual(nums(filtrarPedidos(ps, { desde: '2026-10-02', hasta: '2026-10-04' })), [3]);
  assert.deepEqual(nums(filtrarPedidos(ps, {})), [1, 2, 3]);
});

test('parámetros de la URL', () => {
  assert.equal(ordenValido('creado_desc'), 'creado_desc');
  assert.equal(ordenValido('cualquiera'), null);
  const f = leerFiltros({ canal: 'tiendanube', desde: '2026-10-01', hasta: 'ayer', resp: "x' or 1=1" });
  assert.deepEqual(f, { canal: 'tiendanube', responsable: undefined, envio: undefined, tipo: undefined, desde: '2026-10-01', hasta: undefined });
});

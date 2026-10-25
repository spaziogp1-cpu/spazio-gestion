import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretar } from './interpretar';

const HOY = new Date(Date.UTC(2026, 9, 25)); // domingo 25/10/2026

test('número de pedido', () => {
  assert.equal(interpretar('#557', HOY).numero, 557);
  assert.equal(interpretar('557', HOY).numero, 557);
  assert.equal(interpretar('pedido n° 1203', HOY).numero, 1203);
  assert.equal(interpretar('557 entregado', HOY).numero, 557);
});

test('teléfono en cualquier formato', () => {
  for (const t of ['+54 9 11 5555-4321', '11 5555 4321', '1155554321', '55554321']) {
    const c = interpretar(t, HOY);
    assert.equal(c.digitos, '55554321', t);
    assert.equal(c.numero, null);
  }
});

test('filtros de pedidos', () => {
  const c = interpretar('pedidos atrasados con saldo de octubre', HOY);
  assert.equal(c.filtros.atrasado, true);
  assert.equal(c.filtros.con_saldo, true);
  assert.equal(c.filtros.desde, '2026-10-01');
  assert.equal(c.filtros.hasta, '2026-10-31');
  assert.equal(c.texto, '');
  assert.deepEqual(c.entendido, ['Atrasados', 'Con saldo', 'Octubre']);
});

test('mes futuro es del año pasado; año explícito', () => {
  assert.equal(interpretar('noviembre', HOY).filtros.desde, '2025-11-01');
  assert.equal(interpretar('septiembre 2026', HOY).filtros.hasta, '2026-09-30');
  assert.equal(interpretar('mar del plata', HOY).filtros.desde, undefined);
});

test('etapas, envío y canal sin acentos', () => {
  const c = interpretar('Fabricadas por expreso tienda nube', HOY);
  assert.deepEqual(c.filtros.etapas, ['lista']);
  assert.equal(c.filtros.envio, 'expreso');
  assert.equal(c.filtros.canal, 'tiendanube');
  assert.deepEqual(interpretar('señados', HOY).filtros.etapas, ['senado']);
  assert.deepEqual(interpretar('en fabricación', HOY).filtros.etapas, ['en_fabricacion']);
});

test('texto libre con filtros', () => {
  const c = interpretar('mesa eclipse bronce entregadas', HOY);
  assert.equal(c.texto, 'mesa eclipse bronce');
  assert.deepEqual(c.filtros.etapas, ['entregado']);
});

test('medidas no son número de pedido', () => {
  const c = interpretar('160x90 aire', HOY);
  assert.equal(c.numero, null);
  assert.equal(c.texto, '160x90 aire');
});

test('vendedor y semana', () => {
  const c = interpretar('vendidos por tete esta semana', HOY);
  assert.equal(c.filtros.vendedor, 'tete');
  assert.equal(c.filtros.desde, '2026-10-19');
  assert.equal(c.filtros.hasta, '2026-10-25');
});

test('solo un tipo', () => {
  assert.equal(interpretar('cliente fernandez', HOY).filtros.solo, 'clientes');
  assert.equal(interpretar('presupuesto 120', HOY).numero, 120);
  assert.equal(interpretar('presupuesto 120', HOY).filtros.solo, 'presupuestos');
  assert.equal(interpretar('clientes', HOY).filtros.solo, undefined);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerPlazos, pedidoLlevaCromado, itemLlevaCromado, reglaDe, textoRango, rangoDe } from './plazos';
import { calcularFechaLimite } from './fechas';

test('detecta estructura cromada', () => {
  assert.equal(itemLlevaCromado({ producto: 'mesa ratona', modelo: 'saturno' }), true);
  assert.equal(itemLlevaCromado({ producto: 'mesa auxiliar', modelo: 'arcos' }), true);
  assert.equal(itemLlevaCromado({ producto: 'recibidores', modelo: 'Módulo II' }), true);
  assert.equal(itemLlevaCromado({ producto: 'sillas', modelo: 'duna' }), true);
  assert.equal(itemLlevaCromado({ producto: 'mesa ratona', modelo: 'luna', material: 'base cromada' }), true);
  assert.equal(itemLlevaCromado({ producto: 'mesa ratona', modelo: 'gravedad', material: '10mm' }), false);
  assert.equal(itemLlevaCromado({ producto: 'sillas', modelo: 'cesca', color: 'negro' }), false);
  assert.equal(itemLlevaCromado({ producto: 'sillas', modelo: 'cesca cerrada' }), false);
  assert.equal(itemLlevaCromado({ producto: 'mesa', modelo: 'barra' }), false);
  assert.equal(pedidoLlevaCromado([{ producto: 'mesa', modelo: 'luz' }], 'Lleva estructura cromada'), true);
  assert.equal(pedidoLlevaCromado([{ producto: 'mesa', modelo: 'luz' }, { producto: 'mesa auxiliar', modelo: 'binario' }]), true);
});

test('plazo y fecha límite', () => {
  const p = leerPlazos(new Map());
  assert.equal(textoRango(rangoDe(false, p)), '20-25 días hábiles');
  assert.equal(textoRango(rangoDe(true, p)), '30-35 días hábiles');
  // Jueves 5/11/2026 + 25 hábiles (sin feriados) = jueves 10/12; + 35 = jueves 24/12
  assert.equal(calcularFechaLimite('2026-11-05', reglaDe(false, p), new Set()), '2026-12-10');
  assert.equal(calcularFechaLimite('2026-11-05', reglaDe(true, p), new Set()), '2026-12-24');
  const otro = leerPlazos(new Map([['plazo_cromado_max', '40'], ['plazo_normal_min', 'x']]));
  assert.deepEqual(otro, { normal: { min: 20, max: 25 }, cromado: { min: 30, max: 40 } });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emailResumen, lineaWhatsApp } from './resumen-email';
import type { Resumen } from '../resumen';

const vacio: Resumen = {
  hoy: '2026-10-19', tareasVencidas: [], tareasHoy: [], tareasProximas: [], visitasHoy: [], entregasHoy: [], entregasSemana: [],
  atrasados: [], porVencer: [], listasSinAvisar: [], saldos: [], proveedoresDemorados: [], objetivos: [],
};

test('resumen vacío', () => {
  const e = emailResumen('Teo', vacio);
  assert.match(e.asunto, /Tu día en Spazio/);
  assert.match(e.html, /No tenés nada pendiente/);
  assert.equal(lineaWhatsApp(vacio), 'nada pendiente');
});

test('resumen con atrasos y tareas escapa HTML', () => {
  const r: Resumen = {
    ...vacio,
    tareasVencidas: [{ id: 't1', titulo: 'Llamar <Vidpro>', vencimiento: '2026-10-17', vencida: true, pedido_id: null } as never],
    atrasados: [{ id: 'p1', numero: 484, cliente_nombre: 'Tadeo', fecha_limite: '2026-10-10' } as never],
  };
  const e = emailResumen('Teo', r);
  assert.match(e.asunto, /2 cosas atrasadas/);
  assert.match(e.html, /Llamar &lt;Vidpro&gt;/);
  assert.match(e.texto, /PEDIDOS ATRASADOS/);
  assert.equal(lineaWhatsApp(r), '1 tarea (1 vencidas), 1 pedidos atrasados');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fechaCorta, fechaLarga, linkCalendario, linkWhatsapp, porDia } from './turnos';

test('fechas en castellano', () => {
  assert.equal(fechaLarga('2026-10-26'), 'lunes 26 de octubre');
  assert.deepEqual(fechaCorta('2026-10-31'), { dia: 'sáb', numero: 31, mes: 'oct' });
});

test('agrupa por día y saca los llenos', () => {
  const r = porDia([
    { fecha: '2026-10-26', hora: '10:00:00', libres: 0 },
    { fecha: '2026-10-26', hora: '10:30:00', libres: 1 },
    { fecha: '2026-10-27', hora: '10:00:00', libres: 2 },
  ]);
  assert.deepEqual(r.map(([d, hs]) => [d, hs.map((h) => h.hora)]), [['2026-10-26', ['10:30']], ['2026-10-27', ['10:00']]]);
});

test('links', () => {
  assert.match(linkCalendario('2026-10-26', '10:30', 30, 'Av. Siempreviva 742'), /dates=20261026T133000Z%2F20261026T140000Z/);
  assert.equal(linkWhatsapp('11 5555-1234'), 'https://wa.me/5491155551234');
  assert.equal(linkWhatsapp('+54 9 11 5555 1234', 'Hola'), 'https://wa.me/5491155551234?text=Hola');
  assert.equal(linkWhatsapp(''), null);
});

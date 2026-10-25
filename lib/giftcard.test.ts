import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorMonto, fechaVencimiento, mensajeEntrega, normalizarCodigo, numeroWhatsApp } from './giftcard';

test('montos: mínimo $50.000 y múltiplos de $10.000, sin máximo', () => {
  assert.equal(errorMonto(50_000), null);
  assert.equal(errorMonto(1_230_000), null);
  assert.equal(errorMonto(25_000_000), null);
  assert.match(errorMonto(40_000)!, /mínimo/);
  assert.match(errorMonto(55_000)!, /múltiplo/);
  assert.match(errorMonto(0)!, /monto/);
});

test('vencimiento: mismo día 3 meses después, o el último día del mes', () => {
  assert.equal(fechaVencimiento('2026-10-25', '2026-10-25'), '2027-01-25');
  assert.equal(fechaVencimiento('2026-11-30', '2026-11-30'), '2027-02-28');
  assert.equal(fechaVencimiento('2027-11-30', '2027-11-30'), '2028-02-29');
  assert.equal(fechaVencimiento('2026-12-15', '2026-12-15'), '2027-03-15');
});

test('vencimiento: cuenta desde la fecha más tardía (elegida o acreditación)', () => {
  // Pidió que arranque el 1/12 y transfirió antes: corre desde el 1/12.
  assert.equal(fechaVencimiento('2026-12-01', '2026-10-27'), '2027-03-01');
  // Eligió hoy pero la transferencia se acreditó días después: corre desde la acreditación.
  assert.equal(fechaVencimiento('2026-10-25', '2026-10-28'), '2027-01-28');
});

test('código: acepta con o sin guiones y en minúscula; rechaza letras confusas', () => {
  assert.equal(normalizarCodigo('spz-k7q4-m9xd'), 'SPZ-K7Q4-M9XD');
  assert.equal(normalizarCodigo('K7Q4 M9XD'), 'SPZ-K7Q4-M9XD');
  assert.equal(normalizarCodigo('SPZ-K7Q4-M9X'), null);
  assert.equal(normalizarCodigo('SPZ-K7Q0-M9XD'), null);
});

test('WhatsApp: números argentinos', () => {
  assert.equal(numeroWhatsApp('11 7060-9239'), '5491170609239');
  assert.equal(numeroWhatsApp('011 15 7060-9239'), '5491170609239');
  assert.equal(numeroWhatsApp('+54 9 11 7060 9239'), '5491170609239');
  assert.equal(numeroWhatsApp('123'), null);
});

test('mensaje de entrega incluye código, vencimiento y saldo', () => {
  const m = mensajeEntrega({ codigo: 'SPZ-K7Q4-M9XD', monto: 500000, para: 'Lucía', de: 'Ana y Martín', dedicatoria: null, vence: '2027-01-25', urlSaldo: 'https://x/gift-card/saldo' });
  assert.match(m, /SPZ-K7Q4-M9XD/);
  assert.match(m, /25\/01\/2027/);
  assert.match(m, /\$500\.000/);
});

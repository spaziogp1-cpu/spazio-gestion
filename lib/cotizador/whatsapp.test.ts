import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textoWhatsApp } from './whatsapp';

test('texto de WhatsApp de un producto', () => {
  const t = textoWhatsApp({
    numero: 1024,
    cliente: 'Laura Gómez',
    items: [{ titulo: 'Mesa Luna', detalle: '140 × 60 × 35 cm · Bronce · espesor 10 mm', cantidad: 1, total: 362000 }],
    subtotal: 362000,
    descuentoPct: 0,
    total: 362000,
    totalCuotas: 460000,
    validoHasta: '2026-10-27',
  });
  assert.equal(
    t,
    [
      'Hola Laura! Te paso el presupuesto N° 1024 de Spazio Design:',
      '',
      '• Mesa Luna 140 × 60 × 35 cm · Bronce · espesor 10 mm',
      '',
      '*$ 362.000* por transferencia',
      '$ 460.000 en cuotas',
      '',
      'Válido hasta el 27 de octubre.',
    ].join('\n'),
  );
});

test('varios productos y descuento', () => {
  const t = textoWhatsApp({
    numero: 1025,
    cliente: '',
    items: [
      { titulo: 'Mesa Luna', detalle: null, cantidad: 1, total: 362000 },
      { titulo: 'Mesa auxiliar', detalle: '45 × 45 cm', cantidad: 2, total: 300000 },
    ],
    subtotal: 662000,
    descuentoPct: 0.05,
    total: 629000,
    totalCuotas: 799000,
    validoHasta: '2026-11-01',
  });
  assert.match(t, /^Hola! /);
  assert.match(t, /• 2 × Mesa auxiliar 45 × 45 cm\n {2}\$ 300\.000/);
  assert.match(t, /Descuento 5%\n\*\$ 629\.000\* por transferencia/);
  assert.match(t, /1 de noviembre/);
});

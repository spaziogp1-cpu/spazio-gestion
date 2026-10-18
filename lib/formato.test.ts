import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerMonto, linkWhatsApp } from './formato';

test('montos en distintos formatos', () => {
  assert.equal(leerMonto('1.350.000'), 1350000);
  assert.equal(leerMonto('1350000'), 1350000);
  assert.equal(leerMonto('$ 1.350.000,50'), 1350000.5);
  assert.equal(leerMonto('1350000.00'), 1350000);
  assert.equal(leerMonto('248000.5'), 248000.5);
  assert.equal(leerMonto(''), 0);
  assert.equal(leerMonto(null), 0);
  assert.equal(leerMonto(496000), 496000);
});

test('link de WhatsApp con teléfonos de la planilla', () => {
  assert.equal(linkWhatsApp('54 9 11 2390-3739'), 'https://wa.me/5491123903739');
  assert.equal(linkWhatsApp('11 6168-1930'), 'https://wa.me/5491161681930');
  assert.equal(linkWhatsApp('543364637202'), 'https://wa.me/5493364637202');
  assert.equal(linkWhatsApp('2664648242'), 'https://wa.me/5492664648242');
  assert.equal(linkWhatsApp(''), null);
});

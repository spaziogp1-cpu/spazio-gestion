import { test } from 'node:test';
import assert from 'node:assert/strict';
import { precisionDe } from './tipos';

const base = { formatted_address: 'x', geometry: { location: { lat: 0, lng: 0 }, location_type: 'ROOFTOP' } };
test('precisión de la ubicación', () => {
  assert.equal(precisionDe({ ...base, address_components: [{ types: ['street_number'] }] }), 'exacta');
  assert.equal(precisionDe({ ...base, address_components: [{ types: ['street_number'] }], partial_match: true }), 'aproximada');
  assert.equal(precisionDe({ ...base, address_components: [{ types: ['route'] }] }), 'aproximada');
  assert.equal(precisionDe({ ...base, geometry: { location: { lat: 0, lng: 0 }, location_type: 'GEOMETRIC_CENTER' }, address_components: [{ types: ['street_number'] }] }), 'aproximada');
});

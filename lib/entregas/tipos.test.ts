import { test } from 'node:test';
import assert from 'node:assert/strict';
import { direccionCompleta, franja, leerCoordenadas, linkMapa, unidadesTexto } from './tipos';

test('coordenadas copiadas de Google Maps', () => {
  assert.deepEqual(leerCoordenadas('-34.5975, -58.4372'), { lat: -34.5975, lng: -58.4372 });
  assert.deepEqual(leerCoordenadas('(-34,5975; -58,4372)'), { lat: -34.5975, lng: -58.4372 });
  assert.equal(leerCoordenadas('40.7, -74.0'), null); // fuera de Argentina
  assert.equal(leerCoordenadas('Belaustegui 355'), null);
});

test('textos', () => {
  assert.equal(direccionCompleta({ direccion: 'Belaustegui 355', localidad: 'CABA', codigo_postal: null }), 'Belaustegui 355, CABA, Argentina');
  assert.equal(franja('09:00:00', '12:00:00'), '09:00 a 12:00');
  assert.equal(franja(null, '12:00'), '');
  assert.equal(unidadesTexto(4), '4');
  assert.equal(unidadesTexto(0.25), '¼');
  assert.equal(unidadesTexto(1.5), '1½');
  assert.equal(unidadesTexto(0), '0');
});

test('link al mapa', () => {
  assert.equal(linkMapa({ lat: -34.6, lng: -58.4, direccion: null, localidad: null, codigo_postal: null, place_id: null }), 'https://www.google.com/maps/search/?api=1&query=-34.6%2C-58.4');
  assert.match(linkMapa({ lat: null, lng: null, direccion: 'Corrientes 1234', localidad: 'CABA', codigo_postal: null, place_id: null })!, /query=Corrientes\+1234%2C\+CABA%2C\+Argentina/);
  assert.equal(linkMapa({ lat: null, lng: null, direccion: null, localidad: null, codigo_postal: null, place_id: null }), null);
});

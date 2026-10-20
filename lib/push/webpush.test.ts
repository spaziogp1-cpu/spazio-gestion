import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDecipheriv, createECDH, createPublicKey, hkdfSync, randomBytes, verify } from 'node:crypto';
import { b64url, cifrar, desdeB64url, encabezadoVapid, generarClavesVapid } from './webpush';

// Descifra como lo haría el navegador (RFC 8291), para comprobar el cifrado.
function descifrar(cuerpo: Buffer, uaPrivada: ReturnType<typeof createECDH>, auth: Buffer): string {
  const sal = cuerpo.subarray(0, 16);
  const largo = cuerpo[20];
  const asPublica = cuerpo.subarray(21, 21 + largo);
  const datos = cuerpo.subarray(21 + largo);
  const compartido = uaPrivada.computeSecret(asPublica);
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), uaPrivada.getPublicKey(), asPublica]);
  const ikm = Buffer.from(hkdfSync('sha256', compartido, auth, info, 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, sal, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, sal, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(datos.subarray(datos.length - 16));
  const plano = Buffer.concat([d.update(datos.subarray(0, datos.length - 16)), d.final()]);
  assert.equal(plano[plano.length - 1], 2, 'falta el delimitador del último registro');
  return plano.subarray(0, plano.length - 1).toString();
}

test('el mensaje cifrado se descifra con las claves del navegador', () => {
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const auth = randomBytes(16);
  const s = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: b64url(ua.getPublicKey()), auth: b64url(auth) };
  const msj = JSON.stringify({ titulo: 'Entrega a las 15:00 · #542 Laura Pérez', url: '/avisos/abrir/1' });
  const cuerpo = cifrar(Buffer.from(msj), s);
  assert.equal(cuerpo.readUInt32BE(16), 4096);
  assert.equal(descifrar(cuerpo, ua, auth), msj);
  // Cada envío usa sal y clave efímera nuevas.
  assert.notDeepEqual(cifrar(Buffer.from(msj), s).subarray(0, 16), cuerpo.subarray(0, 16));
});

test('acepta las claves en base64 común (con + / =)', () => {
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const auth = randomBytes(16);
  const s = { endpoint: 'https://web.push.apple.com/x', p256dh: ua.getPublicKey().toString('base64'), auth: auth.toString('base64') };
  assert.equal(descifrar(cifrar(Buffer.from('hola'), s), ua, auth), 'hola');
});

test('el JWT de VAPID está bien firmado y apunta al servicio del endpoint', () => {
  const c = generarClavesVapid();
  assert.equal(desdeB64url(c.publica).length, 65);
  const h = encabezadoVapid('https://web.push.apple.com/QGd8/abc', c, 'mailto:hola@spaziodesign.net', Date.UTC(2026, 9, 20));
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h);
  assert.ok(m);
  const claims = JSON.parse(desdeB64url(m[2]).toString());
  assert.equal(claims.aud, 'https://web.push.apple.com');
  assert.equal(claims.sub, 'mailto:hola@spaziodesign.net');
  assert.equal(m[4], c.publica);
  const punto = desdeB64url(c.publica);
  const pub = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64url(punto.subarray(1, 33)), y: b64url(punto.subarray(33)) }, format: 'jwk' });
  assert.ok(verify('sha256', Buffer.from(`${m[1]}.${m[2]}`), { key: pub, dsaEncoding: 'ieee-p1363' }, desdeB64url(m[3])));
});

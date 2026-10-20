// Web Push sin dependencias: cifrado del mensaje (RFC 8291, aes128gcm) y firma VAPID (RFC 8292).
import { createCipheriv, createECDH, createPrivateKey, generateKeyPairSync, hkdfSync, randomBytes, sign, type KeyObject } from 'node:crypto';

export type ClavesVapid = { publica: string; privada: string }; // base64url: punto P-256 sin comprimir (65 bytes) y escalar d (32 bytes)
export type Suscripcion = { endpoint: string; p256dh: string; auth: string };

export const b64url = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');
export const desdeB64url = (s: string) => Buffer.from(s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), 'base64url');

export function generarClavesVapid(): ClavesVapid {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwkPub = publicKey.export({ format: 'jwk' });
  const jwkPriv = privateKey.export({ format: 'jwk' });
  const punto = Buffer.concat([Buffer.from([4]), desdeB64url(jwkPub.x!), desdeB64url(jwkPub.y!)]);
  return { publica: b64url(punto), privada: jwkPriv.d! };
}

function clavePrivada(c: ClavesVapid): KeyObject {
  const punto = desdeB64url(c.publica);
  return createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', x: b64url(punto.subarray(1, 33)), y: b64url(punto.subarray(33, 65)), d: c.privada },
    format: 'jwk',
  });
}

/** Encabezado Authorization con el JWT de VAPID para el servicio de push del endpoint. */
export function encabezadoVapid(endpoint: string, c: ClavesVapid, contacto: string, ahora = Date.now()): string {
  const aud = new URL(endpoint).origin;
  const cab = b64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const cuerpo = b64url(Buffer.from(JSON.stringify({ aud, exp: Math.floor(ahora / 1000) + 12 * 3600, sub: contacto })));
  const firma = sign('sha256', Buffer.from(`${cab}.${cuerpo}`), { key: clavePrivada(c), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${cab}.${cuerpo}.${b64url(firma)}, k=${c.publica}`;
}

/** Cifra el mensaje para una suscripción (un solo registro, aes128gcm). */
export function cifrar(mensaje: Buffer, s: Suscripcion, sal: Buffer = randomBytes(16)): Buffer {
  const uaPublica = desdeB64url(s.p256dh);
  const secretoAuth = desdeB64url(s.auth);
  const efimera = createECDH('prime256v1');
  efimera.generateKeys();
  const asPublica = efimera.getPublicKey();
  const compartido = efimera.computeSecret(uaPublica);
  const infoClave = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublica, asPublica]);
  const ikm = Buffer.from(hkdfSync('sha256', compartido, secretoAuth, infoClave, 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, sal, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, sal, Buffer.from('Content-Encoding: nonce\0'), 12));
  const cifrador = createCipheriv('aes-128-gcm', cek, nonce);
  const cuerpo = Buffer.concat([cifrador.update(Buffer.concat([mensaje, Buffer.from([2])])), cifrador.final(), cifrador.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([sal, rs, Buffer.from([asPublica.length]), asPublica, cuerpo]);
}

export type ResultadoPush = { ok: boolean; estado: number; vencida: boolean; error?: string };

/** Manda un push. "vencida" = la suscripción ya no existe (hay que borrarla). */
export async function enviarPush(
  s: Suscripcion,
  datos: unknown,
  c: ClavesVapid,
  opciones: { contacto: string; ttl?: number; urgencia?: 'very-low' | 'low' | 'normal' | 'high'; tema?: string },
): Promise<ResultadoPush> {
  const cuerpo = cifrar(Buffer.from(JSON.stringify(datos)), s);
  const cab: Record<string, string> = {
    Authorization: encabezadoVapid(s.endpoint, c, opciones.contacto),
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(opciones.ttl ?? 6 * 3600),
    Urgency: opciones.urgencia ?? 'normal',
  };
  if (opciones.tema) cab.Topic = opciones.tema.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
  try {
    const r = await fetch(s.endpoint, { method: 'POST', headers: cab, body: new Uint8Array(cuerpo) });
    const vencida = r.status === 404 || r.status === 410;
    return { ok: r.ok, estado: r.status, vencida, error: r.ok ? undefined : (await r.text().catch(() => '')).slice(0, 300) || `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, estado: 0, vencida: false, error: e instanceof Error ? e.message : String(e) };
  }
}

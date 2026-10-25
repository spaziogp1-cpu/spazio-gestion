import 'server-only';
import { createSign } from 'node:crypto';

// Token OAuth de la cuenta de servicio de Google (la misma de la planilla, GOOGLE_SERVICE_ACCOUNT_JSON).
// Route Optimization API no acepta claves de API: pide este token.

type Credenciales = { client_email: string; private_key: string; project_id?: string };
const cache = new Map<string, { token: string; vence: number }>();
const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');

export function credencialesGoogle(): Credenciales | null {
  const crudo = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!crudo) return null;
  try {
    const c = JSON.parse(crudo) as Credenciales;
    if (!c.client_email || !c.private_key) return null;
    return { ...c, private_key: c.private_key.replace(/\\n/g, '\n') };
  } catch {
    return null;
  }
}

/** Proyecto de Google Cloud donde se factura Route Optimization: GOOGLE_CLOUD_PROJECT o el de la cuenta de servicio. */
export const proyectoGoogle = () => process.env.GOOGLE_CLOUD_PROJECT || credencialesGoogle()?.project_id || null;

export async function tokenGoogle(scope = 'https://www.googleapis.com/auth/cloud-platform'): Promise<string> {
  const guardado = cache.get(scope);
  if (guardado && guardado.vence > Date.now() + 60_000) return guardado.token;
  const c = credencialesGoogle();
  if (!c) throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON');
  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const cuerpo = b64(JSON.stringify({ iss: c.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3600 }));
  const firma = createSign('RSA-SHA256').update(`${cabecera}.${cuerpo}`).sign(c.private_key);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${cabecera}.${cuerpo}.${b64(firma)}` }),
  });
  if (!r.ok) throw new Error(`Google no aceptó la cuenta de servicio (${r.status})`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  cache.set(scope, { token: j.access_token, vence: Date.now() + j.expires_in * 1000 });
  return j.access_token;
}

import 'server-only';
import { createSign } from 'node:crypto';

type Credenciales = { client_email: string; private_key: string };

let cache: { token: string; vence: number } | null = null;

export function planillaConfigurada(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.PLANILLA_ID);
}

function credenciales(): Credenciales {
  const crudo = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!crudo) throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON');
  let c: Credenciales;
  try {
    c = JSON.parse(crudo);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no es un JSON válido (pegá el archivo completo)');
  }
  if (!c.client_email || !c.private_key) throw new Error('Al JSON de la cuenta de servicio le falta client_email o private_key');
  return { client_email: c.client_email, private_key: c.private_key.replace(/\\n/g, '\n') };
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');

// Token de acceso de la cuenta de servicio (JWT firmado, flujo oficial de Google).
async function token(): Promise<string> {
  if (cache && cache.vence > Date.now() + 60_000) return cache.token;
  const c = credenciales();
  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const cuerpo = b64(
    JSON.stringify({
      iss: c.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      iat: ahora,
      exp: ahora + 3600,
    }),
  );
  const firma = createSign('RSA-SHA256').update(`${cabecera}.${cuerpo}`).sign(c.private_key);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${cabecera}.${cuerpo}.${b64(firma)}`,
    }),
  });
  if (!r.ok) throw new Error(`Google no aceptó la cuenta de servicio (${r.status}): ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  cache = { token: j.access_token, vence: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

/** Acepta el ID solo, el link completo de la planilla, o el valor con espacios/comillas. */
export function idPlanilla(crudo: string | undefined): string | null {
  if (!crudo) return null;
  const limpio = crudo.trim().replace(/^["']|["']$/g, '').trim();
  const m = limpio.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  const id = limpio.match(/[a-zA-Z0-9_-]{20,}/);
  return id ? id[0] : null;
}

async function sheets(ruta: string, init?: RequestInit) {
  const id = idPlanilla(process.env.PLANILLA_ID);
  if (!id) throw new Error('Falta PLANILLA_ID');
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}${ruta}`, {
    ...init,
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (r.status === 403) {
    const t = await r.text();
    if (/has not been used|is disabled|SERVICE_DISABLED/i.test(t))
      throw new Error('Falta activar la "Google Sheets API" en el proyecto de Google Cloud');
    throw new Error('La cuenta de servicio no tiene acceso: compartile la planilla como Editor');
  }
  if (r.status === 404)
    throw new Error(`No se encontró la planilla (ID usado: ${id.slice(0, 6)}…${id.slice(-4)}, ${id.length} caracteres): revisá PLANILLA_ID`);
  if (!r.ok) throw new Error(`Google Sheets ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

const rango = (a1: string) => encodeURIComponent(a1);

export async function leer(a1: string): Promise<string[][]> {
  const j = (await sheets(`/values/${rango(a1)}?valueRenderOption=FORMATTED_VALUE`)) as { values?: string[][] };
  return j.values ?? [];
}

export async function escribir(a1: string, valores: (string | number | null)[][]): Promise<void> {
  await sheets(`/values/${rango(a1)}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    body: JSON.stringify({ range: a1, majorDimension: 'ROWS', values: valores }),
  });
}

export async function escribirVarios(datos: { range: string; values: (string | number | null)[][] }[]): Promise<void> {
  if (!datos.length) return;
  await sheets(`/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: datos }),
  });
}

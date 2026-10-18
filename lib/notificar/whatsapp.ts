import 'server-only';
import type { ResultadoEnvio } from './email';

/**
 * Envía una plantilla aprobada de WhatsApp (Cloud API de Meta).
 * Queda inactivo hasta cargar WHATSAPP_TOKEN y WHATSAPP_PHONE_ID en Vercel.
 * Los parámetros no pueden tener saltos de línea (regla de Meta).
 */
export function whatsappConfigurado() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
}

/**
 * Normaliza un celular argentino al formato internacional 549 + área + número (10 dígitos).
 * Acepta "11 5555-5555", "011 15 5555-5555", "+54 9 11 5555 5555", "0221 15 555-5555", etc.
 */
export function telefonoWhatsApp(telefono: string | null | undefined): string | null {
  if (!telefono) return null;
  let d = telefono.replace(/\D/g, '').replace(/^00/, '');
  if (!d) return null;
  if (d.startsWith('54')) d = d.slice(2);
  d = d.replace(/^0/, '');
  if (d.startsWith('9') && d.length === 11) d = d.slice(1);
  // Quita el "15" que va después del código de área (2, 3 o 4 dígitos).
  if (d.length === 12) {
    for (const i of [2, 3, 4]) {
      if (d.slice(i, i + 2) === '15') {
        d = d.slice(0, i) + d.slice(i + 2);
        break;
      }
    }
  }
  return '549' + d;
}

const tapar = (n: string) => n.slice(0, -4).replace(/\d(?=\d{0,3}$)/g, '•') + n.slice(-4);

async function enviarA(destino: string, plantilla: string, parametros: string[]): Promise<{ ok: boolean; status?: number; cuerpo?: string }> {
  const version = process.env.WHATSAPP_API_VERSION || 'v25.0';
  const r = await fetch(`https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_ID!.trim()}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN!.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: destino,
      type: 'template',
      template: {
        name: plantilla,
        language: { code: process.env.WHATSAPP_IDIOMA || 'es_AR' },
        components: [
          {
            type: 'body',
            parameters: parametros.map((p) => ({ type: 'text', text: p.replace(/\s*\n+\s*/g, ' · ').slice(0, 900) })),
          },
        ],
      },
    }),
  });
  return r.ok ? { ok: true } : { ok: false, status: r.status, cuerpo: (await r.text()).slice(0, 300) };
}

export async function enviarPlantilla(telefono: string, plantilla: string, parametros: string[]): Promise<ResultadoEnvio> {
  if (!whatsappConfigurado()) return { ok: false, omitido: true, error: 'WhatsApp sin configurar' };
  const destino = telefonoWhatsApp(telefono);
  if (!destino) return { ok: false, error: 'Teléfono inválido' };
  try {
    // Celulares de Argentina: la lista de números de prueba de Meta a veces los guarda sin el 9
    // o con el 15 (54 11 15 xxxx-xxxx). Si Meta dice que el destinatario no está habilitado,
    // se prueban esas otras formas del mismo número.
    const formas = [destino];
    if (destino.startsWith('549') && destino.length === 13) {
      const n = destino.slice(3);
      formas.push('54' + n);
      for (const area of [2, 3, 4]) formas.push('54' + n.slice(0, area) + '15' + n.slice(area));
    }
    let r = await enviarA(formas[0], plantilla, parametros);
    for (const otra of formas.slice(1)) {
      if (r.ok || !r.cuerpo?.includes('131030')) break;
      r = await enviarA(otra, plantilla, parametros);
    }
    if (!r.ok && r.cuerpo?.includes('131030'))
      return { ok: false, error: `Meta no tiene habilitado ese número (probé ${formas.map(tapar).join(', ')}): revisá que coincida con el verificado en Meta.` };
    if (!r.ok) return { ok: false, error: `WhatsApp ${r.status}: ${r.cuerpo}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

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

export function telefonoWhatsApp(telefono: string | null | undefined): string | null {
  if (!telefono) return null;
  let d = telefono.replace(/\D/g, '');
  if (!d) return null;
  if (!d.startsWith('54')) d = '54' + d.replace(/^0/, '');
  if (!d.startsWith('549')) d = '549' + d.slice(2).replace(/^15/, '');
  return d;
}

export async function enviarPlantilla(telefono: string, plantilla: string, parametros: string[]): Promise<ResultadoEnvio> {
  if (!whatsappConfigurado()) return { ok: false, omitido: true, error: 'WhatsApp sin configurar' };
  const destino = telefonoWhatsApp(telefono);
  if (!destino) return { ok: false, error: 'Teléfono inválido' };
  const version = process.env.WHATSAPP_API_VERSION || 'v25.0';
  try {
    const r = await fetch(`https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
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
    if (!r.ok) return { ok: false, error: `WhatsApp ${r.status}: ${(await r.text()).slice(0, 300)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

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
    let r = await enviarA(destino, plantilla, parametros);
    // Celulares de Argentina: Meta a veces registra el número sin el 9 (54 11… en vez de 54 9 11…).
    // Si dice que el destinatario no está habilitado, se reintenta con ese formato.
    if (!r.ok && destino.startsWith('549') && r.cuerpo?.includes('131030')) {
      r = await enviarA('54' + destino.slice(3), plantilla, parametros);
    }
    if (!r.ok) return { ok: false, error: `WhatsApp ${r.status}: ${r.cuerpo}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

import 'server-only';

export type ResultadoEnvio = { ok: boolean; error?: string; omitido?: boolean };

// Envía un email con Resend (https://resend.com) usando su API directamente.
export async function enviarEmail(para: string, asunto: string, html: string, texto: string): Promise<ResultadoEnvio> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, omitido: true, error: 'Falta RESEND_API_KEY' };
  const remitente = process.env.EMAIL_REMITENTE || 'Spazio Gestión <onboarding@resend.dev>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: remitente, to: [para], subject: asunto, html, text: texto }),
    });
    if (!r.ok) return { ok: false, error: `Resend ${r.status}: ${(await r.text()).slice(0, 300)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

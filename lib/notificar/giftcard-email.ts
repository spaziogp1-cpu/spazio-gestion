import 'server-only';
import { fechaAR, fraseOcasion } from '@/lib/giftcard';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`;

export type DatosEmailGift = {
  para: string;
  de: string;
  monto: number;
  ocasion: string;
  dedicatoria: string | null;
  codigo: string;
  vence: string;
  urlSaldo: string;
  urlLogo: string;
  whatsapp: string | null;
};

// Correo de entrega a quien recibe la gift card (diseño "Luz filtrada" simplificado para email).
export function emailEntrega(d: DatosEmailGift): { asunto: string; html: string; texto: string } {
  const frase = fraseOcasion(d.ocasion);
  const asunto = `${d.de} te regaló una gift card de Spazio`;
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f2efe9;font-family:Helvetica,Arial,sans-serif;color:#1d1c1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2efe9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff">
<tr><td style="background:#f4f0e8;padding:24px 32px;border-bottom:1px solid #e2dcd2"><img src="${esc(d.urlLogo)}" alt="Spazio" width="110" style="display:block"></td></tr>
<tr><td style="padding:32px">
<h1 style="margin:0 0 20px;font-size:26px;font-weight:400;line-height:1.3">Hola, ${esc(d.para)}:<br>${esc(d.de)} te regaló una gift card de Spazio</h1>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f0e8;border-radius:16px"><tr>
<td style="padding:28px 24px;vertical-align:bottom">
<div style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#57534c">Gift card</div>
<div style="font-size:44px;line-height:1.1;margin:4px 0">${pesos(d.monto)}</div>
${frase ? `<div style="font-size:13px;font-style:italic;color:#6b655c">${esc(frase)}</div>` : ''}
<div style="font-family:Menlo,Consolas,monospace;font-size:18px;letter-spacing:1px;margin-top:18px">${esc(d.codigo)}</div>
<div style="font-size:13px;color:#57534c">Válida para pedir hasta el ${fechaAR(d.vence)}</div>
</td>
<td width="120" style="padding:20px 20px 20px 0" aria-hidden="true">
<div style="height:38px;background:#e3a23b"></div><div style="height:38px;background:#d9828a"></div><div style="height:38px;background:#7fae9c"></div><div style="height:22px;background:#8a8780"></div>
</td></tr></table>
${d.dedicatoria ? `<p style="margin:24px 0 0;padding:18px 20px;background:#f7f4ee;font-size:18px;font-weight:300;line-height:1.45">“${esc(d.dedicatoria)}”<br><span style="font-size:14px;color:#6b655c">— ${esc(d.de)}</span></p>` : ''}
<p style="font-size:16px;line-height:1.5;margin:24px 0 8px">Con esta tarjeta elegís tu pieza —el modelo, las medidas y el color de vidrio que quieras— y la hacemos a tu medida.</p>
<p style="font-size:15px;line-height:1.6;margin:0 0 20px;color:#3a3732">1. Mirá los modelos en spaziodesign.net.<br>2. Escribinos por WhatsApp con tu código y te asesoramos.<br>3. Al confirmar el pedido descontamos el saldo.</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:10px"><a href="${esc(d.urlSaldo)}" style="display:inline-block;padding:13px 22px;background:#1d1c1a;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:bold">Ver mi saldo</a></td>
${d.whatsapp ? `<td><a href="${esc(d.whatsapp)}" style="display:inline-block;padding:13px 22px;background:#e3a23b;color:#1d1c1a;text-decoration:none;border-radius:10px;font-weight:bold">Elegir mi pieza</a></td>` : ''}
</tr></table>
<p style="font-size:13px;line-height:1.5;color:#6b655c;margin:24px 0 0">Es un saldo en pesos, no un precio congelado. Si lo que elegís cuesta más, pagás la diferencia; si cuesta menos, el resto te queda hasta el vencimiento. Guardá este correo: es tu tarjeta.</p>
</td></tr></table>
<p style="font-size:12px;color:#6b655c">Spazio Design · spaziodesign.net</p>
</td></tr></table></body></html>`;
  const texto = [
    `Hola, ${d.para}: ${d.de} te regaló una gift card de Spazio por ${pesos(d.monto)}.`,
    d.dedicatoria ? `“${d.dedicatoria}” — ${d.de}` : '',
    `Código: ${d.codigo}`,
    `Válida para pedir hasta el ${fechaAR(d.vence)}.`,
    `Consultá tu saldo: ${d.urlSaldo}`,
    'Para usarla, escribinos por WhatsApp con tu código y te ayudamos a elegir tu pieza.',
  ]
    .filter(Boolean)
    .join('\n\n');
  return { asunto, html, texto };
}

// Aviso a quien compró: ya está activa (sin el código, que es de quien la recibe).
export function emailConfirmacionComprador(x: { comprador: string; para: string; monto: number; referencia: string; vence: string }) {
  const asunto = `Tu gift card ${x.referencia} ya está activa`;
  const texto = `¡Hola, ${x.comprador}! Recibimos tu transferencia y activamos la gift card de ${pesos(x.monto)} para ${x.para}. Ya se la mandamos. Tiene tiempo hasta el ${fechaAR(x.vence)} para hacer su pedido. ¡Gracias por regalar Spazio!`;
  const html = `<!doctype html><html lang="es"><body style="font-family:Helvetica,Arial,sans-serif;color:#1d1c1a;line-height:1.5"><p>${esc(texto)}</p><p style="color:#6b655c;font-size:13px">Spazio Design · Referencia ${esc(x.referencia)}</p></body></html>`;
  return { asunto, html, texto };
}

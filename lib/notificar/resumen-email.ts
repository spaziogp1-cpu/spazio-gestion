import { fechaCorta, horaCorta } from '@/lib/fechas';
import { plata } from '@/lib/formato';
import type { Resumen } from '@/lib/resumen';

export function urlApp(): string {
  const explicita = process.env.NEXT_PUBLIC_APP_URL;
  if (explicita) return explicita.replace(/\/+$/, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : 'https://spazio-gestion.vercel.app';
}

const esc = (s: string | null | undefined) =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

type Linea = { texto: string; detalle?: string; link?: string; mal?: boolean };
type Seccion = { titulo: string; lineas: Linea[]; mal?: boolean };

function secciones(r: Resumen): Seccion[] {
  const base = urlApp();
  const s: Seccion[] = [];
  const tareas = [...r.tareasVencidas, ...r.tareasHoy];
  if (tareas.length)
    s.push({
      titulo: 'Tus tareas',
      mal: r.tareasVencidas.length > 0,
      lineas: tareas.map((t) => ({
        texto: t.titulo,
        detalle: t.vencida ? `venció el ${fechaCorta(t.vencimiento)}` : 'para hoy',
        link: `${base}${t.pedido_id ? `/pedidos/${t.pedido_id}` : '/tareas'}`,
        mal: t.vencida,
      })),
    });
  if (r.visitasHoy.length)
    s.push({
      titulo: 'Visitas al showroom',
      lineas: r.visitasHoy.map((v) => ({ texto: `${horaCorta(v.hora) || 'Sin hora'} · ${v.nombre}`, detalle: v.motivo ?? undefined, link: `${base}/showroom` })),
    });
  if (r.entregasHoy.length)
    s.push({
      titulo: 'Entregas de hoy',
      lineas: r.entregasHoy.map((p) => ({ texto: `#${p.numero} ${p.cliente_nombre}`, detalle: [p.envio, p.cliente_localidad].filter(Boolean).join(' · '), link: `${base}/pedidos/${p.id}` })),
    });
  if (r.atrasados.length)
    s.push({
      titulo: 'Pedidos atrasados',
      mal: true,
      lineas: r.atrasados.map((p) => ({ texto: `#${p.numero} ${p.cliente_nombre}`, detalle: `venció el ${fechaCorta(p.fecha_limite)}`, link: `${base}/pedidos/${p.id}`, mal: true })),
    });
  if (r.porVencer.length)
    s.push({
      titulo: 'Vencen en los próximos días',
      lineas: r.porVencer.map((p) => ({ texto: `#${p.numero} ${p.cliente_nombre}`, detalle: `vence el ${fechaCorta(p.fecha_limite)}`, link: `${base}/pedidos/${p.id}` })),
    });
  if (r.listasSinAvisar.length)
    s.push({
      titulo: 'Listas para avisar al cliente',
      lineas: r.listasSinAvisar.map((p) => ({ texto: `#${p.numero} ${p.cliente_nombre}`, detalle: p.productos, link: `${base}/pedidos/${p.id}` })),
    });
  if (r.objetivos.length)
    s.push({
      titulo: 'Objetivos',
      lineas: r.objetivos.map((a) => ({
        texto: a.objetivo.titulo,
        detalle:
          a.objetivo.tipo === 'numerico'
            ? `${a.objetivo.metrica === 'facturacion' ? plata(a.actual) : a.actual} de ${a.objetivo.metrica === 'facturacion' ? plata(a.meta) : a.meta} (${a.porcentaje}%)`
            : `${a.porcentaje}% · ${a.tareasHechas}/${a.tareasTotal} tareas · para el ${fechaCorta(a.objetivo.fecha_limite)}`,
        link: `${base}/objetivos`,
      })),
    });
  if (r.saldos.length)
    s.push({
      titulo: 'Saldos por cobrar',
      lineas: [{ texto: plata(r.saldos.reduce((t, p) => t + Number(p.saldo), 0)), detalle: `en ${r.saldos.length} pedidos`, link: `${base}/pedidos?f=saldo` }],
    });
  return s;
}

export function emailResumen(nombre: string, r: Resumen): { asunto: string; html: string; texto: string } {
  const secs = secciones(r);
  const urgentes = r.tareasVencidas.length + r.atrasados.length;
  const asunto =
    urgentes > 0
      ? `Tu día en Spazio · ${urgentes} ${urgentes === 1 ? 'cosa atrasada' : 'cosas atrasadas'}`
      : `Tu día en Spazio · ${fechaCorta(r.hoy)}`;

  const cuerpo = secs.length
    ? secs
        .map(
          (s) => `
      <h2 style="font-size:15px;margin:22px 0 6px;color:${s.mal ? '#b42318' : '#1c1d1b'}">${esc(s.titulo)}</h2>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        ${s.lineas
          .map(
            (l) => `<tr><td style="padding:7px 0;border-bottom:1px solid #e2ded5;font-size:14px">
              <a href="${esc(l.link)}" style="color:${l.mal ? '#b42318' : '#1c1d1b'};text-decoration:none;font-weight:600">${esc(l.texto)}</a>
              ${l.detalle ? `<div style="color:#5c5e59;font-size:13px">${esc(l.detalle)}</div>` : ''}
            </td></tr>`,
          )
          .join('')}
      </table>`,
        )
        .join('')
    : '<p style="font-size:14px;color:#5c5e59">No tenés nada pendiente para hoy. ¡Buen día!</p>';

  const html = `<!doctype html><html><body style="margin:0;background:#f6f4ef;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1d1b">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="background:#fff;border:1px solid #e2ded5;border-radius:12px;padding:22px 20px">
      <div style="font-size:13px;color:#8b8d87">Spazio · Gestión</div>
      <h1 style="font-size:20px;margin:4px 0 0">Buen día, ${esc(nombre)}</h1>
      <div style="font-size:14px;color:#5c5e59;text-transform:capitalize">${esc(fechaCorta(r.hoy))}</div>
      ${cuerpo}
      <p style="margin:24px 0 0"><a href="${urlApp()}" style="display:inline-block;background:#1f4a44;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px">Abrir la app</a></p>
    </div>
  </div></body></html>`;

  const texto =
    `Buen día, ${nombre}\n${fechaCorta(r.hoy)}\n\n` +
    (secs.length
      ? secs.map((s) => `${s.titulo.toUpperCase()}\n${s.lineas.map((l) => `- ${l.texto}${l.detalle ? ` (${l.detalle})` : ''}`).join('\n')}`).join('\n\n')
      : 'No tenés nada pendiente para hoy.') +
    `\n\n${urlApp()}`;

  return { asunto, html, texto };
}

// Una línea para el WhatsApp del resumen (las plantillas no admiten saltos de línea).
export function lineaWhatsApp(r: Resumen): string {
  const partes: string[] = [];
  const tareas = r.tareasVencidas.length + r.tareasHoy.length;
  if (tareas) partes.push(`${tareas} ${tareas === 1 ? 'tarea' : 'tareas'}${r.tareasVencidas.length ? ` (${r.tareasVencidas.length} vencidas)` : ''}`);
  if (r.visitasHoy.length) partes.push(`${r.visitasHoy.length} ${r.visitasHoy.length === 1 ? 'visita' : 'visitas'}`);
  if (r.entregasHoy.length) partes.push(`${r.entregasHoy.length} ${r.entregasHoy.length === 1 ? 'entrega' : 'entregas'}`);
  if (r.atrasados.length) partes.push(`${r.atrasados.length} pedidos atrasados`);
  if (r.listasSinAvisar.length) partes.push(`${r.listasSinAvisar.length} listos para avisar`);
  return partes.length ? partes.join(', ') : 'nada pendiente';
}

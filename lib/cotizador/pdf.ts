// Presupuesto formal de Spazio Design en PDF (A4): presupuesto y, en la página siguiente,
// los mismos términos y condiciones del remito. Es para el cliente: no lleva costos,
// márgenes ni avisos internos (por ejemplo, los precios estimados de STG).
// Sin servidor ni base: recibe los datos ya armados y devuelve los bytes. Se puede probar.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { cortar, fechaRemito, pesos } from '@/lib/remitos/pdf';
import { PLAZO_TEXTO_DEFECTO, TERMINOS_INTRO, terminos } from '@/lib/remitos/textos';
import { LOGO_SPAZIO_PNG_BASE64 } from './logo-pdf';

export type ItemPresupuestoPdf = {
  titulo: string;
  detalle: string | null;
  cantidad: number;
  precioUnitario: number; // transferencia
  total: number; // transferencia
};

export type DatosPresupuestoPdf = {
  numero: number;
  fecha: string; // AAAA-MM-DD
  validoHasta: string; // AAAA-MM-DD
  cliente: string;
  telefono: string | null;
  vendedor: string | null;
  items: ItemPresupuestoPdf[];
  subtotal: number;
  descuentoPct: number; // 0.10 = 10 %
  descuentoMonto: number;
  total: number; // transferencia
  totalCuotas: number;
  plazo?: string; // "20-25 días hábiles"; con estructura cromada, "30-35 días hábiles"
  condiciones?: string | null; // condiciones particulares de este presupuesto
};

export const CONTACTO = {
  web: 'spaziodesign.net',
  whatsapp: '11 7060-9239',
  instagram: '@spazio.design1',
};

export function condicionesPresupuesto(d: Pick<DatosPresupuestoPdf, 'validoHasta' | 'plazo' | 'condiciones'>): string[] {
  const plazo = d.plazo ?? PLAZO_TEXTO_DEFECTO;
  const extra = (d.condiciones ?? '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
  return [
    ...extra,
    `Precios válidos hasta el ${fechaRemito(d.validoHasta)}. Pasada esa fecha pueden actualizarse.`,
    'El precio por transferencia es el valor de contado. El precio en cuotas corresponde al pago con tarjeta o Mercado Pago.',
    'Para confirmar el pedido se abona una seña; el saldo se abona antes de la entrega.',
    `Plazo estimado de producción: ${plazo} desde la confirmación del pedido.`,
    'El envío no está incluido y se cotiza aparte según la zona. También se puede retirar.',
    'Al confirmar el pedido se aceptan los términos y condiciones de la página siguiente.',
  ];
}

/** "Presupuesto 123 - Ana Pérez.pdf" (sin caracteres que Drive, WhatsApp o Windows no aceptan). */
export function nombrePresupuesto(numero: number, cliente: string): string {
  const c = cliente.replace(/[\\/:*?"<>|#%]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return `Presupuesto ${numero}${c ? ` - ${c}` : ''}.pdf`;
}

// ---------------------------------------------------------------- dibujo
const A4 = { w: 595.28, h: 841.89 };
const M = 50;
const ANCHO = A4.w - 2 * M;
const PIE = 60; // por debajo de esto no se escribe
const NEGRO = rgb(0.08, 0.08, 0.08);
const GRIS = rgb(0.42, 0.42, 0.42);
const BORDE = rgb(0.84, 0.84, 0.84);
const FONDO = rgb(0.96, 0.96, 0.96);

type Fuentes = { r: PDFFont; b: PDFFont };

// Columnas de la tabla de productos
const COL = { cant: 44, unit: 92, total: 92 };
const X_PROD = M + 8;
const ANCHO_PROD = ANCHO - COL.cant - COL.unit - COL.total - 16;
const X_CANT = M + ANCHO - COL.total - COL.unit - COL.cant;
const X_UNIT = M + ANCHO - COL.total - COL.unit;
const X_TOTAL = M + ANCHO - COL.total;

class Documento {
  page!: PDFPage;
  y = 0;
  paginas = 0;
  constructor(
    public pdf: PDFDocument,
    public f: Fuentes,
    public logo: PDFImage,
    public numero: number,
  ) {}

  nueva() {
    this.page = this.pdf.addPage([A4.w, A4.h]);
    this.paginas += 1;
    this.y = A4.h - 50;
    this.pie();
  }

  pie() {
    const { page, f } = this;
    page.drawLine({ start: { x: M, y: 44 }, end: { x: A4.w - M, y: 44 }, thickness: 0.5, color: BORDE });
    const t = `Spazio Design  ·  ${CONTACTO.web}  ·  WhatsApp ${CONTACTO.whatsapp}  ·  Instagram ${CONTACTO.instagram}`;
    page.drawText(t, { x: M, y: 31, size: 7.5, font: f.r, color: GRIS });
    const n = `Presupuesto N° ${this.numero} · Página ${this.paginas}`;
    page.drawText(n, { x: A4.w - M - f.r.widthOfTextAtSize(n, 7.5), y: 31, size: 7.5, font: f.r, color: GRIS });
  }

  /** Si no entra `alto`, pasa a una página nueva. Devuelve true si cambió de página. */
  lugar(alto: number): boolean {
    if (this.y - alto >= PIE) return false;
    this.nueva();
    return true;
  }

  der(t: string, xDerecho: number, y: number, tam: number, font: PDFFont, color = NEGRO) {
    this.page.drawText(t, { x: xDerecho - font.widthOfTextAtSize(t, tam), y, size: tam, font, color });
  }

  parrafo(t: string, tam = 9, font = this.f.r, color = NEGRO, despues = 6, x = M, ancho = ANCHO) {
    for (const l of cortar(font, t, tam, ancho)) {
      this.lugar(tam * 1.35);
      this.y -= tam * 1.35;
      this.page.drawText(l, { x, y: this.y, size: tam, font, color });
    }
    this.y -= despues;
  }

  titulo(t: string, tam = 11) {
    this.lugar(tam + 30); // que el título no quede solo al pie de la página
    this.y -= 6;
    this.parrafo(t, tam, this.f.b, NEGRO, 4);
  }

  encabezadoTabla() {
    const alto = 22;
    this.page.drawRectangle({ x: M, y: this.y - alto, width: ANCHO, height: alto, color: FONDO });
    const yt = this.y - 14.5;
    const tam = 8.5;
    this.page.drawText('PRODUCTO', { x: X_PROD, y: yt, size: tam, font: this.f.b, color: GRIS });
    this.der('CANT.', X_CANT + COL.cant - 8, yt, tam, this.f.b, GRIS);
    this.der('PRECIO UNIT.', X_UNIT + COL.unit - 8, yt, tam, this.f.b, GRIS);
    this.der('TOTAL', X_TOTAL + COL.total - 8, yt, tam, this.f.b, GRIS);
    this.y -= alto;
  }

  fila(it: ItemPresupuestoPdf) {
    const tamT = 10;
    const tamD = 8.5;
    const titulo = cortar(this.f.b, it.titulo || '—', tamT, ANCHO_PROD);
    const detalle = it.detalle ? cortar(this.f.r, it.detalle, tamD, ANCHO_PROD) : [];
    const pad = 9;
    const alto = pad * 2 + titulo.length * tamT * 1.3 + detalle.length * tamD * 1.35;
    if (this.lugar(alto)) this.encabezadoTabla();
    let y = this.y - pad - tamT;
    const yPrimera = y;
    for (const l of titulo) {
      this.page.drawText(l, { x: X_PROD, y, size: tamT, font: this.f.b, color: NEGRO });
      y -= tamT * 1.3;
    }
    y += tamT * 1.3 - tamT - 3;
    for (const l of detalle) {
      y -= tamD * 1.0;
      this.page.drawText(l, { x: X_PROD, y, size: tamD, font: this.f.r, color: GRIS });
      y -= tamD * 0.35;
    }
    this.der(String(it.cantidad || 1), X_CANT + COL.cant - 8, yPrimera, 9.5, this.f.r);
    this.der(pesos(it.precioUnitario), X_UNIT + COL.unit - 8, yPrimera, 9.5, this.f.r);
    this.der(pesos(it.total), X_TOTAL + COL.total - 8, yPrimera, 9.5, this.f.b);
    this.y -= alto;
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: M + ANCHO, y: this.y }, thickness: 0.5, color: BORDE });
  }
}

function logoBytes(): Uint8Array {
  return Uint8Array.from(Buffer.from(LOGO_SPAZIO_PNG_BASE64, 'base64'));
}

export async function generarPresupuestoPdf(d: DatosPresupuestoPdf): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Presupuesto N° ${d.numero} - ${d.cliente}`);
  pdf.setAuthor('Spazio Design');
  pdf.setCreator('Spazio Gestión');
  const f: Fuentes = { r: await pdf.embedFont(StandardFonts.Helvetica), b: await pdf.embedFont(StandardFonts.HelveticaBold) };
  const logo = await pdf.embedPng(logoBytes());
  const doc = new Documento(pdf, f, logo, d.numero);
  doc.nueva();

  // ---- encabezado: logo a la izquierda, número y fechas a la derecha
  const anchoLogo = 128;
  const altoLogo = (logo.height / logo.width) * anchoLogo;
  const yArriba = doc.y;
  doc.page.drawImage(logo, { x: M, y: yArriba - altoLogo, width: anchoLogo, height: altoLogo });
  doc.page.drawText('Muebles de diseño en vidrio, a medida', { x: M, y: yArriba - altoLogo - 14, size: 8.5, font: f.r, color: GRIS });

  const xd = A4.w - M;
  doc.der('PRESUPUESTO', xd, yArriba - 18, 20, f.b);
  doc.der(`N° ${d.numero}`, xd, yArriba - 36, 11, f.b);
  doc.der(`Fecha: ${fechaRemito(d.fecha)}`, xd, yArriba - 51, 9, f.r, GRIS);
  doc.der(`Válido hasta: ${fechaRemito(d.validoHasta)}`, xd, yArriba - 64, 9, f.r, GRIS);
  doc.y = Math.min(yArriba - altoLogo - 30, yArriba - 80);
  doc.page.drawLine({ start: { x: M, y: doc.y }, end: { x: A4.w - M, y: doc.y }, thickness: 1, color: NEGRO });
  doc.y -= 18;

  // ---- cliente
  const datos: [string, string][] = [['Cliente', d.cliente || '—']];
  if (d.telefono) datos.push(['Teléfono', d.telefono]);
  if (d.vendedor) datos.push(['Te atendió', d.vendedor]);
  for (const [r, v] of datos) {
    doc.y -= 9.5;
    doc.page.drawText(r.toUpperCase(), { x: M, y: doc.y, size: 7.5, font: f.b, color: GRIS });
    const lineas = cortar(f.r, v, 10, ANCHO - 80);
    lineas.forEach((l, i) => doc.page.drawText(l, { x: M + 80, y: doc.y - i * 13, size: 10, font: i === 0 && r === 'Cliente' ? f.b : f.r, color: NEGRO }));
    doc.y -= (lineas.length - 1) * 13 + 6;
  }
  doc.y -= 16;

  // ---- productos
  doc.encabezadoTabla();
  for (const it of d.items.length ? d.items : [{ titulo: '—', detalle: null, cantidad: 1, precioUnitario: 0, total: 0 }]) doc.fila(it);

  // ---- totales (bloque a la derecha)
  const filas: { rotulo: string; valor: string; fuerte?: boolean }[] = [];
  if (d.descuentoPct > 0) {
    filas.push({ rotulo: 'Subtotal', valor: pesos(d.subtotal) });
    filas.push({ rotulo: `Descuento ${Math.round(d.descuentoPct * 1000) / 10}%`, valor: `- ${pesos(d.descuentoMonto)}` });
  }
  const altoTotales = filas.length * 17 + 34 + 30 + 24;
  doc.lugar(altoTotales);
  doc.y -= 14;
  const xr = M + ANCHO;
  const xl = M + ANCHO - 250;
  for (const fl of filas) {
    doc.y -= 10;
    doc.page.drawText(fl.rotulo, { x: xl, y: doc.y, size: 9.5, font: f.r, color: GRIS });
    doc.der(fl.valor, xr - 8, doc.y, 9.5, f.r);
    doc.y -= 7;
  }
  doc.y -= 6;
  doc.page.drawRectangle({ x: xl - 10, y: doc.y - 34, width: xr - xl + 10, height: 34, color: NEGRO });
  doc.page.drawText('TOTAL POR TRANSFERENCIA', { x: xl, y: doc.y - 21, size: 9, font: f.b, color: rgb(1, 1, 1) });
  doc.der(pesos(d.total), xr - 8, doc.y - 22.5, 14, f.b, rgb(1, 1, 1));
  doc.y -= 34;
  doc.y -= 18;
  doc.page.drawText('En cuotas', { x: xl, y: doc.y, size: 9.5, font: f.r, color: GRIS });
  doc.der(pesos(d.totalCuotas), xr - 8, doc.y, 10.5, f.b);
  doc.y -= 26;

  // ---- condiciones
  doc.titulo('Condiciones', 11);
  for (const c of condicionesPresupuesto(d)) {
    const lineas = cortar(f.r, c, 9, ANCHO - 12);
    doc.lugar(lineas.length * 9 * 1.35 + 4);
    doc.page.drawText('•', { x: M, y: doc.y - 9 * 1.35, size: 9, font: f.r, color: NEGRO });
    doc.parrafo(c, 9, f.r, NEGRO, 4, M + 12, ANCHO - 12);
  }
  doc.y -= 14;
  doc.parrafo(`¿Dudas o querés confirmar? Escribinos por WhatsApp al ${CONTACTO.whatsapp}.`, 9.5, f.b, NEGRO, 0);

  // ---- términos y condiciones (los mismos del remito)
  doc.nueva();
  const tt = 'TÉRMINOS Y CONDICIONES';
  doc.y -= 18;
  doc.page.drawText(tt, { x: (A4.w - f.b.widthOfTextAtSize(tt, 16)) / 2, y: doc.y, size: 16, font: f.b, color: NEGRO });
  doc.y -= 20;
  doc.parrafo(TERMINOS_INTRO, 8.6, f.r, NEGRO, 4);
  for (const t of terminos(d.plazo)) {
    doc.titulo(t.titulo, 10);
    for (const p of t.parrafos) doc.parrafo(p, 8.6, f.r, NEGRO, 3);
  }

  return pdf.save();
}

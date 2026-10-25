// Remito de Spazio Design en PDF (A4, dos páginas: remito y términos y condiciones).
// Sin servidor ni base: recibe los datos ya armados y devuelve los bytes. Se puede probar.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { CONDICIONES_PEDIDO, TERMINOS, TERMINOS_INTRO } from './textos';

export type ItemRemito = { producto: string; modelo: string | null; color: string | null; puntas: string | null; tapa: string | null; material: string | null; medidas: string | null; cantidad: number };

export type DatosRemito = {
  numero: number;
  fecha: string; // AAAA-MM-DD
  cliente: string;
  dniCuit: string | null;
  telefono: string | null;
  email: string | null;
  items: ItemRemito[];
  formaPago: string | null;
  total: number; // productos
  envioPrecio: number; // lo que paga el cliente por el envío
  envio: string; // retira, flete, expreso, coordinar
  pagado: number;
};

// ---------------------------------------------------------------- textos que dependen del pedido
const may = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
export const fechaRemito = (f: string) => {
  const [a, m, d] = f.slice(0, 10).split('-');
  return `${d} / ${m} / ${a}`;
};
export const pesos = (n: number) => `$ ${Math.round(n).toLocaleString('es-AR').replace(/,/g, '.')}`;

const FORMA: Record<string, string> = {
  transferencia: 'transferencia',
  efectivo: 'pago en efectivo',
  'cuotas/mp': 'Mercado Pago',
  mercadopago: 'Mercado Pago',
  pagonube: 'Pago Nube',
};

export function lineasProducto(i: ItemRemito) {
  const nombre = may([i.producto, i.modelo ? may(i.modelo) : null].filter(Boolean).join(' '));
  const medidas = i.medidas ? `${i.medidas.replace(/\s*x\s*/gi, ' x ')}${/cm|mm|ø/i.test(i.medidas) ? '' : ' cm'}` : null;
  const specs = [medidas, i.material, `Cantidad: ${i.cantidad || 1}`].filter(Boolean).join(' / ');
  const color = [i.color, i.puntas && i.puntas !== '-' ? `Puntas ${i.puntas}` : null, i.tapa && i.tapa !== '-' ? i.tapa : null].filter(Boolean).map((x) => may(String(x))).join(' / ');
  return { nombre, specs, color: color || '—' };
}

export function textosPago(d: Pick<DatosRemito, 'total' | 'envioPrecio' | 'pagado' | 'formaPago' | 'envio'>) {
  const total = d.total + d.envioPrecio;
  const saldo = Math.max(0, total - d.pagado);
  const pct = total > 0 ? Math.round((Math.min(d.pagado, total) / total) * 100) : 0;
  const medio = d.formaPago ? (FORMA[d.formaPago.toLowerCase()] ?? d.formaPago) : null;
  const envioTexto =
    d.envioPrecio > 0
      ? pesos(d.envioPrecio)
      : d.envio === 'retira'
        ? 'Retira en el showroom'
        : d.envio === 'expreso'
          ? 'Por expreso, a cargo del cliente'
          : 'A convenir';
  const envioCorto = d.envio === 'retira' ? 'Retira en el showroom' : d.envioPrecio > 0 ? pesos(d.envioPrecio) : d.envio === 'expreso' ? 'Por expreso' : 'A convenir';
  let constancia: string;
  let filaPago: string;
  if (saldo <= 0 && d.pagado > 0) {
    constancia = `Por medio del presente documento, Spazio Design deja constancia de que el/la cliente mencionado/a anteriormente ha realizado${medio ? ` mediante ${medio}` : ''} el pago total del producto solicitado.`;
    filaPago = 'Pago total abonado - 100%';
  } else if (d.pagado > 0) {
    constancia = `Por medio del presente documento, Spazio Design deja constancia de que el/la cliente mencionado/a anteriormente ha abonado${medio ? ` mediante ${medio}` : ''} una seña de ${pesos(d.pagado)} del producto solicitado.`;
    filaPago = `Seña abonada - ${pct}%`;
  } else {
    constancia = 'Por medio del presente documento, Spazio Design deja constancia del pedido del producto solicitado por el/la cliente mencionado/a anteriormente. El pago todavía no fue registrado.';
    filaPago = 'Pago abonado - 0%';
  }
  const cierre = saldo <= 0 ? `El producto se encuentra abonado en su totalidad. Envío: ${envioCorto}.` : `Saldo a abonar antes de la entrega: ${pesos(saldo)}. Envío: ${envioCorto}.`;
  return { constancia, filaPago, cierre, saldo, envioTexto };
}

// ---------------------------------------------------------------- dibujo
const A4 = { w: 595.28, h: 841.89 };
const M = 50; // margen
const ANCHO = A4.w - 2 * M;
const GRIS = rgb(0.42, 0.42, 0.42);
const NEGRO = rgb(0.08, 0.08, 0.08);
const BORDE = rgb(0.84, 0.84, 0.84);
const FONDO = rgb(0.96, 0.96, 0.96);

type Fuentes = { r: PDFFont; b: PDFFont };

/** Saca los caracteres que la fuente no puede escribir (emojis, etc.). */
function limpio(f: PDFFont, t: string): string {
  let out = '';
  for (const c of t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-')) {
    try {
      f.encodeText(c);
      out += c;
    } catch {
      out += c.normalize('NFD').replace(/[̀-ͯ]/g, '') === c ? '' : c.normalize('NFD').replace(/[̀-ͯ]/g, '');
    }
  }
  return out;
}

/** Corta el texto en renglones que entran en `ancho`. Respeta los saltos de línea. */
export function cortar(f: PDFFont, t: string, tam: number, ancho: number): string[] {
  const out: string[] = [];
  for (const parrafo of t.split('\n').map((x) => limpio(f, x))) {
    let linea = '';
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = linea ? `${linea} ${palabra}` : palabra;
      if (f.widthOfTextAtSize(prueba, tam) <= ancho || !linea) linea = prueba;
      else {
        out.push(linea);
        linea = palabra;
      }
    }
    out.push(linea);
  }
  return out;
}

class Hoja {
  y: number;
  constructor(
    public pdf: PDFDocument,
    public page: PDFPage,
    public f: Fuentes,
    public numero: number,
  ) {
    this.y = A4.h - 56;
    this.pie();
  }
  pie() {
    this.page.drawLine({ start: { x: M - 6, y: 42 }, end: { x: A4.w - M + 6, y: 42 }, thickness: 0.5, color: BORDE });
    this.page.drawText('Spazio Design', { x: M - 6, y: 30, size: 8, font: this.f.r, color: GRIS });
    const t = `Página ${this.numero}`;
    this.page.drawText(t, { x: A4.w - M + 6 - this.f.r.widthOfTextAtSize(t, 8), y: 30, size: 8, font: this.f.r, color: GRIS });
  }
  centrado(t: string, tam: number, f: PDFFont, color = NEGRO, despues = 6) {
    const s = limpio(f, t);
    this.y -= tam;
    this.page.drawText(s, { x: (A4.w - f.widthOfTextAtSize(s, tam)) / 2, y: this.y, size: tam, font: f, color });
    this.y -= despues;
  }
  parrafo(t: string, tam = 9, f = this.f.r, color = NEGRO, despues = 8, ancho = ANCHO) {
    for (const l of cortar(f, t, tam, ancho)) {
      this.y -= tam * 1.25;
      this.page.drawText(l, { x: M, y: this.y, size: tam, font: f, color });
    }
    this.y -= despues;
  }
  titulo(t: string, tam = 13) {
    this.y -= 4;
    this.parrafo(t, tam, this.f.b, NEGRO, 3);
  }
  /** Tabla de dos columnas: rótulo (con fondo) y valor. */
  tabla(filas: { rotulo: string; valor: string; negrita?: boolean }[], anchoRotulo: number) {
    const tam = 9;
    const pad = 6;
    for (const fila of filas) {
      const fr = fila.negrita === false ? this.f.r : this.f.b;
      const ls = cortar(fr, fila.rotulo, tam, anchoRotulo - 2 * pad);
      const lv = cortar(this.f.r, fila.valor || '—', tam, ANCHO - anchoRotulo - 2 * pad);
      const alto = Math.max(ls.length, lv.length) * tam * 1.3 + 2 * pad + 2;
      const y0 = this.y - alto;
      this.page.drawRectangle({ x: M, y: y0, width: anchoRotulo, height: alto, color: fila.negrita === false ? undefined : FONDO, borderColor: BORDE, borderWidth: 0.6 });
      this.page.drawRectangle({ x: M + anchoRotulo, y: y0, width: ANCHO - anchoRotulo, height: alto, borderColor: BORDE, borderWidth: 0.6 });
      ls.forEach((l, i) => this.page.drawText(l, { x: M + pad, y: this.y - pad - tam - i * tam * 1.3, size: tam, font: fr, color: NEGRO }));
      lv.forEach((l, i) => this.page.drawText(l, { x: M + anchoRotulo + pad, y: this.y - pad - tam - i * tam * 1.3, size: tam, font: this.f.r, color: NEGRO }));
      this.y = y0;
    }
    this.y -= 6;
  }
}

export async function generarRemitoPdf(d: DatosRemito): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Remito #${d.numero} - ${d.cliente}`);
  pdf.setAuthor('Spazio Design');
  pdf.setCreator('Spazio Gestión');
  const f: Fuentes = { r: await pdf.embedFont(StandardFonts.Helvetica), b: await pdf.embedFont(StandardFonts.HelveticaBold) };
  const pago = textosPago(d);
  const items = d.items.length ? d.items.map(lineasProducto) : [{ nombre: '—', specs: '—', color: '—' }];
  const varios = items.length > 1;
  const junta = (k: 'nombre' | 'specs' | 'color') => items.map((x, i) => (varios ? `${i + 1}. ${x[k]}` : x[k])).join('\n');

  // Página 1: remito
  const h1 = new Hoja(pdf, pdf.addPage([A4.w, A4.h]), f, 1);
  h1.centrado('SPAZIO DESIGN', 8.5, f.r, GRIS, 8);
  h1.centrado('REMITO', 22, f.b, NEGRO, 8);
  h1.centrado('Este documento no vale como factura.', 10, f.r, GRIS, 16);
  h1.tabla(
    [
      { rotulo: 'Fecha:', valor: fechaRemito(d.fecha) },
      { rotulo: 'Remito N°:', valor: String(d.numero) },
      { rotulo: 'Cliente:', valor: d.cliente },
      { rotulo: 'DNI / CUIT:', valor: d.dniCuit ?? '—' },
      { rotulo: 'Teléfono / Mail:', valor: [d.telefono, d.email].filter(Boolean).join(' / ') || '—' },
      { rotulo: varios ? 'Productos solicitados:' : 'Producto solicitado:', valor: junta('nombre') },
      { rotulo: 'Medidas / especificaciones:', valor: junta('specs') },
      { rotulo: 'Color / terminación:', valor: junta('color') },
    ],
    150,
  );
  h1.y -= 8;
  h1.titulo('Detalle del pedido', 14);
  h1.parrafo(pago.constancia, 9, f.r, NEGRO, 6);
  h1.tabla(
    [
      { rotulo: 'Valor total del pedido', valor: pesos(d.total) },
      ...(d.envioPrecio > 0
        ? [
            { rotulo: 'Envío', valor: pesos(d.envioPrecio), negrita: false },
            { rotulo: 'Total con envío', valor: pesos(d.total + d.envioPrecio) },
          ]
        : []),
      { rotulo: pago.filaPago, valor: pesos(d.pagado), negrita: false },
      { rotulo: 'Saldo pendiente', valor: pesos(pago.saldo), negrita: false },
    ],
    255,
  );
  h1.y += 4;
  h1.parrafo(pago.cierre, 9, f.r, NEGRO, 10);
  h1.tabla([{ rotulo: 'Valor del envío', valor: pago.envioTexto }], 255);
  h1.y -= 8;
  h1.titulo('Condiciones generales del pedido', 12);
  for (const p of CONDICIONES_PEDIDO) h1.parrafo(p, 9, f.r, NEGRO, 7);

  // Página 2: términos y condiciones
  const h2 = new Hoja(pdf, pdf.addPage([A4.w, A4.h]), f, 2);
  h2.centrado('SPAZIO DESIGN', 8.5, f.r, GRIS, 8);
  h2.centrado('TÉRMINOS Y CONDICIONES', 20, f.b, NEGRO, 8);
  h2.centrado('Información importante sobre producción, materiales, medidas y traslados', 10, f.r, GRIS, 14);
  h2.parrafo(TERMINOS_INTRO, 8.6, f.r, NEGRO, 4);
  for (const t of TERMINOS) {
    h2.titulo(t.titulo, 10.5);
    for (const p of t.parrafos) h2.parrafo(p, 8.6, f.r, NEGRO, 4);
  }
  h2.y -= 14;
  const fx = A4.w - M - 130;
  h2.page.drawText('Fecha', { x: fx + 50, y: h2.y, size: 8.5, font: f.r, color: NEGRO });
  h2.page.drawText(fechaRemito(d.fecha), { x: fx + 26, y: h2.y - 18, size: 8.5, font: f.r, color: NEGRO });

  return pdf.save();
}

/** Nombre del archivo: "Remito 557 - Pepe Puig.pdf" (sin caracteres que Drive o Windows no aceptan). */
export function nombreRemito(numero: number, cliente: string, version = 1): string {
  const c = cliente.replace(/[\\/:*?"<>|#%]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return `Remito ${numero} - ${c}${version > 1 ? ` (${version})` : ''}.pdf`;
}

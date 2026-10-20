// Texto corto del presupuesto para mandar por WhatsApp.

const pesos = (n: number) => `$ ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n)}`;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fecha = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} de ${MESES[m - 1]}`;
};

export type ItemTexto = { titulo: string; detalle: string | null; cantidad: number; total: number };
export type PresupuestoTexto = {
  numero: number;
  cliente: string;
  items: ItemTexto[];
  subtotal: number;
  descuentoPct: number;
  total: number;
  totalCuotas: number;
  validoHasta: string;
};

export function textoWhatsApp(p: PresupuestoTexto): string {
  const nombre = p.cliente.trim().split(/\s+/)[0] ?? '';
  const lineas = [`Hola${nombre ? ` ${nombre}` : ''}! Te paso el presupuesto N° ${p.numero} de Spazio Design:`, ''];
  for (const it of p.items) {
    const cant = it.cantidad > 1 ? `${it.cantidad} × ` : '';
    lineas.push(`• ${cant}${it.titulo}${it.detalle ? ` ${it.detalle}` : ''}`);
    if (p.items.length > 1) lineas.push(`  ${pesos(it.total)}`);
  }
  lineas.push('');
  if (p.descuentoPct > 0) {
    lineas.push(`Subtotal: ${pesos(p.subtotal)}`);
    lineas.push(`Descuento ${Math.round(p.descuentoPct * 1000) / 10}%`);
  }
  lineas.push(`*${pesos(p.total)}* por transferencia`);
  lineas.push(`${pesos(p.totalCuotas)} en cuotas`);
  lineas.push('');
  lineas.push(`Válido hasta el ${fecha(p.validoHasta)}.`);
  return lineas.join('\n');
}

// Reglas de la gift card que se usan en la página pública y en la app.
// La base de datos vuelve a validar todo (funciones gc_*): esto es para avisar antes.

export const GC_MINIMO = 50_000;
export const GC_MULTIPLO = 10_000;
export const GC_REVISION_DESDE = 3_000_000;
export const GC_MONTOS_SUGERIDOS = [100_000, 300_000, 500_000, 1_000_000];
export const GC_INICIO_MAX_DIAS = 60;
export const GC_DEDICATORIA_MAX = 240;
export const GC_MESES_VIGENCIA = 3;
export const GC_PRORROGA_DIAS = 30;

// Frases de Spazio por ocasión: van chiquitas en la tarjeta, nunca nombran un mueble puntual.
export const GC_OCASIONES: { clave: string; nombre: string; frase: string }[] = [
  { clave: 'sin_ocasion', nombre: 'Sin ocasión', frase: '' },
  { clave: 'casamiento', nombre: 'Casamiento', frase: 'Para la casa que empiezan a armar juntos.' },
  { clave: 'cumpleanos', nombre: 'Cumpleaños', frase: 'Un año más, y algo hecho a tu medida.' },
  { clave: 'casa_nueva', nombre: 'Casa nueva', frase: 'Para que la casa nueva se sienta tuya.' },
  { clave: 'aniversario', nombre: 'Aniversario', frase: 'Para sumar algo lindo a lo que ya construyeron.' },
  { clave: 'nacimiento', nombre: 'Nacimiento', frase: 'Para recibir a quien llega a la casa.' },
  { clave: 'fiestas', nombre: 'Fiestas', frase: 'Para empezar el año con color.' },
  { clave: 'agradecimiento', nombre: 'Agradecimiento', frase: 'Gracias, con algo hecho a tu medida.' },
];

export function fraseOcasion(clave: string | null | undefined): string {
  return GC_OCASIONES.find((o) => o.clave === clave)?.frase ?? '';
}

export function nombreOcasion(clave: string | null | undefined): string {
  return GC_OCASIONES.find((o) => o.clave === clave)?.nombre ?? 'Sin ocasión';
}

// Devuelve el error para mostrar, o null si el monto sirve.
export function errorMonto(monto: number): string | null {
  if (!Number.isFinite(monto) || monto <= 0) return 'Elegí o escribí un monto.';
  if (monto < GC_MINIMO) return `El monto mínimo es $${GC_MINIMO.toLocaleString('es-AR')}.`;
  if (monto % GC_MULTIPLO !== 0) return `El monto tiene que ser múltiplo de $${GC_MULTIPLO.toLocaleString('es-AR')}.`;
  return null;
}

// Código: SPZ-XXXX-XXXX con letras y números que no se confunden (sin 0, O, 1, I).
const ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function normalizarCodigo(texto: string): string | null {
  const limpio = texto.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^SPZ/, '');
  if (limpio.length !== 8) return null;
  for (const c of limpio) if (!ALFABETO.includes(c)) return null;
  return `SPZ-${limpio.slice(0, 4)}-${limpio.slice(4)}`;
}

// Último día para pedir: mismo número de día 3 meses después; si ese día no existe,
// el último día del mes (30/11 → 28/02). Arranca de la fecha más tardía entre
// la que eligió quien compra y la de la transferencia acreditada.
export function fechaVencimiento(fechaElegida: string, fechaAcreditacion: string, meses = GC_MESES_VIGENCIA): string {
  const inicio = fechaElegida > fechaAcreditacion ? fechaElegida : fechaAcreditacion;
  const [a, m, d] = inicio.split('-').map(Number);
  const totalMeses = a * 12 + (m - 1) + meses;
  const anio = Math.floor(totalMeses / 12);
  const mes = (totalMeses % 12) + 1;
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const dia = Math.min(d, ultimo);
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export function fechaAR(iso: string | null | undefined): string {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

// Teléfono argentino a formato de WhatsApp (549 + característica + número).
export function numeroWhatsApp(telefono: string | null | undefined): string | null {
  let d = (telefono ?? '').replace(/\D/g, '');
  if (d.length < 8) return null;
  if (d.startsWith('549')) return d;
  if (d.startsWith('54')) d = d.slice(2);
  d = d.replace(/^0/, '');
  // 11 15 5555-1234 → 11 5555-1234
  d = d.replace(/^(\d{2,4})15(\d{6,8})$/, '$1$2');
  return `549${d}`;
}

export function linkWhatsAppTexto(telefono: string | null | undefined, texto: string): string | null {
  const n = numeroWhatsApp(telefono);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : null;
}

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`;

export type DatosEntrega = {
  codigo: string;
  monto: number;
  para: string;
  de: string;
  dedicatoria: string | null;
  vence: string;
  urlSaldo: string;
};

// Mensaje para mandarle la tarjeta a quien la recibe (WhatsApp manual o copiar).
export function mensajeEntrega(x: DatosEntrega): string {
  return [
    `¡Hola, ${x.para}! ${x.de} te regaló una gift card de Spazio por ${pesos(x.monto)}.`,
    x.dedicatoria ? `“${x.dedicatoria}”` : null,
    `Tu código: ${x.codigo}`,
    `Tenés tiempo hasta el ${fechaAR(x.vence)} para hacer tu pedido. Respondé este mensaje y te ayudamos a elegir tu pieza, sus medidas y su color.`,
    `Consultá tu saldo: ${x.urlSaldo}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

// Mensaje a quien compra con los datos para transferir.
export function mensajePago(x: { comprador: string; referencia: string; monto: number; para: string; alias: string; cbu: string; titular: string }): string {
  return [
    `¡Hola, ${x.comprador}! Recibimos tu pedido de gift card para ${x.para}. Para activarla, transferí:`,
    `Monto exacto: ${pesos(x.monto)}`,
    x.alias ? `Alias: ${x.alias}` : null,
    x.cbu ? `CBU: ${x.cbu}` : null,
    x.titular ? `Titular: ${x.titular}` : null,
    `Concepto: ${x.referencia}`,
    'Apenas se acredite, la activamos y se la mandamos por correo y WhatsApp. Si ya transferiste, mandanos el comprobante por acá. La solicitud se mantiene 72 horas.',
  ]
    .filter(Boolean)
    .join('\n');
}

// Fechas como texto 'AAAA-MM-DD', sin horas, para evitar problemas de zona horaria.

export function hoyAR(ahora: Date = new Date()): string {
  // en-CA formatea como AAAA-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}

function aUTC(fecha: string): Date {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function aTexto(f: Date): string {
  return f.toISOString().slice(0, 10);
}

export function sumarDiasCorridos(fecha: string, dias: number): string {
  const f = aUTC(fecha);
  f.setUTCDate(f.getUTCDate() + dias);
  return aTexto(f);
}

export function esHabil(fecha: string, feriados: ReadonlySet<string>): boolean {
  const dia = aUTC(fecha).getUTCDay(); // 0 domingo, 6 sábado
  return dia !== 0 && dia !== 6 && !feriados.has(fecha);
}

export function sumarDiasHabiles(fecha: string, dias: number, feriados: ReadonlySet<string>): string {
  let actual = fecha;
  let contados = 0;
  while (contados < dias) {
    actual = sumarDiasCorridos(actual, 1);
    if (esHabil(actual, feriados)) contados++;
  }
  return actual;
}

export type ReglaPlazo = { dias: number; tipo: 'corridos' | 'habiles' };

export function calcularFechaLimite(fechaVenta: string, regla: ReglaPlazo, feriados: ReadonlySet<string>): string {
  return regla.tipo === 'habiles'
    ? sumarDiasHabiles(fechaVenta, regla.dias, feriados)
    : sumarDiasCorridos(fechaVenta, regla.dias);
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aUTC(hasta).getTime() - aUTC(desde).getTime()) / 86_400_000);
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function fechaCorta(fecha: string | null | undefined): string {
  if (!fecha) return '—';
  const f = aUTC(fecha.slice(0, 10));
  return `${DIAS[f.getUTCDay()]} ${f.getUTCDate()} ${MESES[f.getUTCMonth()]}`;
}

export function fechaLarga(fecha: string | null | undefined): string {
  if (!fecha) return '—';
  const f = aUTC(fecha.slice(0, 10));
  return `${f.getUTCDate()}/${f.getUTCMonth() + 1}/${f.getUTCFullYear()}`;
}

export function fechaHora(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

// "en 3 días", "hoy", "hace 2 días"
export function relativo(dias: number): string {
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  if (dias === -1) return 'ayer';
  return dias > 0 ? `en ${dias} días` : `hace ${-dias} días`;
}

// Lunes de la semana de una fecha
export function inicioSemana(fecha: string): string {
  const dia = aUTC(fecha).getUTCDay(); // 0 domingo
  return sumarDiasCorridos(fecha, dia === 0 ? -6 : 1 - dia);
}

export function diaSemana(fecha: string): number {
  return aUTC(fecha).getUTCDay();
}

export function horaCorta(hora: string | null | undefined): string {
  return hora ? hora.slice(0, 5) : '';
}

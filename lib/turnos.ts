// Turnos online del showroom: formato de fechas y links (sin servidor: se puede probar).

export type Horario = { fecha: string; hora: string; libres: number };
export type ConfigTurnos = { activo: boolean; duracion: number; direccion: string; whatsapp: string };

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const partes = (f: string) => f.slice(0, 10).split('-').map(Number) as [number, number, number];
const diaSemana = (f: string) => {
  const [a, m, d] = partes(f);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
};

/** "lunes 26 de octubre" */
export function fechaLarga(f: string): string {
  const [, m, d] = partes(f);
  return `${DIAS[diaSemana(f)]} ${d} de ${MESES[m - 1]}`;
}

/** Para las pestañas de días: { dia: "lun", numero: 26, mes: "oct" } */
export function fechaCorta(f: string) {
  const [, m, d] = partes(f);
  return { dia: DIAS[diaSemana(f)].slice(0, 3), numero: d, mes: MESES[m - 1].slice(0, 3) };
}

/** Agrupa los horarios libres por día, en orden. */
export function porDia(horarios: Horario[]): [string, Horario[]][] {
  const m = new Map<string, Horario[]>();
  for (const h of horarios) {
    if (h.libres < 1) continue;
    const f = h.fecha.slice(0, 10);
    m.set(f, [...(m.get(f) ?? []), { ...h, fecha: f, hora: h.hora.slice(0, 5) }]);
  }
  return [...m.entries()];
}

/** Link para agregar la visita a Google Calendar (hora de Buenos Aires). */
export function linkCalendario(fecha: string, hora: string, minutos: number, direccion: string): string {
  const [a, m, d] = partes(fecha);
  const [hh, mm] = hora.split(':').map(Number);
  const ini = new Date(Date.UTC(a, m - 1, d, hh + 3, mm)); // UTC-3
  const fin = new Date(ini.getTime() + minutos * 60000);
  const f = (x: Date) => x.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: 'Visita al showroom de Spazio Design',
    dates: `${f(ini)}/${f(fin)}`,
    details: 'Turno reservado en el showroom de Spazio Design.',
    ...(direccion ? { location: direccion } : {}),
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** Link de WhatsApp: el número solo con dígitos (si es de Argentina sin 54, se lo agrega). */
export function linkWhatsapp(numero: string, texto?: string): string | null {
  let n = numero.replace(/\D/g, '');
  if (!n) return null;
  if (!n.startsWith('54')) n = `549${n.replace(/^0/, '')}`;
  return `https://wa.me/${n}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}

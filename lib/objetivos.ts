import { diasEntre, hoyAR, inicioSemana, sumarDiasCorridos } from '@/lib/fechas';
import type { createClient } from '@/lib/supabase/server';
import type { Objetivo, Tarea } from '@/lib/tipos';

type Cliente = Awaited<ReturnType<typeof createClient>>;

export type Avance = {
  objetivo: Objetivo;
  actual: number;
  meta: number;
  porcentaje: number;
  desde: string | null;
  hasta: string | null;
  // proyectos
  tareasHechas: number;
  tareasTotal: number;
  diasRestantes: number | null;
  tareas: Tarea[];
};

export function periodoActual(periodo: 'semana' | 'mes', hoy = hoyAR()): { desde: string; hasta: string } {
  if (periodo === 'semana') {
    const desde = inicioSemana(hoy);
    return { desde, hasta: sumarDiasCorridos(desde, 6) };
  }
  const desde = `${hoy.slice(0, 7)}-01`;
  const [a, m] = hoy.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { desde, hasta: `${hoy.slice(0, 7)}-${String(ultimo).padStart(2, '0')}` };
}

// Calcula el avance de cada objetivo activo con los datos reales de la app.
export async function calcularAvances(supabase: Cliente, objetivos: Objetivo[]): Promise<Avance[]> {
  const hoy = hoyAR();
  const numericos = objetivos.filter((o) => o.tipo === 'numerico');
  const proyectos = objetivos.filter((o) => o.tipo === 'proyecto');

  // Ventas desde el inicio más temprano de los períodos que se necesitan.
  let ventas: { fecha_venta: string; responsable_id: string | null; total: number }[] = [];
  if (numericos.length) {
    const desdes = numericos.map((o) => periodoActual(o.periodo ?? 'semana', hoy).desde).sort();
    const { data } = await supabase
      .from('pedidos')
      .select('fecha_venta, responsable_id, total')
      .gte('fecha_venta', desdes[0])
      .neq('etapa', 'cancelado');
    ventas = (data ?? []) as typeof ventas;
  }

  let tareas: Tarea[] = [];
  if (proyectos.length) {
    const { data } = await supabase
      .from('tareas_resumen')
      .select('*')
      .in('objetivo_id', proyectos.map((p) => p.id))
      .order('estado')
      .order('vencimiento', { nullsFirst: false });
    tareas = (data ?? []) as Tarea[];
  }

  return objetivos.map((o) => {
    if (o.tipo === 'numerico') {
      const { desde, hasta } = periodoActual(o.periodo ?? 'semana', hoy);
      const delPeriodo = ventas.filter(
        (v) => v.fecha_venta >= desde && v.fecha_venta <= hasta && (!o.responsable_id || v.responsable_id === o.responsable_id),
      );
      const actual = o.metrica === 'facturacion' ? delPeriodo.reduce((s, v) => s + Number(v.total), 0) : delPeriodo.length;
      const meta = Number(o.meta ?? 1);
      return {
        objetivo: o,
        actual,
        meta,
        porcentaje: Math.min(100, Math.round((actual / meta) * 100)),
        desde,
        hasta,
        tareasHechas: 0,
        tareasTotal: 0,
        diasRestantes: diasEntre(hoy, hasta),
        tareas: [],
      };
    }
    const propias = tareas.filter((t) => t.objetivo_id === o.id);
    const hechas = propias.filter((t) => t.estado === 'hecha').length;
    return {
      objetivo: o,
      actual: hechas,
      meta: propias.length,
      porcentaje: propias.length ? Math.round((hechas / propias.length) * 100) : 0,
      desde: null,
      hasta: o.fecha_limite,
      tareasHechas: hechas,
      tareasTotal: propias.length,
      diasRestantes: o.fecha_limite ? diasEntre(hoy, o.fecha_limite) : null,
      tareas: propias,
    };
  });
}

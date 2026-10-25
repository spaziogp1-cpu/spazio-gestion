import { hayFiltrosDePedido, interpretar, type Consulta } from './interpretar';
import { hoyAR } from '@/lib/fechas';
import type { createClient } from '@/lib/supabase/server';

export type TipoResultado = 'pedido' | 'cliente' | 'presupuesto' | 'tarea' | 'visita' | 'proveedor';

export type Resultado = {
  tipo: TipoResultado;
  id: string;
  titulo: string;
  detalle: string | null;
  estado: string | null;
  fecha: string | null;
  monto: number | null;
  puntaje: number;
  href: string;
};

export type RespuestaBusqueda = {
  consulta: Consulta;
  resultados: Resultado[];
  soloPedidos: boolean; // la frase traía filtros: se listan pedidos y nada más
  error?: string;
};

export function hrefDe(tipo: TipoResultado, id: string, estado: string | null = null): string {
  switch (tipo) {
    case 'pedido':
      return `/pedidos/${id}`;
    case 'cliente':
      return `/clientes/${id}`;
    case 'presupuesto':
      return `/cotizador/${id}`;
    case 'tarea':
      return `/tareas?de=todos${estado === 'hecha' ? '&ver=hechas' : ''}#tarea-${id}`;
    case 'visita':
      return `/showroom#visita-${id}`;
    case 'proveedor':
      return `/proveedores?p=${id}`;
  }
}

type Supa = Awaited<ReturnType<typeof createClient>>;

export async function buscar(supabase: Supa, entrada: string, limite = 8): Promise<RespuestaBusqueda> {
  const [a, m, d] = hoyAR().split('-').map(Number);
  const consulta = interpretar(entrada.slice(0, 200), new Date(Date.UTC(a, m - 1, d)));
  const soloPedidos = hayFiltrosDePedido(consulta.filtros);
  const vacia = !consulta.texto && consulta.numero === null && !consulta.digitos && !soloPedidos;
  if (vacia) return { consulta, resultados: [], soloPedidos };

  const { data, error } = await supabase.rpc('buscar_global', {
    p_texto: consulta.texto,
    p_numero: consulta.numero,
    p_digitos: consulta.digitos,
    p_filtros: consulta.filtros,
    p_limite: limite,
  });
  if (error) {
    console.error('buscar_global', error);
    const falta = /buscar_global|function .* does not exist|schema cache/i.test(error.message);
    return {
      consulta,
      resultados: [],
      soloPedidos,
      error: falta ? 'Falta correr la migración 0026_buscador_global.sql en Supabase.' : 'No se pudo buscar. Probá de nuevo.',
    };
  }
  const filas = (data ?? []) as Array<Omit<Resultado, 'href'>>;
  const resultados = filas.map((r) => ({
    ...r,
    monto: r.monto === null ? null : Number(r.monto),
    puntaje: Number(r.puntaje),
    href: hrefDe(r.tipo, r.id, r.estado),
  }));
  return { consulta, resultados, soloPedidos };
}

export const NOMBRE_TIPO: Record<TipoResultado, string> = {
  pedido: 'Pedidos',
  cliente: 'Clientes',
  presupuesto: 'Presupuestos',
  tarea: 'Tareas',
  visita: 'Visitas al showroom',
  proveedor: 'Proveedores',
};

const ESTADOS: Record<string, string> = {
  borrador: 'Borrador', enviado: 'Enviado', seguimiento: 'En seguimiento', aprobado: 'Aprobado', rechazado: 'Rechazado', vencido: 'Vencido',
  pendiente: 'Pendiente', en_curso: 'En curso', bloqueada: 'Bloqueada', hecha: 'Hecha',
  agendada: 'Agendada', confirmada: 'Confirmada', vino: 'Vino', no_vino: 'No vino', cancelada: 'Cancelada', inactivo: 'Inactivo',
};

export function nombreEstado(tipo: TipoResultado, estado: string | null, nombreEtapa: (id: string) => string): string | null {
  if (!estado) return null;
  return tipo === 'pedido' ? nombreEtapa(estado) : (ESTADOS[estado] ?? estado);
}

// Agrupa por tipo, con el grupo que mejor coincide primero.
export function agrupar(resultados: Resultado[]): [TipoResultado, Resultado[]][] {
  const grupos = new Map<TipoResultado, Resultado[]>();
  for (const r of resultados) grupos.set(r.tipo, [...(grupos.get(r.tipo) ?? []), r]);
  const mejor = (rs: Resultado[]) => Math.max(...rs.map((r) => r.puntaje));
  return [...grupos.entries()].sort((a, b) => mejor(b[1]) - mejor(a[1]));
}

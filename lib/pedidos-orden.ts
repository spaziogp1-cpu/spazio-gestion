// Ordenamiento y filtros extra de la lista de pedidos.
// Se usan en el servidor (página de pedidos) y son funciones puras para poder testearlas.

export const ORDENES = [
  { id: 'limite', nombre: 'Fecha límite (más urgente primero)' },
  { id: 'creado_desc', nombre: 'Creación: más nuevos primero' },
  { id: 'creado_asc', nombre: 'Creación: más viejos primero' },
  { id: 'venta_desc', nombre: 'Fecha de venta: más reciente' },
  { id: 'venta_asc', nombre: 'Fecha de venta: más antigua' },
  { id: 'entrega', nombre: 'Entrega programada (más próxima)' },
  { id: 'saldo_desc', nombre: 'Mayor saldo pendiente' },
  { id: 'total_desc', nombre: 'Mayor importe' },
  { id: 'total_asc', nombre: 'Menor importe' },
  { id: 'numero_desc', nombre: 'Número de pedido (mayor primero)' },
  { id: 'cliente', nombre: 'Cliente (A → Z)' },
] as const;

export type OrdenId = (typeof ORDENES)[number]['id'];

export function ordenValido(v: string | undefined | null): OrdenId | null {
  return ORDENES.some((o) => o.id === v) ? (v as OrdenId) : null;
}

type Ordenable = {
  numero: number;
  cliente_nombre: string;
  fecha_venta: string;
  fecha_limite: string;
  fecha_entrega_programada: string | null;
  creado_en: string;
  total: number | string;
  saldo: number | string;
};

const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;
const txt = (v: string | null | undefined) => v ?? '';

/** Devuelve una copia ordenada. Los empates se desempatan por número de pedido (más nuevo primero). */
export function ordenarPedidos<T extends Ordenable>(lista: T[], orden: OrdenId): T[] {
  const cmp = (a: T, b: T): number => {
    switch (orden) {
      case 'limite':
        return txt(a.fecha_limite).localeCompare(txt(b.fecha_limite));
      case 'creado_desc':
        return txt(b.creado_en).localeCompare(txt(a.creado_en));
      case 'creado_asc':
        return txt(a.creado_en).localeCompare(txt(b.creado_en));
      case 'venta_desc':
        return txt(b.fecha_venta).localeCompare(txt(a.fecha_venta));
      case 'venta_asc':
        return txt(a.fecha_venta).localeCompare(txt(b.fecha_venta));
      case 'entrega': {
        // Los que no tienen entrega programada van al final.
        const ea = a.fecha_entrega_programada;
        const eb = b.fecha_entrega_programada;
        if (ea && eb) return ea.localeCompare(eb);
        if (ea) return -1;
        if (eb) return 1;
        return txt(a.fecha_limite).localeCompare(txt(b.fecha_limite));
      }
      case 'saldo_desc':
        return num(b.saldo) - num(a.saldo);
      case 'total_desc':
        return num(b.total) - num(a.total);
      case 'total_asc':
        return num(a.total) - num(b.total);
      case 'numero_desc':
        return b.numero - a.numero;
      case 'cliente':
        return txt(a.cliente_nombre).localeCompare(txt(b.cliente_nombre), 'es', { sensitivity: 'base' });
    }
  };
  return [...lista].sort((a, b) => cmp(a, b) || b.numero - a.numero);
}

/** Columna y sentido para ordenar directo en la consulta a Supabase. */
export function ordenConsulta(orden: OrdenId): { columna: string; asc: boolean; nullsFirst?: boolean } {
  switch (orden) {
    case 'limite': return { columna: 'fecha_limite', asc: true };
    case 'creado_desc': return { columna: 'creado_en', asc: false };
    case 'creado_asc': return { columna: 'creado_en', asc: true };
    case 'venta_desc': return { columna: 'fecha_venta', asc: false };
    case 'venta_asc': return { columna: 'fecha_venta', asc: true };
    case 'entrega': return { columna: 'fecha_entrega_programada', asc: true, nullsFirst: false };
    case 'saldo_desc': return { columna: 'saldo', asc: false };
    case 'total_desc': return { columna: 'total', asc: false };
    case 'total_asc': return { columna: 'total', asc: true };
    case 'numero_desc': return { columna: 'numero', asc: false };
    case 'cliente': return { columna: 'cliente_nombre', asc: true };
  }
}

export type FiltrosExtra = {
  canal?: string;
  responsable?: string; // id del miembro, o 'ninguno'
  envio?: string;
  tipo?: string;
  desde?: string; // AAAA-MM-DD, sobre fecha de venta
  hasta?: string;
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Toma los parámetros de la URL y se queda solo con los que tienen forma válida. */
export function leerFiltros(sp: Record<string, string | undefined>): FiltrosExtra {
  const limpio = (v?: string) => (v && /^[\w-]{1,60}$/.test(v) ? v : undefined);
  return {
    canal: limpio(sp.canal),
    responsable: limpio(sp.resp),
    envio: limpio(sp.envio),
    tipo: limpio(sp.tipo),
    desde: sp.desde && FECHA.test(sp.desde) ? sp.desde : undefined,
    hasta: sp.hasta && FECHA.test(sp.hasta) ? sp.hasta : undefined,
  };
}

export function cantidadFiltros(f: FiltrosExtra): number {
  return Object.values(f).filter(Boolean).length;
}

type Filtrable = {
  canal: string;
  responsable_id: string | null;
  envio: string;
  tipo_venta: string;
  fecha_venta: string;
};

export function filtrarPedidos<T extends Filtrable>(lista: T[], f: FiltrosExtra): T[] {
  return lista.filter((p) => {
    if (f.canal && p.canal !== f.canal) return false;
    if (f.responsable === 'ninguno' ? p.responsable_id !== null : f.responsable && p.responsable_id !== f.responsable) return false;
    if (f.envio && p.envio !== f.envio) return false;
    if (f.tipo && p.tipo_venta !== f.tipo) return false;
    const fv = txt(p.fecha_venta).slice(0, 10);
    if (f.desde && fv < f.desde) return false;
    if (f.hasta && fv > f.hasta) return false;
    return true;
  });
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { fechaHora } from '@/lib/fechas';
import { miembroActual } from '@/lib/sesion';
import { MarcarTodo, MarcarUno } from './marcar';

export const metadata: Metadata = { title: 'Avisos' };

type Aviso = {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string | null;
  link: string | null;
  creada_en: string;
  leida_en: string | null;
  anulada_en: string | null;
};

const POR_PAGINA = 50;

const ETIQUETA: Record<string, string> = {
  reporte_manana: 'Reporte de la mañana',
  reporte_tarde: 'Reporte de la tarde',
  recordatorio_entrega: 'Recordatorio de entrega',
  recordatorio_visita: 'Recordatorio de visita',
  tarea_asignada: 'Tarea',
  tarea_vencida: 'Tarea vencida',
  pedido_atrasado: 'Pedido atrasado',
  pedido_por_vencer: 'Pedido por vencer',
  proveedor_demorado: 'Proveedor',
};

export default async function AvisosPage({ searchParams }: { searchParams: Promise<{ ver?: string; antes?: string }> }) {
  const { ver, antes } = await searchParams;
  const todos = ver === 'todos';
  const { miembro, supabase } = await miembroActual();

  const consulta = (columnas: string) => {
    let q = supabase
      .from('notificaciones')
      .select(columnas)
      .eq('usuario_id', miembro.id)
      .order('creada_en', { ascending: false })
      .limit(POR_PAGINA + 1);
    if (!todos) q = q.is('leida_en', null);
    if (antes && !Number.isNaN(Date.parse(antes))) q = q.lt('creada_en', antes);
    return q;
  };
  const [primera, { count }] = await Promise.all([
    consulta('id, tipo, titulo, cuerpo, link, creada_en, leida_en, anulada_en'),
    supabase.from('notificaciones').select('id', { count: 'exact', head: true }).eq('usuario_id', miembro.id).is('leida_en', null),
  ]);
  // Si todavía no se corrió la migración 0017, la columna anulada_en no existe.
  const { data } = primera.error ? await consulta('id, tipo, titulo, cuerpo, link, creada_en, leida_en') : primera;
  const filas = ((data ?? []) as unknown as Partial<Aviso>[]).map((a) => ({ anulada_en: null, ...a }) as Aviso);
  const hayMas = filas.length > POR_PAGINA;
  const avisos = filas.slice(0, POR_PAGINA);
  const sinLeer = count ?? 0;
  const base = todos ? '/avisos?ver=todos' : '/avisos';
  const siguiente = hayMas ? `${base}${todos ? '&' : '?'}antes=${encodeURIComponent(avisos[avisos.length - 1].creada_en)}` : null;

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Avisos</h1>
          <p className="sub">{sinLeer ? `${sinLeer} sin leer` : 'Estás al día'}</p>
        </div>
        {sinLeer > 0 && <MarcarTodo />}
      </div>

      <nav className="filtros" aria-label="Qué avisos ver">
        <Link href="/avisos" className="filtro" aria-current={!todos ? 'true' : undefined}>
          Sin leer<span className="n">{sinLeer}</span>
        </Link>
        <Link href="/avisos?ver=todos" className="filtro" aria-current={todos ? 'true' : undefined}>
          Todos
        </Link>
      </nav>

      <section className="card">
        {avisos.length === 0 ? (
          <div className="vacio">
            {todos || antes
              ? 'No hay avisos anteriores.'
              : 'No tenés avisos sin leer. Llegan con los reportes de la mañana y de la tarde, 40 minutos antes de cada entrega o visita, cuando te asignan una tarea y cuando un pedido se atrasa.'}
          </div>
        ) : (
          <ul className="lista">
            {avisos.map((a) => (
              <li key={a.id} className="aviso-li">
                <Link
                  href={`/avisos/abrir/${a.id}`}
                  prefetch={false}
                  className={`aviso-fila${a.leida_en ? '' : ' aviso-nuevo'}${a.anulada_en ? ' aviso-anulado' : ''}`}
                >
                  <span className="aviso-punto" aria-hidden />
                  <span style={{ minWidth: 0 }}>
                    <span className="aviso-tipo">{ETIQUETA[a.tipo] ?? 'Aviso'}</span>
                    <span className="aviso-titulo">{a.titulo}</span>
                    {a.cuerpo && <span className="aviso-cuerpo">{a.cuerpo}</span>}
                    <span className="aviso-cuando">{fechaHora(a.creada_en)}</span>
                  </span>
                </Link>
                {!a.leida_en && <MarcarUno id={a.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>
      {(siguiente || antes) && (
        <div className="acciones" style={{ justifyContent: 'center', marginTop: 12 }}>
          {antes && (
            <Link href={base} className="btn btn-chico">
              Volver a los últimos
            </Link>
          )}
          {siguiente && (
            <Link href={siguiente} className="btn btn-chico">
              Ver anteriores
            </Link>
          )}
        </div>
      )}
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { PedidoFila } from '@/components/pedido-fila';
import { ETAPAS, ETAPAS_ACTIVAS } from '@/lib/constantes';
import { miembroActual } from '@/lib/sesion';
import type { PedidoResumen } from '@/lib/tipos';

export const metadata: Metadata = { title: 'Pedidos' };

type Filtro = 'activos' | 'atrasados' | 'mios' | 'saldo' | 'entregados' | (typeof ETAPAS)[number]['id'];

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; q?: string }>;
}) {
  const { f, q } = await searchParams;
  const filtro = (f ?? 'activos') as Filtro;
  const busqueda = (q ?? '').trim();
  const { miembro, supabase } = await miembroActual();

  // Los activos se traen siempre: alimentan los contadores de los filtros.
  const { data: activosData } = await supabase
    .from('pedidos_resumen')
    .select('*')
    .in('etapa', ETAPAS_ACTIVAS)
    .order('fecha_limite', { ascending: true })
    .limit(500);
  const activos = (activosData ?? []) as PedidoResumen[];

  let lista: PedidoResumen[];
  if (busqueda || filtro === 'entregados') {
    let consulta = supabase.from('pedidos_resumen').select('*').order('fecha_venta', { ascending: false }).limit(100);
    if (filtro === 'entregados') consulta = consulta.eq('etapa', 'entregado');
    if (busqueda) {
      const num = Number(busqueda.replace('#', ''));
      const seguro = busqueda.replace(/[%,()]/g, ' ');
      consulta = Number.isInteger(num) && num > 0
        ? consulta.eq('numero', num)
        : consulta.or(`cliente_nombre.ilike.%${seguro}%,cliente_telefono.ilike.%${seguro}%,productos.ilike.%${seguro}%`);
    }
    const { data } = await consulta;
    lista = (data ?? []) as PedidoResumen[];
  } else if (filtro === 'atrasados') {
    lista = activos.filter((p) => p.atrasado);
  } else if (filtro === 'mios') {
    lista = activos.filter((p) => p.responsable_id === miembro.id);
  } else if (filtro === 'saldo') {
    lista = activos.filter((p) => Number(p.saldo) > 0);
  } else if (filtro === 'activos') {
    lista = activos;
  } else {
    lista = activos.filter((p) => p.etapa === filtro);
  }

  const atrasados = activos.filter((p) => p.atrasado).length;
  const filtros: { id: Filtro; nombre: string; n?: number }[] = [
    { id: 'activos', nombre: 'Activos', n: activos.length },
    { id: 'atrasados', nombre: 'Atrasados', n: atrasados },
    { id: 'mios', nombre: 'Míos', n: activos.filter((p) => p.responsable_id === miembro.id).length },
    { id: 'saldo', nombre: 'Con saldo', n: activos.filter((p) => Number(p.saldo) > 0).length },
    ...ETAPAS.filter((e) => ETAPAS_ACTIVAS.includes(e.id)).map((e) => ({
      id: e.id as Filtro,
      nombre: e.corto,
      n: activos.filter((p) => p.etapa === e.id).length,
    })),
    { id: 'entregados', nombre: 'Entregados' },
  ];

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Pedidos</h1>
          <p className="sub">
            {activos.length} activos
            {atrasados > 0 && (
              <>
                {' · '}
                <Link href="/pedidos?f=atrasados" style={{ color: 'var(--danger)', fontWeight: 600 }}>
                  {atrasados} atrasado{atrasados > 1 ? 's' : ''}
                </Link>
              </>
            )}
          </p>
        </div>
      </div>

      <form className="buscador" role="search">
        <input type="search" name="q" placeholder="Buscar cliente, teléfono, modelo o #número" defaultValue={busqueda} aria-label="Buscar" />
        {filtro !== 'activos' && <input type="hidden" name="f" value={filtro} />}
      </form>

      {!busqueda && (
        <div className="filtros" role="tablist">
          {filtros.map((x) => (
            <Link key={x.id} href={x.id === 'activos' ? '/pedidos' : `/pedidos?f=${x.id}`} className={`filtro etapa-${x.id}`} aria-current={filtro === x.id ? 'true' : undefined}>
              {x.nombre}
              {x.n !== undefined && <span className="n">{x.n}</span>}
            </Link>
          ))}
        </div>
      )}

      <div className="card">
        {lista.length === 0 ? (
          <div className="vacio">
            {busqueda ? `No hay pedidos que coincidan con “${busqueda}”.` : 'No hay pedidos en esta vista.'}
            {activos.length === 0 && !busqueda && (
              <div style={{ marginTop: 12 }}>
                <Link href="/pedidos/nuevo" className="btn btn-primario">
                  Cargar el primer pedido
                </Link>
              </div>
            )}
          </div>
        ) : (
          <ul className="lista">
            {lista.map((p) => (
              <PedidoFila key={p.id} p={p} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

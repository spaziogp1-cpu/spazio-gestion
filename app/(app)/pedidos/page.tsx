import type { Metadata } from 'next';
import Link from 'next/link';
import { PedidoFila } from '@/components/pedido-fila';
import { PedidosFiltros } from '@/components/pedidos-filtros';
import { ETAPAS, ETAPAS_ACTIVAS } from '@/lib/constantes';
import { miembroActual } from '@/lib/sesion';
import {
  cantidadFiltros,
  filtrarPedidos,
  leerFiltros,
  ordenarPedidos,
  ordenConsulta,
  ordenValido,
  type OrdenId,
} from '@/lib/pedidos-orden';
import type { PedidoResumen } from '@/lib/tipos';

export const metadata: Metadata = { title: 'Pedidos' };

type Filtro = 'activos' | 'atrasados' | 'mios' | 'saldo' | 'entregados' | (typeof ETAPAS)[number]['id'];

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const filtro = (sp.f ?? 'activos') as Filtro;
  const busqueda = (sp.q ?? '').trim();
  // Activos: por defecto lo más urgente arriba. Entregados y búsquedas: lo más reciente arriba.
  const ordenPorDefecto: OrdenId = busqueda || filtro === 'entregados' ? 'venta_desc' : 'limite';
  const orden = ordenValido(sp.orden) ?? ordenPorDefecto;
  const extra = leerFiltros(sp);
  const nExtra = cantidadFiltros(extra);
  const { miembro, supabase } = await miembroActual();
  const { data: eq } = await supabase.from('equipo').select('id, nombre').eq('activo', true).order('nombre');
  const equipo = (eq ?? []) as { id: string; nombre: string }[];

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
    const oc = ordenConsulta(orden);
    let consulta = supabase
      .from('pedidos_resumen')
      .select('*')
      .order(oc.columna, { ascending: oc.asc, nullsFirst: oc.nullsFirst })
      .order('numero', { ascending: false })
      .limit(200);
    if (filtro === 'entregados') consulta = consulta.eq('etapa', 'entregado');
    // Los filtros extra van en la consulta para que el límite no se coma resultados.
    if (extra.canal) consulta = consulta.eq('canal', extra.canal);
    if (extra.responsable === 'ninguno') consulta = consulta.is('responsable_id', null);
    else if (extra.responsable) consulta = consulta.eq('responsable_id', extra.responsable);
    if (extra.envio) consulta = consulta.eq('envio', extra.envio);
    if (extra.tipo) consulta = consulta.eq('tipo_venta', extra.tipo);
    if (extra.desde) consulta = consulta.gte('fecha_venta', extra.desde);
    if (extra.hasta) consulta = consulta.lte('fecha_venta', extra.hasta);
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
  lista = ordenarPedidos(filtrarPedidos(lista, extra), orden);

  // Los chips de arriba conservan el orden y los filtros elegidos.
  const conParams = (f?: string) => {
    const u = new URLSearchParams();
    if (f && f !== 'activos') u.set('f', f);
    const porDefecto = f === 'entregados' ? 'venta_desc' : 'limite';
    if (orden !== porDefecto) u.set('orden', orden);
    if (extra.canal) u.set('canal', extra.canal);
    if (extra.responsable) u.set('resp', extra.responsable);
    if (extra.envio) u.set('envio', extra.envio);
    if (extra.tipo) u.set('tipo', extra.tipo);
    if (extra.desde) u.set('desde', extra.desde);
    if (extra.hasta) u.set('hasta', extra.hasta);
    return `/pedidos${u.size ? `?${u}` : ''}`;
  };

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
        {orden !== ordenPorDefecto && <input type="hidden" name="orden" value={orden} />}
        {extra.canal && <input type="hidden" name="canal" value={extra.canal} />}
        {extra.responsable && <input type="hidden" name="resp" value={extra.responsable} />}
        {extra.envio && <input type="hidden" name="envio" value={extra.envio} />}
        {extra.tipo && <input type="hidden" name="tipo" value={extra.tipo} />}
        {extra.desde && <input type="hidden" name="desde" value={extra.desde} />}
        {extra.hasta && <input type="hidden" name="hasta" value={extra.hasta} />}
      </form>

      {!busqueda && (
        <div className="filtros" role="tablist">
          {filtros.map((x) => (
            <Link key={x.id} href={conParams(x.id)} className={`filtro etapa-${x.id}`} aria-current={filtro === x.id ? 'true' : undefined}>
              {x.nombre}
              {x.n !== undefined && <span className="n">{x.n}</span>}
            </Link>
          ))}
        </div>
      )}

      <PedidosFiltros
        key={JSON.stringify([filtro, busqueda, orden, extra])}
        filtro={filtro}
        busqueda={busqueda}
        orden={orden}
        ordenPorDefecto={ordenPorDefecto}
        extra={extra}
        equipo={equipo}
        activosExtra={nExtra}
      />

      <div className="card">
        {lista.length === 0 ? (
          <div className="vacio">
            {busqueda
              ? `No hay pedidos que coincidan con “${busqueda}”.`
              : nExtra > 0
                ? 'No hay pedidos con estos filtros.'
                : 'No hay pedidos en esta vista.'}
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

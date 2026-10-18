import type { Metadata } from 'next';
import Link from 'next/link';
import { BarraAvance } from '@/components/avance';
import { PedidoFila } from '@/components/pedido-fila';
import { ListaTareas } from '@/components/tareas';
import { fechaCorta, horaCorta } from '@/lib/fechas';
import { plata } from '@/lib/formato';
import { armarResumen } from '@/lib/resumen';
import { miembroActual } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Mi día' };

function saludo() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', hour12: false }).format(new Date()));
  return h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
}

function Bloque({ titulo, cantidad, href, children, alerta }: { titulo: string; cantidad?: number; href?: string; children: React.ReactNode; alerta?: boolean }) {
  return (
    <section className="card" style={alerta ? { borderColor: 'var(--danger)' } : undefined}>
      <div className="card-titulo">
        <h2 style={alerta ? { color: 'var(--danger)' } : undefined}>
          {titulo} {cantidad !== undefined && <span className="faint num">{cantidad}</span>}
        </h2>
        {href && (
          <Link href={href} className="btn btn-chico btn-fantasma">
            Ver todo
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export default async function MiDia({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver } = await searchParams;
  const general = ver === 'general';
  const { miembro, supabase } = await miembroActual();
  const [{ data: eq }, r] = await Promise.all([
    supabase.from('equipo').select('id, nombre').eq('activo', true).order('nombre'),
    armarResumen(supabase, general ? null : miembro.id),
  ]);
  const equipo = (eq ?? []) as { id: string; nombre: string }[];
  const tareasDelDia = [...r.tareasVencidas, ...r.tareasHoy];
  const totalSaldos = r.saldos.reduce((s, p) => s + Number(p.saldo), 0);

  const contadores = [
    { n: r.atrasados.length, txt: 'atrasados', href: '/pedidos?f=atrasados', mal: true },
    { n: r.tareasVencidas.length, txt: 'tareas vencidas', href: general ? '/tareas?de=todos' : '/tareas', mal: true },
    { n: r.entregasHoy.length, txt: 'entregas hoy', href: '/calendario?vista=dia' },
    { n: r.visitasHoy.length, txt: 'visitas hoy', href: '/showroom' },
    { n: r.listasSinAvisar.length, txt: 'listas para avisar', href: '/pedidos?f=lista' },
  ];

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>{general ? 'Cómo viene el negocio' : `${saludo()}, ${miembro.nombre}`}</h1>
          <p className="sub" style={{ textTransform: 'capitalize' }}>{fechaCorta(r.hoy)}</p>
        </div>
      </div>

      <div className="filtros">
        <Link href="/" className="filtro" aria-current={!general ? 'true' : undefined}>
          Mi día
        </Link>
        <Link href="/?ver=general" className="filtro" aria-current={general ? 'true' : undefined}>
          General
        </Link>
      </div>

      <div className="contadores">
        {contadores.map((c) => (
          <Link key={c.txt} href={c.href} className={`card contador${c.mal && c.n > 0 ? ' contador-mal' : ''}`}>
            <span className="contador-n num">{c.n}</span>
            <span className="contador-txt">{c.txt}</span>
          </Link>
        ))}
      </div>

      <div className="grid-ficha" style={{ marginTop: 12 }}>
        <div className="col">
          <Bloque titulo={general ? 'Tareas del equipo para hoy' : 'Tus tareas de hoy'} cantidad={tareasDelDia.length} href={general ? '/tareas?de=todos' : '/tareas'} alerta={r.tareasVencidas.length > 0}>
            <div className="seccion">
              {tareasDelDia.length === 0 ? (
                <p className="quiet small">Nada para hoy. {r.tareasProximas.length > 0 && `Tenés ${r.tareasProximas.length} en los próximos días.`}</p>
              ) : (
                <ListaTareas tareas={tareasDelDia} equipo={equipo} agrupar />
              )}
            </div>
          </Bloque>

          {r.atrasados.length > 0 && (
            <Bloque titulo="Pedidos atrasados" cantidad={r.atrasados.length} href="/pedidos?f=atrasados" alerta>
              <ul className="lista">
                {r.atrasados.slice(0, 8).map((p) => (
                  <PedidoFila key={p.id} p={p} />
                ))}
              </ul>
            </Bloque>
          )}

          {r.porVencer.length > 0 && (
            <Bloque titulo="Vencen en los próximos días" cantidad={r.porVencer.length}>
              <ul className="lista">
                {r.porVencer.map((p) => (
                  <PedidoFila key={p.id} p={p} />
                ))}
              </ul>
            </Bloque>
          )}

          {r.listasSinAvisar.length > 0 && (
            <Bloque titulo="Listas: hay que avisar al cliente" cantidad={r.listasSinAvisar.length} href="/pedidos?f=lista">
              <ul className="lista">
                {r.listasSinAvisar.map((p) => (
                  <PedidoFila key={p.id} p={p} />
                ))}
              </ul>
            </Bloque>
          )}
        </div>

        <div className="col">
          <Bloque titulo="Hoy en el showroom" cantidad={r.visitasHoy.length} href="/showroom">
            <div className="seccion">
              {r.visitasHoy.length === 0 ? (
                <p className="quiet small">Sin visitas agendadas.</p>
              ) : (
                r.visitasHoy.map((v) => (
                  <div key={v.id} className="item acciones" style={{ flexWrap: 'nowrap' }}>
                    <span className="visita-hora num">{horaCorta(v.hora) || '—'}</span>
                    <span>
                      <strong>{v.nombre}</strong>
                      {v.motivo && <span className="quiet small"> · {v.motivo}</span>}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Bloque>

          <Bloque titulo="Entregas" cantidad={r.entregasHoy.length + r.entregasSemana.length} href="/calendario?vista=semana">
            <div className="seccion">
              {r.entregasHoy.length + r.entregasSemana.length === 0 ? (
                <p className="quiet small">No hay entregas programadas esta semana.</p>
              ) : (
                [...r.entregasHoy, ...r.entregasSemana].map((p) => (
                  <Link key={p.id} href={`/pedidos/${p.id}`} className="item acciones" style={{ flexWrap: 'nowrap', justifyContent: 'space-between' }}>
                    <span style={{ minWidth: 0 }}>
                      <strong>{p.cliente_nombre}</strong> <span className="faint small mono">#{p.numero}</span>
                      <span className="item-detalle" style={{ display: 'block' }}>
                        {[p.envio === 'retira' ? 'Retira' : p.envio, p.cliente_localidad].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="small" style={{ fontWeight: 600, color: p.fecha_entrega_programada === r.hoy ? 'var(--accent)' : undefined }}>
                      {p.fecha_entrega_programada === r.hoy ? 'Hoy' : fechaCorta(p.fecha_entrega_programada)}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </Bloque>

          {r.objetivos.length > 0 && (
            <Bloque titulo="Objetivos" href="/objetivos">
              <div className="seccion">
                {r.objetivos.map((a) => (
                  <div key={a.objetivo.id} className="item">
                    <div className="small" style={{ fontWeight: 600 }}>
                      {a.objetivo.titulo}{' '}
                      <span className="faint" style={{ fontWeight: 400 }}>
                        {a.objetivo.tipo === 'numerico'
                          ? `${a.objetivo.metrica === 'facturacion' ? plata(a.actual) : a.actual} de ${a.objetivo.metrica === 'facturacion' ? plata(a.meta) : a.meta}`
                          : `${a.tareasHechas}/${a.tareasTotal} tareas · para el ${fechaCorta(a.objetivo.fecha_limite)}`}
                      </span>
                    </div>
                    <BarraAvance a={a} />
                  </div>
                ))}
              </div>
            </Bloque>
          )}

          {r.saldos.length > 0 && (
            <Bloque titulo="Saldos por cobrar" cantidad={r.saldos.length} href="/pedidos?f=saldo">
              <div className="seccion">
                <div className="saldo-grande num">{plata(totalSaldos)}</div>
                <p className="faint xs">De pedidos listos, avisados, coordinados o ya entregados.</p>
              </div>
            </Bloque>
          )}

          {general && r.proveedoresDemorados.length > 0 && (
            <Bloque titulo="Proveedores demorados" cantidad={r.proveedoresDemorados.length} href="/proveedores" alerta>
              <div className="seccion">
                {r.proveedoresDemorados.slice(0, 6).map((x) => (
                  <div key={x.id} className="item small">
                    <strong>{x.proveedor_nombre}</strong> · {x.es_stock ? 'stock' : `#${x.pedido_numero} ${x.cliente_nombre}`}
                    <span className="faint"> · esperado {fechaCorta(x.fecha_esperada)}</span>
                  </div>
                ))}
              </div>
            </Bloque>
          )}
        </div>
      </div>
    </>
  );
}

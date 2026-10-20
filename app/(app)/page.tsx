import type { Metadata } from 'next';
import Link from 'next/link';
import { BarraAvance } from '@/components/avance';
import { ListaTareas } from '@/components/tareas';
import { ETAPAS, ETAPAS_ACTIVAS } from '@/lib/constantes';
import { fechaCorta, fechaHora, horaCorta, inicioSemana, relativo } from '@/lib/fechas';
import { plata } from '@/lib/formato';
import { armarResumen } from '@/lib/resumen';
import { miembroActual } from '@/lib/sesion';
import type { Evento, PedidoResumen } from '@/lib/tipos';
import { CAMPOS_OCULTOS, autorEvento, textoEvento } from './pedidos/[id]/historial';

export const metadata: Metadata = { title: 'Mi día' };

function saludo() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', hour12: false }).format(new Date()));
  return h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
}

const COLOR_ETAPA: Record<string, string> = {
  senado: 'violeta',
  en_fabricacion: 'naranja',
  lista: 'verde',
  embalada: 'azul',
  envio_coordinado: 'rosa',
};

function Tarjeta({ titulo, href, enlace = 'Ver todo', children, className = '' }: { titulo: React.ReactNode; href?: string; enlace?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`dash-card ${className}`}>
      <div className="dash-card-cab">
        <h2>{titulo}</h2>
        {href && (
          <Link href={href} className="dash-link">
            {enlace} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Vacio({ children, accion }: { children: React.ReactNode; accion?: { href: string; texto: string } }) {
  return (
    <div className="dash-vacio">
      <p>{children}</p>
      {accion && (
        <Link href={accion.href} className="btn btn-chico">
          {accion.texto}
        </Link>
      )}
    </div>
  );
}

function FilaPedido({ p, derecha }: { p: PedidoResumen; derecha: React.ReactNode }) {
  return (
    <Link href={`/pedidos/${p.id}`} className={`dash-fila etapa-${p.atrasado ? 'atrasado' : p.etapa}`}>
      <span className="dash-fila-txt">
        <strong>{p.cliente_nombre}</strong> <span className="faint mono xs">#{p.numero}</span>
        <span className="dash-fila-sub">{p.productos || 'Sin productos'}</span>
      </span>
      <span className="dash-fila-der">{derecha}</span>
    </Link>
  );
}

export default async function MiDia({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver } = await searchParams;
  const equipoVista = ver === 'general';
  const { miembro, supabase } = await miembroActual();
  const lunes = inicioSemana(new Date().toISOString().slice(0, 10));

  let hechasQ = supabase.from('tareas').select('id', { count: 'exact', head: true }).eq('estado', 'hecha').gte('completada_en', `${lunes}T00:00:00-03:00`);
  if (!equipoVista) hechasQ = hechasQ.eq('responsable_id', miembro.id);

  const [{ data: eq }, r, { count: hechasSemana }, { data: evs }, { data: miembrosEmail }] = await Promise.all([
    supabase.from('equipo').select('id, nombre').eq('activo', true).order('nombre'),
    armarResumen(supabase, equipoVista ? null : miembro.id),
    hechasQ,
    supabase.from('eventos').select('*').not('pedido_id', 'is', null).order('creado_en', { ascending: false }).limit(60),
    supabase.from('equipo').select('nombre, email'),
  ]);
  const equipo = (eq ?? []) as { id: string; nombre: string }[];
  const tareasDelDia = [...r.tareasVencidas, ...r.tareasHoy];
  const totalSaldos = r.saldos.reduce((s, p) => s + Number(p.saldo), 0);
  const entregas = [...r.entregasHoy, ...r.entregasSemana];

  // Avance de pedidos por etapa
  const porEtapa = ETAPAS.filter((e) => ETAPAS_ACTIVAS.includes(e.id)).map((e) => ({ ...e, n: r.activos.filter((p) => p.etapa === e.id).length }));
  const maxEtapa = Math.max(1, ...porEtapa.map((e) => e.n));
  const proximosVencimientos = r.activos
    .filter((p) => ['senado', 'en_fabricacion'].includes(p.etapa))
    .sort((a, b) => a.fecha_limite.localeCompare(b.fecha_limite))
    .slice(0, 5);

  // Hoy: visitas y entregas en orden de horario
  const agendaHoy = [
    ...r.visitasHoy.map((v) => ({ hora: v.hora, tipo: 'visita' as const, titulo: v.nombre, detalle: v.motivo ?? 'Visita al showroom', href: '/showroom' })),
    ...r.entregasHoy.map((p) => ({
      hora: p.hora_entrega_programada ?? null,
      tipo: 'entrega' as const,
      titulo: `${p.envio === 'retira' ? 'Retira' : 'Entrega'} · ${p.cliente_nombre}`,
      detalle: [`#${p.numero}`, p.cliente_localidad].filter(Boolean).join(' · '),
      href: `/pedidos/${p.id}`,
    })),
  ].sort((a, b) => (a.hora ?? '99').localeCompare(b.hora ?? '99'));

  // Actividad reciente del equipo (historial de pedidos)
  const nombrePorEmail = new Map(((miembrosEmail ?? []) as { nombre: string; email: string }[]).map((m) => [m.email.toLowerCase(), m.nombre]));
  const eventos = ((evs ?? []) as (Evento & { pedido_id: string })[]).filter((e) => !CAMPOS_OCULTOS.has(e.campo ?? '') && e.campo !== 'actualizado_en').slice(0, 8);
  const idsEv = [...new Set(eventos.map((e) => e.pedido_id))];
  const { data: pedEv } = idsEv.length ? await supabase.from('pedidos_resumen').select('id, numero, cliente_nombre').in('id', idsEv) : { data: [] };
  const pedidoDe = new Map(((pedEv ?? []) as { id: string; numero: number; cliente_nombre: string }[]).map((p) => [p.id, p]));

  // Lo que necesita atención
  const atencion = [
    { n: r.atrasados.length, txt: r.atrasados.length === 1 ? 'pedido atrasado' : 'pedidos atrasados', href: '/pedidos?f=atrasados', color: 'rojo' },
    { n: r.tareasVencidas.length, txt: r.tareasVencidas.length === 1 ? 'tarea vencida' : 'tareas vencidas', href: equipoVista ? '/tareas?de=todos' : '/tareas', color: 'rojo' },
    { n: r.listasSinAvisar.length, txt: r.listasSinAvisar.length === 1 ? 'terminada para avisar' : 'terminadas para avisar', href: '/pedidos?f=lista', color: 'verde' },
    { n: r.porVencer.length, txt: 'vencen en los próximos días', href: '/pedidos', color: 'amarillo' },
    { n: equipoVista ? r.proveedoresDemorados.length : 0, txt: r.proveedoresDemorados.length === 1 ? 'proveedor demorado' : 'proveedores demorados', href: '/proveedores', color: 'bronce' },
  ].filter((a) => a.n > 0);

  const quien = equipoVista ? 'del equipo' : 'tuyos';

  return (
    <div className="dash">
      <header className="dash-cabecera">
        <div>
          <p className="dash-fecha">{fechaCorta(r.hoy)}</p>
          <h1>{equipoVista ? 'Cómo viene el equipo' : <>{saludo()}, <em>{miembro.nombre}</em></>}</h1>
        </div>
        <div className="dash-acciones">
          <nav className="dash-segmento" aria-label="Qué ver">
            <Link href="/" aria-current={!equipoVista ? 'page' : undefined}>
              Mi día
            </Link>
            <Link href="/?ver=general" aria-current={equipoVista ? 'page' : undefined}>
              Equipo
            </Link>
          </nav>
          <Link href="/pedidos/nuevo" className="btn btn-primario">
            + Nuevo pedido
          </Link>
          <Link href="/calendario" className="btn">
            Agendar entrega
          </Link>
          <Link href={equipoVista ? '/tareas?de=todos' : '/tareas'} className="btn">
            Nueva tarea
          </Link>
        </div>
      </header>

      <section className="dash-kpis" aria-label="Resumen">
        <Link href={equipoVista ? '/tareas?de=todos' : '/tareas'} className="dash-kpi vidrio-amarillo">
          <span className="dash-kpi-txt">Para hacer hoy</span>
          <span className="dash-kpi-n num">{tareasDelDia.length}</span>
          <span className="dash-kpi-sub">
            {r.tareasVencidas.length > 0 ? <strong>{r.tareasVencidas.length} {r.tareasVencidas.length === 1 ? 'vencida' : 'vencidas'}</strong> : 'sin vencidas'} · {hechasSemana ?? 0} hechas esta semana
          </span>
        </Link>
        <Link href="/produccion" className="dash-kpi vidrio-naranja">
          <span className="dash-kpi-txt">Pedidos en curso {equipoVista ? '' : '(tuyos)'}</span>
          <span className="dash-kpi-n num">{r.activos.length}</span>
          <span className="dash-mini-barra" aria-hidden="true">
            {porEtapa.map((e) => (e.n ? <span key={e.id} style={{ flex: e.n, background: `var(--c-${COLOR_ETAPA[e.id]})` }} /> : null))}
          </span>
        </Link>
        <Link href="/calendario?vista=semana" className="dash-kpi vidrio-azul">
          <span className="dash-kpi-txt">Entregas esta semana</span>
          <span className="dash-kpi-n num">{entregas.length}</span>
          <span className="dash-kpi-sub">{r.entregasHoy.length ? `${r.entregasHoy.length} hoy` : 'ninguna hoy'}</span>
        </Link>
        <Link href="/pedidos?f=saldo" className="dash-kpi vidrio-verde">
          <span className="dash-kpi-txt">Por cobrar {quien === 'tuyos' ? '(tuyos)' : ''}</span>
          <span className="dash-kpi-n dash-kpi-plata num">{plata(totalSaldos)}</span>
          <span className="dash-kpi-sub">{r.saldos.length ? `${r.saldos.length} pedidos con saldo` : 'todo cobrado'}</span>
        </Link>
      </section>

      {atencion.length > 0 && (
        <section className="dash-atencion" aria-label="Necesita atención">
          <span className="dash-atencion-tit">Necesita atención</span>
          {atencion.map((a) => (
            <Link key={a.txt} href={a.href} className={`dash-alerta vidrio-${a.color}`}>
              <strong className="num">{a.n}</strong> {a.txt}
            </Link>
          ))}
        </section>
      )}

      <div className="dash-grilla">
        <div className="dash-principal">
          <Tarjeta titulo={<>{equipoVista ? 'Tareas del equipo' : 'Tus tareas'} <span className="dash-cant num">{tareasDelDia.length}</span></>} href={equipoVista ? '/tareas?de=todos' : '/tareas'}>
            {tareasDelDia.length === 0 ? (
              <Vacio accion={{ href: '/tareas', texto: 'Crear una tarea' }}>
                Nada pendiente para hoy.
                {r.tareasProximas.length > 0 && ` Hay ${r.tareasProximas.length} en los próximos días.`}
              </Vacio>
            ) : (
              <div className="dash-cuerpo">
                <ListaTareas tareas={tareasDelDia} equipo={equipo} agrupar />
              </div>
            )}
            {tareasDelDia.length > 0 && r.tareasProximas.length > 0 && (
              <p className="dash-pie">
                Y {r.tareasProximas.length} {r.tareasProximas.length === 1 ? 'tarea' : 'tareas'} para los próximos días.
              </p>
            )}
          </Tarjeta>

          <Tarjeta titulo={equipoVista ? 'Avance de los pedidos' : 'Avance de tus pedidos'} href="/produccion" enlace="Producción">
            {r.activos.length === 0 ? (
              <Vacio accion={{ href: '/pedidos/nuevo', texto: 'Cargar un pedido' }}>
                {equipoVista ? 'No hay pedidos en curso.' : 'No tenés pedidos en curso a tu nombre.'}
              </Vacio>
            ) : (
              <>
                <div className="dash-etapas">
                  {porEtapa.map((e) => (
                    <Link key={e.id} href={`/pedidos?f=${e.id}`} className="dash-etapa">
                      <span className="dash-etapa-n num">{e.n}</span>
                      <span className="dash-etapa-pista">
                        <span style={{ width: `${(e.n / maxEtapa) * 100}%`, background: `var(--c-${COLOR_ETAPA[e.id]})` }} />
                      </span>
                      <span className="dash-etapa-txt">{e.corto}</span>
                    </Link>
                  ))}
                </div>
                {proximosVencimientos.length > 0 && (
                  <>
                    <h3 className="dash-sub">Próximas fechas límite</h3>
                    <div className="dash-lista">
                      {proximosVencimientos.map((p) => (
                        <FilaPedido
                          key={p.id}
                          p={p}
                          derecha={
                            <span className={p.atrasado ? 'mal' : p.dias_restantes <= 3 ? 'pronto' : ''}>
                              {fechaCorta(p.fecha_limite)}
                              <span className="dash-fila-sub">{relativo(p.dias_restantes)}</span>
                            </span>
                          }
                        />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </Tarjeta>

          {r.listasSinAvisar.length > 0 && (
            <Tarjeta titulo={<>Terminadas: avisar y coordinar <span className="dash-cant num">{r.listasSinAvisar.length}</span></>} href="/pedidos?f=lista">
              <div className="dash-lista">
                {r.listasSinAvisar.slice(0, 6).map((p) => (
                  <FilaPedido key={p.id} p={p} derecha={<span>{p.envio === 'retira' ? 'Retira' : 'Envío'}</span>} />
                ))}
              </div>
            </Tarjeta>
          )}
        </div>

        <aside className="dash-lateral">
          <Tarjeta titulo="Hoy" href="/calendario?vista=dia" enlace="Calendario">
            {agendaHoy.length === 0 ? (
              <Vacio>Sin visitas ni entregas para hoy.</Vacio>
            ) : (
              <ol className="dash-agenda">
                {agendaHoy.map((a, i) => (
                  <li key={i}>
                    <Link href={a.href} className={`dash-agenda-item ev-${a.tipo}`}>
                      <span className="dash-agenda-hora num">{horaCorta(a.hora) || '—'}</span>
                      <span>
                        <strong>{a.titulo}</strong>
                        <span className="dash-fila-sub">{a.detalle}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </Tarjeta>

          <Tarjeta titulo="Próximas entregas" href="/calendario?vista=semana">
            {r.entregasSemana.length === 0 ? (
              <Vacio accion={{ href: '/calendario', texto: 'Agendar entrega' }}>No hay entregas agendadas esta semana.</Vacio>
            ) : (
              <div className="dash-lista">
                {r.entregasSemana.map((p) => (
                  <Link key={p.id} href={`/pedidos/${p.id}`} className="dash-entrega">
                    <span className="dash-entrega-dia">
                      <span className="xs">{fechaCorta(p.fecha_entrega_programada).split(' ')[0]}</span>
                      <strong className="num">{p.fecha_entrega_programada?.slice(8)}</strong>
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <strong>{p.cliente_nombre}</strong>
                      <span className="dash-fila-sub">
                        {[horaCorta(p.hora_entrega_programada), p.envio === 'retira' ? 'Retira' : p.envio, p.cliente_localidad].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Tarjeta>

          {r.objetivos.length > 0 && (
            <Tarjeta titulo="Objetivos" href="/objetivos">
              <div className="dash-cuerpo">
                {r.objetivos.map((a) => (
                  <div key={a.objetivo.id} className="dash-objetivo">
                    <div className="small" style={{ fontWeight: 600 }}>
                      {a.objetivo.titulo}{' '}
                      <span className="faint" style={{ fontWeight: 400 }}>
                        {a.objetivo.tipo === 'numerico'
                          ? `${a.objetivo.metrica === 'facturacion' ? plata(a.actual) : a.actual} de ${a.objetivo.metrica === 'facturacion' ? plata(a.meta) : a.meta}`
                          : `${a.tareasHechas}/${a.tareasTotal} tareas`}
                      </span>
                    </div>
                    <BarraAvance a={a} />
                  </div>
                ))}
              </div>
            </Tarjeta>
          )}

          <Tarjeta titulo="Actividad del equipo">
            {eventos.length === 0 ? (
              <Vacio>Todavía no hay movimientos.</Vacio>
            ) : (
              <ol className="dash-actividad">
                {eventos.map((e) => {
                  const p = pedidoDe.get(e.pedido_id);
                  return (
                    <li key={e.id}>
                      <Link href={`/pedidos/${e.pedido_id}`}>
                        <span>
                          <strong>{autorEvento(e.usuario_email, nombrePorEmail)}</strong> {textoEvento(e)}
                          {p && <span className="faint"> · #{p.numero} {p.cliente_nombre}</span>}
                        </span>
                        <span className="dash-fila-sub">{fechaHora(e.creado_en)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            )}
          </Tarjeta>
        </aside>
      </div>
    </div>
  );
}

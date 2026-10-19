import type { Metadata } from 'next';
import Link from 'next/link';
import { diaSemana, fechaCorta, hoyAR, horaCorta, inicioSemana, sumarDiasCorridos } from '@/lib/fechas';
import { ETAPAS_ACTIVAS } from '@/lib/constantes';
import { miembroActual } from '@/lib/sesion';
import { AgendarEntrega, type PedidoParaAgendar } from './agendar';

export const metadata: Metadata = { title: 'Calendario' };

type Tipo = 'entrega' | 'limite' | 'visita' | 'tarea' | 'proveedor';
type Evento = { tipo: Tipo; fecha: string; hora?: string | null; titulo: string; detalle?: string; href: string; persona: string | null; todos?: boolean; alerta?: boolean };

const TIPOS: { id: Tipo; nombre: string }[] = [
  { id: 'entrega', nombre: 'Entregas' },
  { id: 'limite', nombre: 'Fechas límite' },
  { id: 'visita', nombre: 'Visitas' },
  { id: 'tarea', nombre: 'Tareas' },
  { id: 'proveedor', nombre: 'Llegadas de proveedores' },
];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

type Params = { vista?: string; fecha?: string; tipo?: string; de?: string };

export default async function CalendarioPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const hoy = hoyAR();
  const vista = params.vista === 'semana' || params.vista === 'dia' ? params.vista : 'mes';
  const fecha = params.fecha && /^\d{4}-\d{2}-\d{2}$/.test(params.fecha) ? params.fecha : hoy;
  const tiposActivos = new Set<Tipo>(
    params.tipo ? (params.tipo.split(',').filter((t) => TIPOS.some((x) => x.id === t)) as Tipo[]) : TIPOS.map((t) => t.id),
  );
  const persona = params.de || null;

  // Rango visible
  let desde: string, hasta: string;
  if (vista === 'mes') {
    desde = inicioSemana(`${fecha.slice(0, 7)}-01`);
    hasta = sumarDiasCorridos(desde, 41);
  } else if (vista === 'semana') {
    desde = inicioSemana(fecha);
    hasta = sumarDiasCorridos(desde, 6);
  } else {
    desde = hasta = fecha;
  }

  const { supabase } = await miembroActual();
  const [eqR, pedR, visR, tarR, provR, actR] = await Promise.all([
    supabase.from('equipo').select('id, nombre').eq('activo', true).order('nombre'),
    supabase
      .from('pedidos_resumen')
      .select('id, numero, cliente_nombre, cliente_localidad, productos, etapa, envio, fecha_limite, fecha_entrega_programada, hora_entrega_programada, responsable_id, atrasado')
      .neq('etapa', 'cancelado')
      .or(`and(fecha_entrega_programada.gte.${desde},fecha_entrega_programada.lte.${hasta}),and(fecha_limite.gte.${desde},fecha_limite.lte.${hasta})`),
    supabase.from('visitas').select('id, nombre, fecha, hora, motivo, estado, atiende_id').gte('fecha', desde).lte('fecha', hasta).neq('estado', 'cancelada'),
    supabase
      .from('tareas_resumen')
      .select('id, titulo, vencimiento, responsable_id, responsable_nombre, prioridad, pedido_id, vencida')
      .neq('estado', 'hecha')
      .gte('vencimiento', desde)
      .lte('vencimiento', hasta),
    supabase
      .from('proveedor_pendientes')
      .select('id, proveedor_nombre, fecha_esperada, detalle, pedido_id, pedido_numero, cliente_nombre, es_stock, demorado')
      .eq('estado', 'pedido')
      .gte('fecha_esperada', desde)
      .lte('fecha_esperada', hasta),
    supabase
      .from('pedidos_resumen')
      .select('id, numero, cliente_nombre, cliente_localidad, productos, etapa, envio, fecha_entrega_programada')
      .in('etapa', ETAPAS_ACTIVAS)
      .order('numero'),
  ]);
  const paraAgendar = (actR.data ?? []) as PedidoParaAgendar[];
  const equipo = (eqR.data ?? []) as { id: string; nombre: string }[];
  const nombre = (id: string | null) => equipo.find((m) => m.id === id)?.nombre ?? '';

  const eventos: Evento[] = [];
  for (const p of (pedR.data ?? []) as Record<string, any>[]) {
    const prog = p.fecha_entrega_programada as string | null;
    if (prog && prog >= desde && prog <= hasta) {
      eventos.push({
        tipo: 'entrega',
        fecha: prog,
        hora: p.hora_entrega_programada,
        titulo: `${p.envio === 'retira' ? 'Retira' : 'Entrega'} #${p.numero} ${p.cliente_nombre}`,
        detalle: [p.productos, p.cliente_localidad].filter(Boolean).join(' · '),
        href: `/pedidos/${p.id}`,
        persona: p.responsable_id,
      });
    }
    const activo = ['senado', 'en_fabricacion', 'lista', 'cliente_avisado'].includes(p.etapa);
    if (activo && !prog && p.fecha_limite >= desde && p.fecha_limite <= hasta) {
      eventos.push({
        tipo: 'limite',
        fecha: p.fecha_limite,
        titulo: `Vence #${p.numero} ${p.cliente_nombre}`,
        detalle: p.productos,
        href: `/pedidos/${p.id}`,
        persona: p.responsable_id,
        alerta: p.atrasado,
      });
    }
  }
  for (const v of (visR.data ?? []) as Record<string, any>[]) {
    eventos.push({
      tipo: 'visita',
      fecha: v.fecha,
      hora: v.hora,
      titulo: `Visita: ${v.nombre}`,
      detalle: [v.motivo, nombre(v.atiende_id) && `atiende ${nombre(v.atiende_id)}`].filter(Boolean).join(' · '),
      href: '/showroom',
      persona: v.atiende_id,
    });
  }
  for (const t of (tarR.data ?? []) as Record<string, any>[]) {
    eventos.push({
      tipo: 'tarea',
      fecha: t.vencimiento,
      titulo: t.titulo,
      detalle: t.responsable_nombre ?? 'Todo el equipo',
      href: t.pedido_id ? `/pedidos/${t.pedido_id}` : '/tareas?de=todos',
      persona: t.responsable_id,
      todos: !t.responsable_id,
      alerta: t.vencida,
    });
  }
  for (const x of (provR.data ?? []) as Record<string, any>[]) {
    eventos.push({
      tipo: 'proveedor',
      fecha: x.fecha_esperada,
      titulo: `Llega ${x.proveedor_nombre}${x.es_stock ? ' (stock)' : ` · #${x.pedido_numero} ${x.cliente_nombre}`}`,
      detalle: x.detalle ?? undefined,
      href: x.pedido_id ? `/pedidos/${x.pedido_id}` : '/proveedores?tipo=stock',
      persona: null,
      alerta: x.demorado,
    });
  }

  const visibles = eventos
    .filter((e) => tiposActivos.has(e.tipo))
    .filter((e) => !persona || e.persona === persona || e.todos)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora ?? '').localeCompare(b.hora ?? '') || a.tipo.localeCompare(b.tipo));
  const porDia = new Map<string, Evento[]>();
  for (const e of visibles) porDia.set(e.fecha, [...(porDia.get(e.fecha) ?? []), e]);
  const entregasPorDia = (d: string) => (porDia.get(d) ?? []).filter((e) => e.tipo === 'entrega').length;

  // Navegación
  const href = (cambios: Partial<Params>) => {
    const q = new URLSearchParams();
    const final = { ...params, ...cambios };
    (Object.keys(final) as (keyof Params)[]).forEach((k) => {
      const v = final[k];
      if (v) q.set(k, v);
    });
    const s = q.toString();
    return s ? `/calendario?${s}` : '/calendario';
  };
  const paso = (n: number) => {
    if (vista === 'mes') {
      const [a, m] = fecha.split('-').map(Number);
      const d = new Date(Date.UTC(a, m - 1 + n, 1));
      return d.toISOString().slice(0, 10);
    }
    return sumarDiasCorridos(fecha, n * (vista === 'semana' ? 7 : 1));
  };
  const alternarTipo = (t: Tipo) => {
    const s = new Set(tiposActivos);
    if (s.has(t)) s.delete(t);
    else s.add(t);
    return s.size === TIPOS.length ? undefined : [...s].join(',') || 'ninguno';
  };
  const titulo =
    vista === 'mes'
      ? `${MESES[Number(fecha.slice(5, 7)) - 1]} ${fecha.slice(0, 4)}`
      : vista === 'semana'
        ? `Semana del ${fechaCorta(desde)}`
        : fechaCorta(fecha);

  const dias: string[] = [];
  for (let d = desde; d <= hasta; d = sumarDiasCorridos(d, 1)) dias.push(d);
  const mesActual = fecha.slice(0, 7);

  const Agenda = ({ diasLista }: { diasLista: string[] }) => (
    <div className="cal-agenda">
      {diasLista.filter((d) => porDia.has(d) || vista !== 'mes').length === 0 && (
        <div className="vacio">No hay nada en este período con los filtros elegidos.</div>
      )}
      {diasLista
        .filter((d) => porDia.has(d) || vista !== 'mes')
        .map((d) => (
          <section key={d} className={`cal-dia-lista${d === hoy ? ' es-hoy' : ''}`}>
            <h3>
              {fechaCorta(d)}
              {d === hoy && <span className="chip chip-cliente_avisado" style={{ marginLeft: 6 }}>Hoy</span>}
              {entregasPorDia(d) >= 3 && <span className="chip chip-en_fabricacion" style={{ marginLeft: 6 }}>{entregasPorDia(d)} entregas</span>}
            </h3>
            {(porDia.get(d) ?? []).length === 0 ? (
              <p className="faint small">—</p>
            ) : (
              (porDia.get(d) ?? []).map((e, i) => (
                <Link key={i} href={e.href} className={`cal-evento ev-${e.tipo}${e.alerta ? ' ev-alerta' : ''}`}>
                  <span className="cal-hora num">{horaCorta(e.hora)}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="cal-titulo">{e.titulo}</span>
                    {e.detalle && <span className="cal-detalle">{e.detalle}</span>}
                  </span>
                </Link>
              ))
            )}
          </section>
        ))}
    </div>
  );

  return (
    <>
      <div className="cabecera">
        <div>
          <h1 style={{ textTransform: 'capitalize' }}>{titulo}</h1>
          <p className="sub">{visibles.length} eventos</p>
        </div>
        <div className="acciones" style={{ alignItems: 'center' }}>
          <AgendarEntrega pedidos={paraAgendar} fechaInicial={vista === 'dia' || fecha > hoy ? fecha : hoy} />
          <Link href={href({ fecha: paso(-1) })} className="btn btn-chico" aria-label="Anterior">
            ←
          </Link>
          <Link href={href({ fecha: undefined })} className="btn btn-chico">
            Hoy
          </Link>
          <Link href={href({ fecha: paso(1) })} className="btn btn-chico" aria-label="Siguiente">
            →
          </Link>
        </div>
      </div>

      <div className="filtros">
        {(['mes', 'semana', 'dia'] as const).map((v) => (
          <Link key={v} href={href({ vista: v === 'mes' ? undefined : v })} className="filtro" aria-current={vista === v ? 'true' : undefined}>
            {v === 'mes' ? 'Mes' : v === 'semana' ? 'Semana' : 'Día'}
          </Link>
        ))}
        <span style={{ width: 8, flexShrink: 0 }} />
        <Link href={href({ de: undefined })} className="filtro" aria-current={!persona ? 'true' : undefined}>
          Todos
        </Link>
        {equipo.map((m) => (
          <Link key={m.id} href={href({ de: m.id })} className="filtro" aria-current={persona === m.id ? 'true' : undefined}>
            {m.nombre}
          </Link>
        ))}
      </div>
      <div className="filtros">
        {TIPOS.map((t) => (
          <Link key={t.id} href={href({ tipo: alternarTipo(t.id) })} className={`filtro filtro-tipo ev-${t.id}`} aria-current={tiposActivos.has(t.id) ? 'true' : undefined}>
            {t.nombre}
          </Link>
        ))}
      </div>

      {vista === 'mes' ? (
        <>
          <div className="cal-grid card">
            {DIAS.map((d) => (
              <div key={d} className="cal-cabecera">
                {d}
              </div>
            ))}
            {dias.map((d) => {
              const evs = porDia.get(d) ?? [];
              const otroMes = d.slice(0, 7) !== mesActual;
              return (
                <div key={d} className={`cal-celda${otroMes ? ' otro-mes' : ''}${d === hoy ? ' es-hoy' : ''}${diaSemana(d) === 0 || diaSemana(d) === 6 ? ' finde' : ''}`}>
                  <Link href={href({ vista: 'dia', fecha: d })} className="cal-numero">
                    {Number(d.slice(8))}
                  </Link>
                  {entregasPorDia(d) >= 3 && <div className="cal-acumulacion">{entregasPorDia(d)} entregas</div>}
                  {evs.slice(0, 4).map((e, i) => (
                    <Link key={i} href={e.href} className={`cal-chip ev-${e.tipo}${e.alerta ? ' ev-alerta' : ''}`} title={`${e.titulo}${e.detalle ? ' — ' + e.detalle : ''}`}>
                      {e.hora ? `${horaCorta(e.hora)} ` : ''}
                      {e.titulo}
                    </Link>
                  ))}
                  {evs.length > 4 && (
                    <Link href={href({ vista: 'dia', fecha: d })} className="cal-mas">
                      +{evs.length - 4} más
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
          <div className="cal-solo-movil">
            <Agenda diasLista={dias.filter((d) => d.slice(0, 7) === mesActual)} />
          </div>
        </>
      ) : (
        <Agenda diasLista={dias} />
      )}
    </>
  );
}

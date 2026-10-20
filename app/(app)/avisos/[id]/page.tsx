import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { fechaCorta, fechaHora, fechaLarga } from '@/lib/fechas';
import { miembroActual } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Reporte' };

type Tarea = {
  id: string;
  titulo: string;
  vencimiento?: string | null;
  prioridad?: string;
  estado?: string;
  bloqueo?: string | null;
  pedido_id: string | null;
  de_equipo?: boolean;
  vencida?: boolean;
  atencion?: boolean;
  responsable?: string;
};
type Entrega = { id: string; numero: number; cliente: string; hora: string | null; envio: string; localidad: string | null; etapa: string; mia: boolean | null };
type Visita = { id: string; nombre: string; hora: string | null; motivo: string | null; estado: string; atiende: string | null; mia: boolean | null };
type Datos = { tipo: 'manana' | 'tarde'; fecha: string; tareas: Tarea[]; hechas?: Tarea[]; entregas: Entrega[]; visitas: Visita[]; equipo?: Tarea[] };

const linkTarea = (t: Tarea) => (t.pedido_id ? `/pedidos/${t.pedido_id}` : '/tareas');

function FilaTarea({ t, hecha = false }: { t: Tarea; hecha?: boolean }) {
  const motivo = [
    t.vencida && t.vencimiento ? `venció el ${fechaCorta(t.vencimiento)}` : null,
    t.prioridad === 'alta' && !hecha ? 'prioridad alta' : null,
    t.estado === 'bloqueada' ? `bloqueada${t.bloqueo ? `: ${t.bloqueo}` : ''}` : null,
  ].filter(Boolean);
  return (
    <li>
      <Link href={linkTarea(t)} className={`reporte-fila${t.atencion || t.vencida || t.estado === 'bloqueada' ? ' reporte-atencion' : ''}`}>
        <span className="reporte-marca" aria-hidden>
          {hecha ? '✓' : '○'}
        </span>
        <span style={{ minWidth: 0 }}>
          <span className="item-titulo">{t.titulo}</span>
          <span className="small quiet" style={{ display: 'block' }}>
            {[t.responsable, t.de_equipo ? 'de todo el equipo' : null, ...motivo].filter(Boolean).join(' · ') || (hecha ? 'Completada' : 'Para hoy')}
          </span>
        </span>
      </Link>
    </li>
  );
}

function Seccion({ titulo, n, children, vacio }: { titulo: string; n: number; children: React.ReactNode; vacio: string }) {
  return (
    <section className="card">
      <div className="card-titulo">
        <h2>{titulo}</h2>
        <span className="quiet small num">{n}</span>
      </div>
      {n === 0 ? <p className="quiet small" style={{ padding: '0 16px 14px' }}>{vacio}</p> : <ul className="lista">{children}</ul>}
    </section>
  );
}

export default async function ReportePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase } = await miembroActual();
  const { data: n } = await supabase.from('notificaciones').select('id, tipo, titulo, link, datos, creada_en, leida_en').eq('id', id).maybeSingle();
  if (!n) notFound();
  if (!n.datos) redirect(n.link && n.link.startsWith('/') && n.link !== `/avisos/${id}` ? n.link : '/avisos');
  if (!n.leida_en) await supabase.from('notificaciones').update({ leida_en: new Date().toISOString() }).eq('id', id);

  const d = n.datos as Datos;
  const tarde = d.tipo === 'tarde';
  const atencion = d.tareas.filter((t) => t.atencion);
  const resto = d.tareas.filter((t) => !t.atencion);
  const sinEntregar = tarde ? d.entregas.filter((e) => e.etapa !== 'entregado') : [];

  return (
    <>
      <div className="cabecera">
        <div>
          <Link href="/avisos" className="volver">
            ← Avisos
          </Link>
          <h1>{tarde ? 'Cierre del día' : 'Tu día'}</h1>
          <p className="sub">
            {fechaLarga(d.fecha)} · generado {fechaHora(n.creada_en)}
          </p>
        </div>
      </div>

      <div className="grid-ficha">
        <div className="col">
          {tarde && (
            <Seccion titulo="Completadas hoy" n={d.hechas?.length ?? 0} vacio="Hoy no se completó ninguna tarea tuya ni del equipo.">
              {d.hechas?.map((t) => <FilaTarea key={t.id} t={t} hecha />)}
            </Seccion>
          )}
          {(atencion.length > 0 || sinEntregar.length > 0 || (d.equipo?.length ?? 0) > 0) && (
            <section className="card reporte-alerta">
              <div className="card-titulo">
                <h2>Requieren atención</h2>
                <span className="quiet small num">{atencion.length + sinEntregar.length + (d.equipo?.length ?? 0)}</span>
              </div>
              <ul className="lista">
                {atencion.map((t) => (
                  <FilaTarea key={t.id} t={t} />
                ))}
                {sinEntregar.map((e) => (
                  <li key={e.id}>
                    <Link href={`/pedidos/${e.id}`} className="reporte-fila reporte-atencion">
                      <span className="reporte-marca" aria-hidden>
                        ○
                      </span>
                      <span>
                        <span className="item-titulo">
                          #{e.numero} {e.cliente}
                        </span>
                        <span className="small quiet" style={{ display: 'block' }}>
                          {e.envio === 'retira' ? 'Retiro' : 'Entrega'} de hoy sin marcar como entregada
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
                {d.equipo?.map((t) => <FilaTarea key={t.id} t={{ ...t, atencion: true }} />)}
              </ul>
            </section>
          )}
          <Seccion titulo={tarde ? 'Siguen pendientes' : 'Tareas para hoy'} n={tarde ? resto.length : d.tareas.length} vacio={tarde ? 'No queda nada más pendiente.' : 'No tenés tareas para hoy.'}>
            {(tarde ? resto : d.tareas).map((t) => (
              <FilaTarea key={t.id} t={t} />
            ))}
          </Seccion>
        </div>

        <div className="col">
          <Seccion titulo="Entregas y retiros de hoy" n={d.entregas.length} vacio="Hoy no hay entregas.">
            {d.entregas.map((e) => (
              <li key={e.id}>
                <Link href={`/pedidos/${e.id}`} className="reporte-fila">
                  <span className="visita-hora num">{e.hora ?? '—'}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="item-titulo">
                      #{e.numero} {e.cliente}
                    </span>
                    <span className="small quiet" style={{ display: 'block' }}>
                      {[e.envio === 'retira' ? 'Retira' : 'Entrega', e.localidad, e.mia ? 'tuya' : null, e.etapa === 'entregado' ? 'entregada ✓' : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </Seccion>
          <Seccion titulo="Visitas al showroom" n={d.visitas.length} vacio="Hoy no hay visitas.">
            {d.visitas.map((v) => (
              <li key={v.id}>
                <Link href={`/showroom#visita-${v.id}`} className="reporte-fila">
                  <span className="visita-hora num">{v.hora ?? '—'}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="item-titulo">{v.nombre}</span>
                    <span className="small quiet" style={{ display: 'block' }}>
                      {[v.motivo, v.atiende ? `atiende ${v.mia ? 'vos' : v.atiende}` : 'sin asignar', v.estado === 'vino' ? 'vino ✓' : v.estado === 'no_vino' ? 'no vino' : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </Seccion>
        </div>
      </div>
    </>
  );
}

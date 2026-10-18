import type { Metadata } from 'next';
import { ListaTareas, NuevaTarea } from '@/components/tareas';
import { fechaCorta, relativo } from '@/lib/fechas';
import { plata } from '@/lib/formato';
import { calcularAvances } from '@/lib/objetivos';
import { BarraAvance } from '@/components/avance';
import { miembroActual } from '@/lib/sesion';
import type { Objetivo } from '@/lib/tipos';
import { AccionesObjetivo, NuevoObjetivo } from './partes';

export const metadata: Metadata = { title: 'Objetivos' };

export default async function ObjetivosPage() {
  const { miembro, supabase } = await miembroActual();
  const [{ data: obs }, { data: eq }] = await Promise.all([
    supabase.from('objetivos').select('*').eq('estado', 'activo').order('tipo').order('fecha_limite', { nullsFirst: false }),
    supabase.from('equipo').select('id, nombre').eq('activo', true).order('nombre'),
  ]);
  const equipo = (eq ?? []) as { id: string; nombre: string }[];
  const avances = await calcularAvances(supabase, (obs ?? []) as Objetivo[]);
  const nombre = (id: string | null) => (id ? (equipo.find((m) => m.id === id)?.nombre ?? '—') : 'Todo el equipo');
  const numericos = avances.filter((a) => a.objetivo.tipo === 'numerico');
  const proyectos = avances.filter((a) => a.objetivo.tipo === 'proyecto');

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Objetivos</h1>
          <p className="sub">Las metas de ventas se calculan solas con los pedidos cargados. Los proyectos avanzan con sus tareas.</p>
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <NuevoObjetivo equipo={equipo} />
      </div>

      {avances.length === 0 && (
        <div className="card vacio">
          Todavía no hay objetivos. Por ejemplo: “20 ventas por semana” para Tete, o “IA en WhatsApp para el 1/11”.
        </div>
      )}

      {numericos.length > 0 && (
        <>
          <h2 style={{ margin: '16px 0 8px' }}>Metas de ventas</h2>
          <div className="objetivos-grid">
            {numericos.map((a) => (
              <section key={a.objetivo.id} className="card card-pad">
                <div className="quiet small">
                  {nombre(a.objetivo.responsable_id)} · {a.objetivo.periodo === 'mes' ? 'este mes' : 'esta semana'}
                </div>
                <h3 style={{ fontSize: 16, margin: '2px 0 8px' }}>{a.objetivo.titulo}</h3>
                <div className="saldo-grande num">
                  {a.objetivo.metrica === 'facturacion' ? plata(a.actual) : a.actual}
                  <span className="quiet" style={{ fontSize: 15, fontWeight: 500 }}>
                    {' '}
                    / {a.objetivo.metrica === 'facturacion' ? plata(a.meta) : a.meta}
                  </span>
                </div>
                <BarraAvance a={a} />
                <p className="faint xs" style={{ marginTop: 6 }}>
                  Del {fechaCorta(a.desde)} al {fechaCorta(a.hasta)}
                  {a.diasRestantes !== null && a.diasRestantes >= 0 && ` · quedan ${a.diasRestantes + 1} días`}
                </p>
                <div style={{ marginTop: 8 }}>
                  <AccionesObjetivo id={a.objetivo.id} />
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {proyectos.length > 0 && (
        <>
          <h2 style={{ margin: '20px 0 8px' }}>Proyectos</h2>
          {proyectos.map((a) => (
            <section key={a.objetivo.id} className="card" style={{ marginBottom: 12 }}>
              <div className="seccion">
                <div className="acciones" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div className="quiet small">{nombre(a.objetivo.responsable_id)}</div>
                    <h3 style={{ fontSize: 16, marginTop: 2 }}>{a.objetivo.titulo}</h3>
                    {a.objetivo.descripcion && <p className="quiet small" style={{ marginTop: 4 }}>{a.objetivo.descripcion}</p>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="small" style={{ fontWeight: 600, color: a.diasRestantes !== null && a.diasRestantes < 0 ? 'var(--danger)' : undefined }}>
                      Para el {fechaCorta(a.objetivo.fecha_limite)}
                    </div>
                    {a.diasRestantes !== null && <div className="faint xs">{relativo(a.diasRestantes)}</div>}
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <BarraAvance a={a} />
                  <p className="faint xs" style={{ marginTop: 4 }}>
                    {a.tareasTotal === 0 ? 'Sin tareas todavía' : `${a.tareasHechas} de ${a.tareasTotal} tareas hechas`}
                  </p>
                </div>
              </div>
              <div className="seccion">
                <ListaTareas tareas={a.tareas} equipo={equipo} contexto={false} agrupar={false} />
                <div style={{ marginTop: 10 }}>
                  <NuevaTarea
                    equipo={equipo}
                    yo={a.objetivo.responsable_id ?? miembro.id}
                    objetivoId={a.objetivo.id}
                    placeholder="Agregar un paso a este proyecto…"
                  />
                </div>
              </div>
              <div className="seccion">
                <AccionesObjetivo id={a.objetivo.id} />
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}

import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { fechaCorta, hoyAR, sumarDiasCorridos } from '@/lib/fechas';
import { miembroActual } from '@/lib/sesion';
import type { Visita } from '@/lib/tipos';
import { FilaVisita, LinkTurnos, NuevaVisita } from './partes';

export const metadata: Metadata = { title: 'Showroom' };

export default async function ShowroomPage() {
  const { miembro, supabase } = await miembroActual();
  const hoy = hoyAR();
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'spazio-gestion.vercel.app';
  const urlTurnos = `${host.startsWith('localhost') ? 'http' : 'https'}://${host}/turnos`;
  const [{ data: eq }, { data }, { data: activoParam }] = await Promise.all([
    supabase.from('equipo').select('id, nombre').eq('activo', true).order('nombre'),
    supabase
      .from('visitas')
      .select('*')
      .gte('fecha', sumarDiasCorridos(hoy, -14))
      .order('fecha')
      .order('hora', { nullsFirst: true }),
    supabase.from('parametros').select('valor').eq('clave', 'turnos_activo').maybeSingle(),
  ]);
  const equipo = (eq ?? []) as { id: string; nombre: string }[];
  const visitas = (data ?? []) as Visita[];

  const deHoy = visitas.filter((v) => v.fecha === hoy);
  const proximas = visitas.filter((v) => v.fecha > hoy && v.estado !== 'cancelada');
  // Pasadas que quedaron sin cerrar: agendadas/confirmadas que no se marcaron, o que vinieron sin resultado.
  const sinCerrar = visitas.filter(
    (v) => v.fecha < hoy && (v.estado === 'agendada' || v.estado === 'confirmada' || (v.estado === 'vino' && !v.resultado)),
  );
  const recientes = visitas
    .filter((v) => v.fecha < hoy && !sinCerrar.includes(v))
    .reverse();

  const porDia = new Map<string, Visita[]>();
  for (const v of proximas) porDia.set(v.fecha, [...(porDia.get(v.fecha) ?? []), v]);

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Showroom</h1>
          <p className="sub">
            {deHoy.length === 0 ? 'Hoy no hay visitas' : `${deHoy.length} ${deHoy.length === 1 ? 'visita' : 'visitas'} hoy`}
            {proximas.length > 0 && ` · ${proximas.length} próximas`}
          </p>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <NuevaVisita equipo={equipo} yo={miembro.id} />
      </div>

      <div className="grid-ficha">
        <div className="col">
          <section className="card">
            <div className="card-titulo">
              <h2>Hoy · {fechaCorta(hoy)}</h2>
            </div>
            <div className="seccion">
              {deHoy.length === 0 ? (
                <p className="quiet small">Sin visitas agendadas. Si llega alguien, tocá “Llegó alguien sin turno”.</p>
              ) : (
                deHoy.map((v) => <FilaVisita key={v.id} v={v} equipo={equipo} />)
              )}
            </div>
          </section>

          {sinCerrar.length > 0 && (
            <section className="card" style={{ borderColor: 'var(--warn)' }}>
              <div className="card-titulo">
                <h2>Pendientes de cerrar</h2>
                <span className="quiet small">{sinCerrar.length}</span>
              </div>
              <div className="seccion">
                <p className="quiet small">Visitas pasadas sin marcar si vinieron o sin resultado.</p>
                {sinCerrar.map((v) => (
                  <FilaVisita key={v.id} v={v} equipo={equipo} mostrarFecha />
                ))}
              </div>
            </section>
          )}

          {recientes.length > 0 && (
            <section className="card">
              <div className="card-titulo">
                <h2>Últimas 2 semanas</h2>
              </div>
              <div className="seccion">
                {recientes.map((v) => (
                  <FilaVisita key={v.id} v={v} equipo={equipo} mostrarFecha />
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="col">
          <section className="card">
            <div className="card-titulo">
              <h2>Turnos online</h2>
            </div>
            <div className="seccion">
              <LinkTurnos url={urlTurnos} activo={activoParam?.valor !== 'no'} />
            </div>
          </section>
          <section className="card">
            <div className="card-titulo">
              <h2>Próximas</h2>
            </div>
            <div className="seccion">
              {porDia.size === 0 && <p className="quiet small">No hay visitas agendadas.</p>}
              {[...porDia.entries()].map(([dia, vs]) => (
                <div key={dia} className="grupo-tareas">
                  <h3>{fechaCorta(dia)}</h3>
                  {vs.map((v) => (
                    <FilaVisita key={v.id} v={v} equipo={equipo} />
                  ))}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

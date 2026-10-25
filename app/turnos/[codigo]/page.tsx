import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Marca } from '@/components/marca';
import { createClient } from '@/lib/supabase/server';
import { fechaLarga, linkCalendario, linkWhatsapp, type ConfigTurnos } from '@/lib/turnos';
import { Cancelar } from './cancelar';

export const metadata: Metadata = { title: { absolute: 'Tu turno · Spazio Design' }, robots: { index: false } };
export const dynamic = 'force-dynamic';

type Turno = { nombre: string; fecha: string; hora: string; estado: string; pasado: boolean };

export default async function TurnoPage({ params, searchParams }: { params: Promise<{ codigo: string }>; searchParams: Promise<{ nuevo?: string }> }) {
  const [{ codigo }, { nuevo }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const [{ data: t }, { data: config }] = await Promise.all([supabase.rpc('turno_por_codigo', { p_codigo: codigo }), supabase.rpc('turnos_config')]);
  if (!t) notFound();
  const turno = t as Turno;
  const c = (config ?? {}) as ConfigTurnos;
  const activo = ['agendada', 'confirmada'].includes(turno.estado) && !turno.pasado;
  const wa = linkWhatsapp(c.whatsapp ?? '', `Hola! Tengo turno para el showroom el ${fechaLarga(turno.fecha)} a las ${turno.hora} (${turno.nombre}).`);

  return (
    <main className="turnos">
      <header className="turnos-cabecera">
        <Marca sub="Design" />
      </header>
      <section className="card turnos-card form-bloque">
        {turno.estado === 'cancelada' ? (
          <>
            <h1>Turno cancelado</h1>
            <p className="sub">
              Cancelaste la visita del {fechaLarga(turno.fecha)} a las {turno.hora}.
            </p>
            <a className="btn btn-primario" href="/turnos">
              Reservar otro horario
            </a>
          </>
        ) : (
          <>
            <h1>{nuevo ? <>¡Listo, {turno.nombre.split(' ')[0]}!</> : 'Tu turno'}</h1>
            <div className="turnos-resumen">
              <span className="turnos-resumen-fecha">{fechaLarga(turno.fecha)}</span>
              <span className="turnos-resumen-hora">{turno.hora} h</span>
              {c.direccion && <span className="quiet">{c.direccion}</span>}
            </div>
            {nuevo && <p className="sub">Te esperamos en el showroom. Guardá este link: desde acá podés cambiar o cancelar el turno.</p>}
            {activo && (
              <div className="acciones turnos-acciones">
                <a className="btn" href={linkCalendario(turno.fecha, turno.hora, c.duracion || 30, c.direccion ?? '')} target="_blank" rel="noopener noreferrer">
                  Agregar a mi calendario
                </a>
                {c.direccion && (
                  <a className="btn" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.direccion)}`} target="_blank" rel="noopener noreferrer">
                    Cómo llegar
                  </a>
                )}
                {wa && (
                  <a className="btn" href={wa} target="_blank" rel="noopener noreferrer">
                    Escribinos por WhatsApp
                  </a>
                )}
              </div>
            )}
            {activo && (
              <div className="acciones turnos-acciones">
                <a className="btn btn-fantasma btn-chico" href={`/turnos?cambiar=${codigo}`}>
                  Cambiar el horario
                </a>
                <Cancelar codigo={codigo} />
              </div>
            )}
            {turno.pasado && turno.estado !== 'cancelada' && <p className="quiet small">Este turno ya pasó.</p>}
          </>
        )}
      </section>
    </main>
  );
}

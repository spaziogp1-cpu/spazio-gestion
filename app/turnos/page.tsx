import type { Metadata } from 'next';
import { Marca } from '@/components/marca';
import { createClient } from '@/lib/supabase/server';
import { porDia, type ConfigTurnos, type Horario } from '@/lib/turnos';
import { Reservar } from './reservar';

export const metadata: Metadata = {
  title: { absolute: 'Reservá tu visita · Spazio Design' },
  description: 'Elegí el día y el horario para visitar el showroom de Spazio Design.',
  robots: { index: false },
};
export const dynamic = 'force-dynamic';

export default async function TurnosPage({ searchParams }: { searchParams: Promise<{ cambiar?: string }> }) {
  const { cambiar } = await searchParams;
  const supabase = await createClient();
  const [{ data: config }, { data: horarios, error }, previo] = await Promise.all([
    supabase.rpc('turnos_config'),
    supabase.rpc('turnos_disponibles'),
    cambiar ? supabase.rpc('turno_por_codigo', { p_codigo: cambiar }) : Promise.resolve({ data: null }),
  ]);
  const c = (config ?? { activo: false, duracion: 30, direccion: '', whatsapp: '' }) as ConfigTurnos;
  const dias = porDia((horarios ?? []) as Horario[]);
  const anterior = previo.data as { nombre: string; telefono: string; email: string | null; estado: string } | null;

  return (
    <main className="turnos">
      <header className="turnos-cabecera">
        <Marca sub="Design" />
      </header>
      <section className="card turnos-card">
        <h1>
          Visitá nuestro <em>showroom</em>
        </h1>
        <p className="sub">
          Elegí el día y el horario que te quede cómodo. {c.duracion ? `La visita dura unos ${c.duracion} minutos.` : ''}
          {c.direccion && (
            <>
              <br />
              <span className="quiet">{c.direccion}</span>
            </>
          )}
        </p>
        {anterior && anterior.estado !== 'cancelada' && (
          <p className="aviso">Estás cambiando tu turno: elegí el nuevo horario y el anterior se cancela solo.</p>
        )}
        {!c.activo || error ? (
          <p className="aviso">Por ahora no estamos tomando turnos online. Escribinos y coordinamos tu visita.</p>
        ) : dias.length === 0 ? (
          <p className="aviso">No quedan horarios libres en los próximos días. Escribinos y coordinamos tu visita.</p>
        ) : (
          <Reservar dias={dias} reemplaza={anterior && anterior.estado !== 'cancelada' ? cambiar! : undefined} previo={anterior ?? undefined} />
        )}
      </section>
    </main>
  );
}

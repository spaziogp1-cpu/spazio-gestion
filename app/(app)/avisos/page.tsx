import type { Metadata } from 'next';
import Link from 'next/link';
import { fechaHora } from '@/lib/fechas';
import { miembroActual } from '@/lib/sesion';
import { MarcarAlVer, MarcarTodo } from './marcar';

export const metadata: Metadata = { title: 'Avisos' };

type Aviso = { id: string; tipo: string; titulo: string; cuerpo: string | null; link: string | null; creada_en: string; leida_en: string | null };

export default async function AvisosPage() {
  const { supabase } = await miembroActual();
  const { data } = await supabase.from('notificaciones').select('*').order('creada_en', { ascending: false }).limit(100);
  const avisos = (data ?? []) as Aviso[];
  const sinLeer = avisos.filter((a) => !a.leida_en);

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Avisos</h1>
          <p className="sub">{sinLeer.length ? `${sinLeer.length} sin leer` : 'Estás al día'}</p>
        </div>
        {sinLeer.length > 0 && <MarcarTodo />}
      </div>
      {sinLeer.length > 0 && <MarcarAlVer />}
      <section className="card">
        {avisos.length === 0 ? (
          <div className="vacio">Todavía no hay avisos. Llegan cuando te asignan una tarea, cuando un pedido se atrasa o está por vencer, y con el resumen de cada mañana.</div>
        ) : (
          <ul className="lista">
            {avisos.map((a) => (
              <li key={a.id}>
                <Link href={a.link ?? '/'} className={`aviso-fila${a.leida_en ? '' : ' aviso-nuevo'}`}>
                  <span className="aviso-punto" aria-hidden />
                  <span style={{ minWidth: 0 }}>
                    <span className="aviso-titulo">{a.titulo}</span>
                    {a.cuerpo && <span className="aviso-cuerpo">{a.cuerpo}</span>}
                    <span className="aviso-cuando">{fechaHora(a.creada_en)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

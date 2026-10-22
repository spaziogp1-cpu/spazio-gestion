import type { Metadata } from 'next';
import Link from 'next/link';
import { ListaTareas, NuevaTarea } from '@/components/tareas';
import { miembroActual } from '@/lib/sesion';
import type { Tarea } from '@/lib/tipos';

export const metadata: Metadata = { title: 'Tareas' };

export default async function TareasPage({ searchParams }: { searchParams: Promise<{ de?: string; ver?: string }> }) {
  const { de, ver } = await searchParams;
  const { miembro, supabase } = await miembroActual();
  const { data: eq } = await supabase.from('equipo').select('id, nombre').eq('activo', true).order('nombre');
  const equipo = (eq ?? []) as { id: string; nombre: string }[];

  // "de": id de la persona, "todos" o vacío (= yo)
  const persona = de === 'todos' ? null : (de ?? miembro.id);
  const hechas = ver === 'hechas';

  let consulta = supabase.from('tareas_resumen').select('*');
  // Las tareas de todo el equipo (sin responsable) aparecen en la lista de cada uno.
  if (persona) consulta = consulta.or(`responsable_id.eq.${persona},responsable_id.is.null`);
  consulta = hechas
    ? consulta.eq('estado', 'hecha').order('completada_en', { ascending: false }).limit(60)
    : consulta.neq('estado', 'hecha').order('vencimiento', { ascending: true, nullsFirst: false }).order('creado_en').limit(400);
  const { data } = await consulta;
  const tareas = (data ?? []) as Tarea[];
  // Dentro de cada grupo, las de prioridad alta primero.
  const peso = { alta: 0, media: 1, baja: 2 } as const;
  tareas.sort((a, b) => (a.vencimiento ?? '9999').localeCompare(b.vencimiento ?? '9999') || (a.hora ?? '99').localeCompare(b.hora ?? '99') || peso[a.prioridad] - peso[b.prioridad]);

  const vencidas = tareas.filter((t) => t.vencida).length;
  const link = (cambios: { de?: string | null; ver?: string | null }) => {
    const q = new URLSearchParams();
    const d = cambios.de === undefined ? de : cambios.de;
    const v = cambios.ver === undefined ? ver : cambios.ver;
    if (d) q.set('de', d);
    if (v) q.set('ver', v);
    const s = q.toString();
    return s ? `/tareas?${s}` : '/tareas';
  };
  const nombre = persona ? (equipo.find((m) => m.id === persona)?.nombre ?? '') : 'todo el equipo';

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Tareas</h1>
          <p className="sub">
            {hechas ? `Hechas de ${persona === miembro.id ? 'vos' : nombre}` : `${tareas.length} pendientes de ${persona === miembro.id ? 'vos' : nombre}`}
            {!hechas && vencidas > 0 && <span style={{ color: 'var(--danger)', fontWeight: 600 }}> · {vencidas} vencidas</span>}
          </p>
        </div>
      </div>

      <div className="filtros">
        <Link href={link({ de: null })} className="filtro" aria-current={!de || de === miembro.id ? 'true' : undefined}>
          Mías
        </Link>
        {equipo
          .filter((m) => m.id !== miembro.id)
          .map((m) => (
            <Link key={m.id} href={link({ de: m.id })} className="filtro" aria-current={de === m.id ? 'true' : undefined}>
              {m.nombre}
            </Link>
          ))}
        <Link href={link({ de: 'todos' })} className="filtro" aria-current={de === 'todos' ? 'true' : undefined}>
          Todo el equipo
        </Link>
        <span style={{ width: 8, flexShrink: 0 }} />
        <Link href={link({ ver: hechas ? null : 'hechas' })} className="filtro" aria-current={hechas ? 'true' : undefined}>
          Hechas
        </Link>
      </div>

      <section className="card card-pad" style={{ marginBottom: 12 }}>
        <NuevaTarea equipo={equipo} yo={persona ?? miembro.id} />
      </section>

      <section className="card card-pad">
        <ListaTareas tareas={tareas} equipo={equipo} agrupar={!hechas} />
      </section>
    </>
  );
}

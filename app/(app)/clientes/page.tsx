import type { Metadata } from 'next';
import Link from 'next/link';
import { miembroActual } from '@/lib/sesion';
import type { Cliente } from '@/lib/tipos';

export const metadata: Metadata = { title: 'Clientes' };

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const busqueda = (q ?? '').trim();
  const { supabase } = await miembroActual();

  let consulta = supabase.from('clientes').select('*').order('creado_en', { ascending: false }).limit(100);
  if (busqueda) {
    const seguro = busqueda.replace(/[%,()]/g, ' ');
    consulta = consulta.or(`nombre.ilike.%${seguro}%,telefono.ilike.%${seguro}%,email.ilike.%${seguro}%,localidad.ilike.%${seguro}%`);
  }
  const { data } = await consulta;
  const clientes = (data ?? []) as Cliente[];

  return (
    <>
      <div className="cabecera">
        <h1>Clientes</h1>
      </div>
      <form className="buscador" role="search">
        <input type="search" name="q" placeholder="Buscar por nombre, teléfono, email o localidad" defaultValue={busqueda} aria-label="Buscar" />
      </form>
      <div className="card">
        {clientes.length === 0 ? (
          <div className="vacio">{busqueda ? 'No hay clientes que coincidan.' : 'Los clientes se crean al cargar un pedido.'}</div>
        ) : (
          <ul className="lista">
            {clientes.map((c) => (
              <li key={c.id}>
                <Link href={`/clientes/${c.id}`} className="pedido-fila">
                  <div className="arriba">
                    <span className="cliente">{c.nombre}</span>
                  </div>
                  <div className="productos">{[c.telefono, c.localidad].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

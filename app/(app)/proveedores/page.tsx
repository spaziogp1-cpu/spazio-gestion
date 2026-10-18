import type { Metadata } from 'next';
import Link from 'next/link';
import { miembroActual } from '@/lib/sesion';
import type { PedidoProveedor } from '@/lib/tipos';
import { FilaProveedor } from '../pedidos/[id]/proveedores-pedido';

export const metadata: Metadata = { title: 'Proveedores' };

export default async function ProveedoresPage({ searchParams }: { searchParams: Promise<{ ver?: string; p?: string }> }) {
  const { ver, p: filtroProv } = await searchParams;
  const recibidos = ver === 'recibidos';
  const { supabase } = await miembroActual();

  const [{ data: provs }, { data }] = await Promise.all([
    supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre', { ascending: false }),
    (() => {
      let c = supabase.from('proveedor_pendientes').select('*');
      c = recibidos
        ? c.eq('estado', 'recibido').order('fecha_recepcion', { ascending: false }).limit(50)
        : c.eq('estado', 'pedido').order('fecha_esperada', { ascending: true, nullsFirst: false }).limit(300);
      if (filtroProv) c = c.eq('proveedor_id', filtroProv);
      return c;
    })(),
  ]);
  const lista = (data ?? []) as PedidoProveedor[];
  const proveedores = (provs ?? []) as { id: string; nombre: string }[];
  const demorados = lista.filter((x) => x.demorado).length;

  const href = (cambios: { ver?: string | null; p?: string | null }) => {
    const params = new URLSearchParams();
    const v = cambios.ver === undefined ? ver : cambios.ver;
    const pr = cambios.p === undefined ? filtroProv : cambios.p;
    if (v) params.set('ver', v);
    if (pr) params.set('p', pr);
    const qs = params.toString();
    return qs ? `/proveedores?${qs}` : '/proveedores';
  };

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Proveedores</h1>
          <p className="sub">
            {recibidos ? 'Lo último que llegó' : `${lista.length} pedidos esperando`}
            {!recibidos && demorados > 0 && <span style={{ color: 'var(--danger)', fontWeight: 600 }}> · {demorados} demorados</span>}
          </p>
        </div>
      </div>

      <div className="filtros">
        <Link href={href({ ver: null })} className="filtro" aria-current={!recibidos ? 'true' : undefined}>
          Esperando
        </Link>
        <Link href={href({ ver: 'recibidos' })} className="filtro" aria-current={recibidos ? 'true' : undefined}>
          Recibidos
        </Link>
        <span style={{ width: 8, flexShrink: 0 }} />
        <Link href={href({ p: null })} className="filtro" aria-current={!filtroProv ? 'true' : undefined}>
          Todos
        </Link>
        {proveedores.map((pr) => (
          <Link key={pr.id} href={href({ p: pr.id })} className="filtro" aria-current={filtroProv === pr.id ? 'true' : undefined}>
            {pr.nombre}
          </Link>
        ))}
      </div>

      <div className="card">
        <div className="seccion">
          {lista.length === 0 ? (
            <div className="vacio">
              {recibidos ? 'Todavía no se marcó nada como recibido.' : 'No hay nada pendiente de los proveedores.'}
              <div className="small faint" style={{ marginTop: 6 }}>
                Los pedidos a proveedores se registran desde la ficha de cada pedido.
              </div>
            </div>
          ) : (
            lista.map((pp) => <FilaProveedor key={pp.id} pp={pp} conPedido />)
          )}
        </div>
      </div>
    </>
  );
}

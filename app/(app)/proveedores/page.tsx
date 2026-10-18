import type { Metadata } from 'next';
import Link from 'next/link';
import { leerReglaPlazo } from '@/lib/parametros';
import { miembroActual } from '@/lib/sesion';
import type { PedidoProveedor, Proveedor } from '@/lib/tipos';
import { FilaProveedor } from '../pedidos/[id]/proveedores-pedido';
import NuevoStock from './nuevo-stock';

export const metadata: Metadata = { title: 'Proveedores' };

type Params = { ver?: string; p?: string; tipo?: string };

export default async function ProveedoresPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const recibidos = params.ver === 'recibidos';
  const tipo = params.tipo === 'stock' || params.tipo === 'clientes' ? params.tipo : null;
  const { supabase } = await miembroActual();

  let consulta = supabase.from('proveedor_pendientes').select('*');
  consulta = recibidos
    ? consulta.eq('estado', 'recibido').order('fecha_recepcion', { ascending: false }).limit(50)
    : consulta.eq('estado', 'pedido').order('fecha_esperada', { ascending: true, nullsFirst: false }).limit(300);
  if (params.p) consulta = consulta.eq('proveedor_id', params.p);
  if (tipo === 'stock') consulta = consulta.is('pedido_id', null);
  if (tipo === 'clientes') consulta = consulta.not('pedido_id', 'is', null);

  const [{ data: provs }, { data }, plazo] = await Promise.all([
    supabase.from('proveedores').select('id, nombre, plazo_dias').eq('activo', true).order('nombre'),
    consulta,
    leerReglaPlazo(supabase),
  ]);
  const lista = (data ?? []) as PedidoProveedor[];
  // Vidpro y STG primero, después el resto por nombre.
  const proveedores = ((provs ?? []) as Proveedor[]).sort((a, b) => {
    const orden = (n: string) => (n === 'Vidpro' ? 0 : n === 'STG' ? 1 : 2);
    return orden(a.nombre) - orden(b.nombre) || a.nombre.localeCompare(b.nombre);
  });
  const demorados = lista.filter((x) => x.demorado).length;

  const href = (cambios: Partial<Record<keyof Params, string | null>>) => {
    const q = new URLSearchParams();
    const final = { ...params, ...cambios };
    (Object.keys(final) as (keyof Params)[]).forEach((k) => {
      const v = final[k];
      if (v) q.set(k, v);
    });
    const s = q.toString();
    return s ? `/proveedores?${s}` : '/proveedores';
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

      <NuevoStock proveedores={proveedores} feriados={plazo.feriados} />

      <div className="filtros">
        <Link href={href({ ver: null })} className="filtro" aria-current={!recibidos ? 'true' : undefined}>
          Esperando
        </Link>
        <Link href={href({ ver: 'recibidos' })} className="filtro" aria-current={recibidos ? 'true' : undefined}>
          Recibidos
        </Link>
        <span style={{ width: 8, flexShrink: 0 }} />
        <Link href={href({ tipo: null })} className="filtro" aria-current={!tipo ? 'true' : undefined}>
          Todo
        </Link>
        <Link href={href({ tipo: 'clientes' })} className="filtro" aria-current={tipo === 'clientes' ? 'true' : undefined}>
          Para clientes
        </Link>
        <Link href={href({ tipo: 'stock' })} className="filtro" aria-current={tipo === 'stock' ? 'true' : undefined}>
          Stock
        </Link>
      </div>
      <div className="filtros">
        <Link href={href({ p: null })} className="filtro" aria-current={!params.p ? 'true' : undefined}>
          Todos los proveedores
        </Link>
        {proveedores.map((pr) => (
          <Link key={pr.id} href={href({ p: pr.id })} className="filtro" aria-current={params.p === pr.id ? 'true' : undefined}>
            {pr.nombre}
          </Link>
        ))}
      </div>

      <div className="card">
        <div className="seccion">
          {lista.length === 0 ? (
            <div className="vacio">
              {recibidos ? 'Todavía no se marcó nada como recibido.' : 'No hay nada pendiente con estos filtros.'}
              <div className="small faint" style={{ marginTop: 6 }}>
                Los pedidos para clientes se registran desde la ficha de cada pedido; los de stock, con el botón de arriba.
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

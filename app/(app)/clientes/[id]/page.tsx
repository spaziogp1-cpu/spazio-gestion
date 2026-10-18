import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { IconoVolver, IconoWhatsApp } from '@/components/iconos';
import { PedidoFila } from '@/components/pedido-fila';
import { linkWhatsApp } from '@/lib/formato';
import { miembroActual } from '@/lib/sesion';
import type { Cliente, PedidoResumen } from '@/lib/tipos';
import FormCliente from './form-cliente';

export const metadata: Metadata = { title: 'Cliente' };

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await miembroActual();
  const [{ data: c }, { data: ps }] = await Promise.all([
    supabase.from('clientes').select('*').eq('id', id).maybeSingle(),
    supabase.from('pedidos_resumen').select('*').eq('cliente_id', id).order('fecha_venta', { ascending: false }),
  ]);
  if (!c) notFound();
  const cliente = c as Cliente;
  const pedidos = (ps ?? []) as PedidoResumen[];
  const wa = linkWhatsApp(cliente.telefono);

  return (
    <>
      <Link href="/clientes" className="volver">
        <IconoVolver /> Clientes
      </Link>
      <div className="cabecera">
        <div>
          <h1>{cliente.nombre}</h1>
          <p className="sub">{[cliente.telefono, cliente.localidad].filter(Boolean).join(' · ')}</p>
        </div>
        {wa && (
          <a href={wa} target="_blank" rel="noreferrer" className="btn">
            <IconoWhatsApp /> WhatsApp
          </a>
        )}
      </div>
      <div className="grid-ficha">
        <div className="col">
          <section className="card">
            <div className="card-titulo">
              <h2>Pedidos</h2>
              <span className="quiet small">{pedidos.length}</span>
            </div>
            {pedidos.length === 0 ? (
              <div className="vacio">Sin pedidos.</div>
            ) : (
              <ul className="lista">
                {pedidos.map((p) => (
                  <PedidoFila key={p.id} p={p} />
                ))}
              </ul>
            )}
          </section>
        </div>
        <div className="col">
          <FormCliente cliente={cliente} />
        </div>
      </div>
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { ChipEtapa } from '@/components/pedido-fila';
import { fechaCorta, hoyAR, relativo, diasEntre } from '@/lib/fechas';
import { miembroActual } from '@/lib/sesion';
import type { Item, PedidoResumen } from '@/lib/tipos';

export const metadata: Metadata = { title: 'Contenido' };

export default async function ContenidoPage({ searchParams }: { searchParams: Promise<{ fotos?: string }> }) {
  const { fotos } = await searchParams;
  const soloFotos = fotos === '1';
  const { supabase } = await miembroActual();
  const hoy = hoyAR();

  const { data: ps } = await supabase
    .from('pedidos_resumen')
    .select('*')
    .in('etapa', ['en_fabricacion', 'lista', 'cliente_avisado', 'envio_coordinado'])
    .order('fecha_limite');
  const pedidos = (ps ?? []) as PedidoResumen[];
  const { data: its } = pedidos.length
    ? await supabase.from('pedido_items').select('*').in('pedido_id', pedidos.map((p) => p.id)).order('orden')
    : { data: [] };
  const items = (its ?? []) as (Item & { pedido_id: string })[];

  // Cuándo está la mesa en el showroom/taller: lista ya, o se espera para la fecha límite.
  const filas = pedidos
    .map((p) => {
      const propios = items.filter((i) => i.pedido_id === p.id && !/silla/i.test(i.producto));
      const cuando = p.etapa === 'en_fabricacion' ? p.fecha_limite : hoy;
      const sale = p.fecha_entrega_programada;
      return { p, items: propios, cuando, sale };
    })
    .filter((f) => f.items.length > 0)
    .filter((f) => !soloFotos || f.items.some((i) => i.apto_fotos))
    .sort((a, b) => a.cuando.localeCompare(b.cuando));

  const disponibles = filas.filter((f) => f.p.etapa !== 'en_fabricacion');
  const proximas = filas.filter((f) => f.p.etapa === 'en_fabricacion' && diasEntre(hoy, f.cuando) <= 21);

  const Tarjeta = ({ f }: { f: (typeof filas)[number] }) => (
    <Link href={`/pedidos/${f.p.id}`} className="card card-pad contenido-tarjeta">
      <div className="acciones" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <ChipEtapa etapa={f.p.etapa} />
        <span className="mono faint small">#{f.p.numero}</span>
      </div>
      {f.items.map((i) => (
        <div key={i.id} style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 650, textTransform: 'capitalize' }}>
            {i.producto} {i.modelo}
            {i.apto_fotos && <span className="chip chip-cliente_avisado" style={{ marginLeft: 6 }}>fotos</span>}
          </div>
          <div className="small quiet">{[i.color, i.material, i.medidas].filter(Boolean).join(' · ')}</div>
        </div>
      ))}
      <div className="xs faint" style={{ marginTop: 8 }}>
        {f.p.etapa === 'en_fabricacion' ? `Lista aprox. ${fechaCorta(f.cuando)} (${relativo(diasEntre(hoy, f.cuando))})` : 'Ya está lista'}
        {f.sale && ` · sale ${fechaCorta(f.sale)}`}
      </div>
    </Link>
  );

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Contenido</h1>
          <p className="sub">Mesas que están o van a estar para fotos y videos, antes de que salgan al cliente.</p>
        </div>
      </div>
      <div className="filtros">
        <Link href="/contenido" className="filtro" aria-current={!soloFotos ? 'true' : undefined}>
          Todas
        </Link>
        <Link href="/contenido?fotos=1" className="filtro" aria-current={soloFotos ? 'true' : undefined}>
          Marcadas para fotos
        </Link>
      </div>
      <p className="faint small" style={{ marginBottom: 12 }}>
        Para marcar una mesa, abrí el pedido, tocá Editar en el producto y tildá “Sirve para fotos y videos”.
      </p>

      <h2 style={{ margin: '8px 0' }}>Listas ahora · {disponibles.length}</h2>
      {disponibles.length === 0 ? (
        <p className="quiet small">Ninguna mesa lista en este momento.</p>
      ) : (
        <div className="objetivos-grid">{disponibles.map((f) => <Tarjeta key={f.p.id} f={f} />)}</div>
      )}

      <h2 style={{ margin: '20px 0 8px' }}>Salen de fábrica en las próximas 3 semanas · {proximas.length}</h2>
      {proximas.length === 0 ? (
        <p className="quiet small">No hay mesas por terminar en las próximas semanas.</p>
      ) : (
        <div className="objetivos-grid">{proximas.map((f) => <Tarjeta key={f.p.id} f={f} />)}</div>
      )}
    </>
  );
}

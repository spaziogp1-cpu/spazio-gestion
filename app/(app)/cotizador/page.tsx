import type { Metadata } from 'next';
import Link from 'next/link';
import { fechaCorta, hoyAR } from '@/lib/fechas';
import { plata } from '@/lib/formato';
import { miembroActual } from '@/lib/sesion';
import { ESTADOS_PRESUPUESTO } from '@/lib/cotizador/estados';

export const metadata: Metadata = { title: 'Presupuestos' };

type Params = { estado?: string; q?: string; mios?: string };
type Fila = {
  id: string;
  numero: number;
  cliente_nombre: string;
  estado: string;
  fecha: string;
  valido_hasta: string;
  total: number;
  necesita_aprobacion: boolean;
  aprobado_por: string | null;
  vendedor_id: string | null;
  pedido_id: string | null;
  equipo: { nombre: string } | null;
  cot_presupuesto_items: { titulo: string; cantidad: number }[];
};

export default async function PresupuestosPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const { miembro, supabase } = await miembroActual();
  const estado = ESTADOS_PRESUPUESTO.some((e) => e.id === params.estado) ? params.estado : null;
  const abiertos = !estado;

  let consulta = supabase
    .from('cot_presupuestos')
    .select(
      'id, numero, cliente_nombre, estado, fecha, valido_hasta, total, necesita_aprobacion, aprobado_por, vendedor_id, pedido_id, equipo:vendedor_id(nombre), cot_presupuesto_items(titulo, cantidad)',
    )
    .order('numero', { ascending: false })
    .limit(200);
  consulta = estado ? consulta.eq('estado', estado) : consulta.in('estado', ['borrador', 'enviado', 'seguimiento']);
  if (params.mios) consulta = consulta.eq('vendedor_id', miembro.id);
  const q = params.q?.trim();
  if (q) {
    const n = Number(q.replace(/\D/g, ''));
    const seguro = q.replace(/[%,()]/g, ' ');
    consulta = n && /^\D*\d+\D*$/.test(q) ? consulta.eq('numero', n) : consulta.ilike('cliente_nombre', `%${seguro}%`);
  }
  const { data } = await consulta;
  const lista = (data ?? []) as unknown as Fila[];
  const hoy = hoyAR();

  const href = (cambios: Partial<Params>) => {
    const u = new URLSearchParams();
    const f = { ...params, ...cambios };
    for (const [k, v] of Object.entries(f)) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `/cotizador?${s}` : '/cotizador';
  };

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Presupuestos</h1>
          <p className="sub">{abiertos ? `${lista.length} abiertos (borrador, enviados y en seguimiento)` : `${lista.length} en "${ESTADOS_PRESUPUESTO.find((e) => e.id === estado)?.nombre}"`}</p>
        </div>
        <Link href="/cotizador/nuevo" className="btn btn-primario">
          + Nuevo presupuesto
        </Link>
      </div>

      <form className="buscador" role="search">
        <input type="search" name="q" defaultValue={params.q ?? ''} placeholder="Cliente o número" aria-label="Buscar presupuesto" />
        {estado && <input type="hidden" name="estado" value={estado} />}
        {params.mios && <input type="hidden" name="mios" value="1" />}
      </form>

      <div className="filtros">
        <Link href={href({ estado: undefined })} className="filtro" aria-current={abiertos ? 'true' : undefined}>
          Abiertos
        </Link>
        {ESTADOS_PRESUPUESTO.map((e) => (
          <Link key={e.id} href={href({ estado: e.id })} className="filtro" aria-current={estado === e.id ? 'true' : undefined}>
            {e.nombre}
          </Link>
        ))}
        <span style={{ width: 8, flexShrink: 0 }} />
        <Link href={href({ mios: params.mios ? undefined : '1' })} className="filtro" aria-current={params.mios ? 'true' : undefined}>
          Míos
        </Link>
      </div>

      <section className="card">
        {lista.length === 0 ? (
          <p className="vacio">No hay presupuestos acá.</p>
        ) : (
          <ul className="lista">
            {lista.map((p) => {
              const est = ESTADOS_PRESUPUESTO.find((e) => e.id === p.estado);
              const porVencer = ['enviado', 'seguimiento'].includes(p.estado) && p.valido_hasta <= hoy;
              const productos = p.cot_presupuesto_items.map((i) => `${i.cantidad > 1 ? `${i.cantidad} × ` : ''}${i.titulo}`).join(' · ');
              return (
                <li key={p.id}>
                  <Link href={`/cotizador/${p.id}`} className="producto-fila">
                    <span className="mono small quiet" style={{ width: 44 }}>
                      {p.numero}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 600, display: 'block' }}>{p.cliente_nombre}</span>
                      <span className="small quiet" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {productos || 'Sin productos'} · {fechaCorta(p.fecha)}
                        {p.equipo?.nombre ? ` · ${p.equipo.nombre}` : ''}
                      </span>
                    </span>
                    <span style={{ textAlign: 'right' }}>
                      <span className="num" style={{ fontWeight: 600, display: 'block' }}>
                        {plata(p.total)}
                      </span>
                      <span className={`chip ${est?.clase ?? ''}`}>{p.necesita_aprobacion && !p.aprobado_por ? 'Falta aprobar' : porVencer ? 'Vence hoy' : est?.nombre}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ESTADOS_PRESUPUESTO } from '@/lib/cotizador/estados';
import { textoWhatsApp } from '@/lib/cotizador/whatsapp';
import { fechaCorta, fechaHora, hoyAR } from '@/lib/fechas';
import { linkWhatsApp, plata } from '@/lib/formato';
import { miembroActual } from '@/lib/sesion';
import { AccionesPresupuesto, Notas } from './partes';

export const metadata: Metadata = { title: 'Presupuesto' };

type Item = {
  id: string;
  orden: number;
  titulo: string;
  detalle: string | null;
  cantidad: number;
  precio_unitario: number;
  precio_unitario_cuotas: number;
  total: number;
  estimado: boolean;
  cot_productos: { foto_url: string | null } | null;
};
type Calculo = {
  item_id: string;
  costo_unitario: number;
  margen: number;
  resultado: {
    lineas?: {
      nombre: string;
      costo: number;
      estimado?: string;
      minimoAplicado?: string;
      medida: number;
      unidad: string;
      precioUnitario: number;
      regla?: string;
      cantidad?: number;
      ancho?: number;
      largo?: number;
      original?: { cantidad: number; ancho?: number; largo?: number };
    }[];
  };
  creado_en: string;
};

export default async function PresupuestoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { miembro, supabase } = await miembroActual();
  const verCostos = miembro.rol === 'admin' || (await supabase.rpc('puede', { p_permiso: 'cotizador.costos' })).data === true;

  const [{ data: p }, { data: its }, { data: calcs }] = await Promise.all([
    supabase
      .from('cot_presupuestos')
      .select('*, vendedor:vendedor_id(nombre), aprobador:aprobado_por(nombre)')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('cot_presupuesto_items').select('*, cot_productos(foto_url)').eq('presupuesto_id', id).order('orden'),
    verCostos ? supabase.from('cot_presupuesto_calculos').select('item_id, costo_unitario, margen, resultado, creado_en').eq('presupuesto_id', id) : Promise.resolve({ data: [] }),
  ]);
  if (!p) notFound();
  const items = (its ?? []) as Item[];
  const calculos = new Map(((calcs ?? []) as Calculo[]).map((c) => [c.item_id, c]));
  const est = ESTADOS_PRESUPUESTO.find((e) => e.id === p.estado);
  const vencido = ['enviado', 'seguimiento', 'borrador'].includes(p.estado) && p.valido_hasta < hoyAR();
  const costoTotal = items.reduce((s, i) => s + Number(calculos.get(i.id)?.costo_unitario ?? 0) * i.cantidad, 0);
  const total = Number(p.total);

  const texto = textoWhatsApp({
    numero: p.numero,
    cliente: p.cliente_nombre,
    items: items.map((i) => ({ titulo: i.titulo, detalle: i.detalle, cantidad: i.cantidad, total: Number(i.total) })),
    subtotal: Number(p.subtotal),
    descuentoPct: Number(p.descuento_pct),
    total,
    totalCuotas: Number(p.total_cuotas),
    validoHasta: p.valido_hasta,
  });
  const wa = linkWhatsApp(p.cliente_telefono);

  return (
    <>
      <div className="cabecera">
        <div>
          <Link href="/cotizador" className="volver">
            ← Presupuestos
          </Link>
          <h1>
            Presupuesto {p.numero} <span className={`chip ${est?.clase ?? ''}`} style={{ verticalAlign: 'middle' }}>{est?.nombre}</span>
          </h1>
          <p className="sub">
            {p.cliente_nombre}
            {p.cliente_telefono ? ` · ${p.cliente_telefono}` : ''} · {fechaCorta(p.fecha)}
            {p.vendedor?.nombre ? ` · ${p.vendedor.nombre}` : ''}
          </p>
        </div>
      </div>

      <div className="grid-ficha">
        <div className="col">
          <section className="card">
            <div className="card-titulo">
              <h2>Productos</h2>
            </div>
            <ul className="lista">
              {items.map((i) => {
                const c = calculos.get(i.id);
                return (
                  <li key={i.id} className="seccion">
                    <div className="acciones" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                      {i.cot_productos?.foto_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={i.cot_productos.foto_url} alt="" className="presu-miniatura" />
                      )}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="item-titulo">
                          {i.cantidad > 1 ? `${i.cantidad} × ` : ''}
                          {i.titulo}
                        </div>
                        <div className="item-detalle">{i.detalle}</div>
                        {i.cantidad > 1 && <div className="small quiet">{plata(i.precio_unitario)} c/u</div>}
                        {i.estimado && (
                          <div className="small" style={{ color: 'var(--warn)' }}>
                            Hay un precio estimado: confirmalo con el proveedor antes de cerrar la venta.
                          </div>
                        )}
                      </div>
                      <div className="num" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {plata(i.total)}
                      </div>
                    </div>
                    {verCostos && c && (
                      <details style={{ marginTop: 8 }}>
                        <summary className="small quiet">
                          Costo {plata(Number(c.costo_unitario) * i.cantidad)} · margen {Math.round(Number(c.margen) * 1000) / 10}% · calculado el {fechaHora(c.creado_en)}
                        </summary>
                        <table className="tabla probador-tabla" style={{ marginTop: 6 }}>
                          <tbody>
                            {(c.resultado.lineas ?? []).map((l, k) => (
                              <tr key={k}>
                                <td>
                                  {l.nombre}
                                  {l.regla === 'm2' && l.ancho != null && (
                                    <span className="quiet">
                                      {' '}
                                      · {l.cantidad} × {Math.round(l.ancho * 10) / 10} × {Math.round((l.largo ?? 0) * 10) / 10} cm
                                    </span>
                                  )}
                                  {l.original && (
                                    <div className="xs" style={{ color: 'var(--accent)' }}>
                                      Cambiada a mano (receta: {l.original.cantidad} × {Math.round((l.original.ancho ?? 0) * 10) / 10} × {Math.round((l.original.largo ?? 0) * 10) / 10})
                                    </div>
                                  )}
                                  {(l.minimoAplicado || l.estimado) && <div className="xs quiet">{[l.minimoAplicado, l.estimado].filter(Boolean).join(' · ')}</div>}
                                </td>
                                <td className="der num">{plata(l.costo)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="seccion probador-totales">
              {Number(p.descuento_pct) > 0 && (
                <>
                  <div>
                    <span>Subtotal</span>
                    <span className="num">{plata(p.subtotal)}</span>
                  </div>
                  <div>
                    <span>Descuento {Math.round(Number(p.descuento_pct) * 1000) / 10}%</span>
                    <span className="num">−{plata(p.descuento_monto)}</span>
                  </div>
                </>
              )}
              <div>
                <span>Total por transferencia</span>
                <strong className="num probador-precio">{plata(total)}</strong>
              </div>
              <div>
                <span>En cuotas</span>
                <strong className="num">{plata(p.total_cuotas)}</strong>
              </div>
              {verCostos && costoTotal > 0 && (
                <div>
                  <span>Costo · ganancia · margen</span>
                  <span className="num">
                    {plata(costoTotal)} · {plata(total - costoTotal)} · {Math.round((1 - costoTotal / total) * 1000) / 10}%
                  </span>
                </div>
              )}
              <div>
                <span>Válido hasta</span>
                <span style={vencido ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>
                  {fechaCorta(p.valido_hasta)}
                  {vencido ? ' (ya venció)' : ''}
                </span>
              </div>
            </div>
          </section>
        </div>

        <div className="col">
          <section className="card">
            <div className="card-titulo">
              <h2>Enviar</h2>
            </div>
            <div className="seccion form-bloque">
              <pre className="presu-whatsapp">{texto}</pre>
              <AccionesPresupuesto
                id={p.id}
                estado={p.estado}
                texto={texto}
                whatsapp={wa}
                necesitaAprobacion={p.necesita_aprobacion && !p.aprobado_por}
                esAdmin={miembro.rol === 'admin'}
                bloqueado={Boolean(p.pedido_id) || p.estado === 'aprobado'}
                pedidoId={p.pedido_id ?? null}
              />
              {p.necesita_aprobacion && p.aprobado_por && <p className="small quiet">Descuento aprobado por {p.aprobador?.nombre ?? 'un administrador'}.</p>}
            </div>
          </section>
          <section className="card">
            <div className="card-titulo">
              <h2>Notas internas</h2>
            </div>
            <div className="seccion">
              <Notas id={p.id} inicial={p.observaciones ?? ''} />
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

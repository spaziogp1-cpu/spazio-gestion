import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { IconoVolver, IconoWhatsApp } from '@/components/iconos';
import { ChipEtapa } from '@/components/pedido-fila';
import { CANALES, ENVIOS, ETAPAS, TIPOS_PAGO, TIPOS_VENTA, nombreDe } from '@/lib/constantes';
import { fechaCorta, fechaHora, fechaLarga, relativo } from '@/lib/fechas';
import { linkWhatsApp, plata } from '@/lib/formato';
import { leerReglaPlazo } from '@/lib/parametros';
import { miembroActual } from '@/lib/sesion';
import type { Archivo, Cliente, Comentario, Evento, Item, Pago, PedidoProveedor, PedidoResumen, Proveedor } from '@/lib/tipos';
import { FilaProveedor, NuevoPedidoProveedor } from './proveedores-pedido';
import { textoEvento } from './historial';
import { BorrarPago, EditarPedido, FormComentario, FormPago, ItemEditable, NuevoItem, SelectorEtapa, SubirArchivos, BorrarArchivo } from './partes';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { supabase } = await miembroActual();
  const { data } = await supabase.from('pedidos_resumen').select('numero, cliente_nombre').eq('id', id).maybeSingle();
  return { title: data ? `#${data.numero} ${data.cliente_nombre}` : 'Pedido' };
}

export default async function FichaPedido({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nuevo?: string }>;
}) {
  const { id } = await params;
  const { nuevo } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await miembroActual();

  const { data: pData } = await supabase.from('pedidos_resumen').select('*').eq('id', id).maybeSingle();
  if (!pData) notFound();
  const p = pData as PedidoResumen;

  const [clienteR, itemsR, pagosR, comentariosR, archivosR, eventosR, equipoR, provR, ppR, plazo] = await Promise.all([
    supabase.from('clientes').select('*').eq('id', p.cliente_id).single(),
    supabase.from('pedido_items').select('*').eq('pedido_id', id).order('orden').order('creado_en'),
    supabase.from('pagos').select('*').eq('pedido_id', id).order('fecha').order('creado_en'),
    supabase.from('comentarios').select('id, texto, creado_en, autor:equipo(nombre)').eq('pedido_id', id).order('creado_en'),
    supabase.from('archivos').select('*').eq('pedido_id', id).order('creado_en'),
    supabase.from('eventos').select('*').eq('pedido_id', id).order('creado_en', { ascending: false }).limit(60),
    supabase.from('equipo').select('id, nombre, email').eq('activo', true).order('nombre'),
    supabase.from('proveedores').select('id, nombre, plazo_dias').eq('activo', true).order('nombre', { ascending: false }),
    supabase.from('proveedor_pendientes').select('*').eq('pedido_id', id).order('creado_en'),
    leerReglaPlazo(supabase),
  ]);
  const proveedores = (provR.data ?? []) as Proveedor[];
  const pedidosProv = (ppR.data ?? []) as PedidoProveedor[];
  const cliente = clienteR.data as Cliente;
  const items = (itemsR.data ?? []) as Item[];
  const pagos = (pagosR.data ?? []) as Pago[];
  const comentarios = (comentariosR.data ?? []) as unknown as Comentario[];
  const archivos = (archivosR.data ?? []) as Archivo[];
  const eventos = (eventosR.data ?? []) as Evento[];
  const equipo = (equipoR.data ?? []) as { id: string; nombre: string; email: string }[];

  // Links temporales (1 hora) para ver los archivos privados.
  const urls = new Map<string, string>();
  if (archivos.length) {
    const { data: firmados } = await supabase.storage.from('archivos').createSignedUrls(
      archivos.map((a) => a.ruta),
      3600,
    );
    (firmados ?? []).forEach((f) => f.path && f.signedUrl && urls.set(f.path, f.signedUrl));
  }

  const iEtapa = ETAPAS.findIndex((e) => e.id === p.etapa);
  const pasos = ETAPAS.filter((e) => e.id !== 'cancelado');
  const wa = linkWhatsApp(cliente?.telefono);
  const nombrePorEmail = new Map(equipo.map((m) => [m.email.toLowerCase(), m.nombre]));
  const terminado = p.etapa === 'entregado' || p.etapa === 'cancelado';

  return (
    <>
      <Link href="/pedidos" className="volver">
        <IconoVolver /> Pedidos
      </Link>

      {nuevo && <p className="aviso aviso-ok" style={{ marginBottom: 12 }}>Pedido #{p.numero} guardado.</p>}

      <div className="cabecera">
        <div>
          <div className="acciones" style={{ alignItems: 'center', marginBottom: 4 }}>
            <span className="mono faint">#{p.numero}</span>
            <ChipEtapa etapa={p.etapa} />
            {p.atrasado && <span className="chip chip-atrasado">Atrasado {-p.dias_restantes} días</span>}
          </div>
          <h1>{p.cliente_nombre}</h1>
          <p className="sub">
            {nombreDe(CANALES, p.canal)} · {nombreDe(TIPOS_VENTA, p.tipo_venta)} · vendido el {fechaLarga(p.fecha_venta)}
            {p.responsable_nombre && ` por ${p.responsable_nombre}`}
          </p>
        </div>
      </div>

      <div className="grid-ficha">
        {/* ================= Columna principal ================= */}
        <div className="col">
          <section className="card card-pad">
            {p.etapa !== 'cancelado' && (
              <div className="etapas" aria-hidden>
                {pasos.map((e, i) => (
                  <span key={e.id} className={i <= iEtapa ? 'hecha' : ''} />
                ))}
              </div>
            )}
            <SelectorEtapa pedidoId={p.id} etapa={p.etapa} />
          </section>

          <section className="card">
            <div className="card-titulo">
              <h2>Productos</h2>
              <span className="quiet small">{items.length}</span>
            </div>
            <div className="seccion">
              {items.length === 0 && <p className="quiet small">Sin productos cargados.</p>}
              {items.map((it) => (
                <ItemEditable key={it.id} pedidoId={p.id} item={it} />
              ))}
              <NuevoItem pedidoId={p.id} />
            </div>
          </section>

          <section className="card">
            <div className="card-titulo">
              <h2>Proveedores</h2>
              <span className="quiet small">
                {pedidosProv.filter((x) => x.estado === 'pedido').length > 0
                  ? `${pedidosProv.filter((x) => x.estado === 'pedido').length} esperando`
                  : pedidosProv.length > 0
                    ? 'todo recibido'
                    : ''}
              </span>
            </div>
            <div className="seccion">
              {pedidosProv.length === 0 && (
                <p className="quiet small">
                  Todavía no se registró qué se pidió a Vidpro, STG u otro proveedor. Al registrarlo, el pedido pasa a “Pedido a fábrica”.
                </p>
              )}
              {pedidosProv.map((pp) => (
                <FilaProveedor key={pp.id} pp={pp} />
              ))}
              <NuevoPedidoProveedor pedidoId={p.id} proveedores={proveedores} feriados={plazo.feriados} abiertoInicial={false} />
            </div>
          </section>

          <section className="card">
            <div className="card-titulo">
              <h2>Notas</h2>
            </div>
            <div className="seccion">
              {p.observaciones && (
                <div className="comentario">
                  <span className="quien">Observaciones de la venta</span>
                  <p>{p.observaciones}</p>
                </div>
              )}
              {comentarios.map((c) => (
                <div key={c.id} className="comentario">
                  <span className="quien">
                    {c.autor?.nombre ?? '—'}
                    <span className="cuando">{fechaHora(c.creado_en)}</span>
                  </span>
                  <p>{c.texto}</p>
                </div>
              ))}
              <FormComentario pedidoId={p.id} />
            </div>
          </section>

          <section className="card">
            <div className="card-titulo">
              <h2>Archivos</h2>
              <SubirArchivos pedidoId={p.id} />
            </div>
            <div className="seccion">
              {archivos.length === 0 ? (
                <p className="quiet small">Fotos de la mesa, comprobantes, planos. Hasta 20 MB cada uno.</p>
              ) : (
                <div className="archivos">
                  {archivos.map((a) => {
                    const url = urls.get(a.ruta);
                    const esImagen = a.tipo_mime?.startsWith('image/');
                    return (
                      <div key={a.id} className="archivo">
                        <a href={url} target="_blank" rel="noreferrer" className="mini" style={esImagen && url ? { backgroundImage: `url("${url}")` } : undefined}>
                          {!esImagen && (a.nombre.split('.').pop() ?? '').toUpperCase()}
                        </a>
                        <span className="nombre" title={a.nombre}>
                          {a.nombre}
                        </span>
                        <BorrarArchivo pedidoId={p.id} archivoId={a.id} nombre={a.nombre} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* ================= Columna lateral ================= */}
        <div className="col">
          <section className="card">
            <div className="card-titulo">
              <h2>Pago</h2>
            </div>
            <div className="seccion">
              <div className="quiet small">Saldo por cobrar</div>
              <div className={`saldo-grande num${Number(p.saldo) > 0 ? '' : ' faint'}`}>{plata(p.saldo)}</div>
              <table className="tabla" style={{ marginTop: 8 }}>
                <tbody>
                  <tr>
                    <td>Total</td>
                    <td className="der num">{plata(p.total)}</td>
                  </tr>
                  {Number(p.precio_envio_cliente) > 0 && (
                    <tr>
                      <td>Envío</td>
                      <td className="der num">{plata(p.precio_envio_cliente)}</td>
                    </tr>
                  )}
                  {pagos.map((pg) => (
                    <tr key={pg.id}>
                      <td>
                        {nombreDe(TIPOS_PAGO, pg.tipo)} <span className="faint small">{fechaCorta(pg.fecha)}{pg.medio ? ` · ${pg.medio}` : ''}</span>
                      </td>
                      <td className="der num">
                        −{plata(pg.monto)} <BorrarPago pedidoId={p.id} pagoId={pg.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="seccion">
              <FormPago pedidoId={p.id} saldo={Number(p.saldo)} formaPago={p.forma_pago} />
            </div>
          </section>

          <section className="card">
            <div className="card-titulo">
              <h2>Entrega</h2>
            </div>
            <div className="seccion">
              <dl className="datos">
                <div className="dato">
                  <dt>Fecha límite</dt>
                  <dd className={p.atrasado ? 'mal' : ''} style={p.atrasado ? { color: 'var(--danger)' } : undefined}>
                    {fechaCorta(p.fecha_limite)}
                    {!terminado && <span className="faint small"> · {relativo(p.dias_restantes)}</span>}
                  </dd>
                </div>
                <div className="dato">
                  <dt>Modalidad</dt>
                  <dd>{nombreDe(ENVIOS, p.envio)}</dd>
                </div>
                <div className="dato">
                  <dt>Programada</dt>
                  <dd>{fechaCorta(p.fecha_entrega_programada)}</dd>
                </div>
                <div className="dato">
                  <dt>Entregado</dt>
                  <dd>{fechaCorta(p.fecha_entrega_real)}</dd>
                </div>
              </dl>
              {(p.direccion_entrega || cliente?.direccion) && (
                <p className="small" style={{ marginTop: 10 }}>
                  <span className="faint">Dirección: </span>
                  {p.direccion_entrega ?? [cliente.direccion, cliente.localidad].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-titulo">
              <h2>Cliente</h2>
              <Link href={`/clientes/${cliente.id}`} className="btn btn-chico btn-fantasma">
                Ver
              </Link>
            </div>
            <div className="seccion">
              <dl className="datos">
                <div className="dato">
                  <dt>Teléfono</dt>
                  <dd>
                    {cliente.telefono ?? '—'}
                    {wa && (
                      <>
                        {' '}
                        <a href={wa} target="_blank" rel="noreferrer" className="btn btn-chico" style={{ marginTop: 4 }}>
                          <IconoWhatsApp /> WhatsApp
                        </a>
                      </>
                    )}
                  </dd>
                </div>
                <div className="dato">
                  <dt>Localidad</dt>
                  <dd>{cliente.localidad ?? '—'}</dd>
                </div>
                {cliente.email && (
                  <div className="dato">
                    <dt>Email</dt>
                    <dd>{cliente.email}</dd>
                  </div>
                )}
                {cliente.dni && (
                  <div className="dato">
                    <dt>DNI</dt>
                    <dd className="mono">{cliente.dni}</dd>
                  </div>
                )}
              </dl>
            </div>
          </section>

          <EditarPedido p={p} equipo={equipo.map(({ id, nombre }) => ({ id, nombre }))} />

          <section className="card">
            <details>
              <summary className="card-titulo" style={{ cursor: 'pointer', listStyle: 'none', borderBottom: 0 }}>
                <h2>Historial</h2>
                <span className="quiet small">{eventos.length} cambios</span>
              </summary>
              <div className="seccion">
                <ul className="historial">
                  {eventos.map((ev) => (
                    <li key={ev.id}>
                      <span className="cuando">{fechaHora(ev.creado_en)}</span>
                      <span>
                        <strong>{(ev.usuario_email && nombrePorEmail.get(ev.usuario_email.toLowerCase())) ?? 'Sistema'}</strong>{' '}
                        {textoEvento(ev)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          </section>
        </div>
      </div>
    </>
  );
}

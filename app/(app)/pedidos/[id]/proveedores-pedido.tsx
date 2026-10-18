'use client';

import { startTransition, useActionState, useEffect, useState, useTransition } from 'react';
import { fechaCorta, hoyAR, sumarDiasHabiles } from '@/lib/fechas';
import type { PedidoProveedor, Proveedor } from '@/lib/tipos';
import { borrarPedidoProveedor, cambiarEstadoProveedor, pedirAProveedor, type EstadoProv } from '../../proveedores/actions';

export function ChipProveedor({ pp }: { pp: Pick<PedidoProveedor, 'estado' | 'demorado'> }) {
  if (pp.estado === 'recibido') return <span className="chip chip-lista">Recibido</span>;
  if (pp.estado === 'cancelado') return <span className="chip chip-cancelado">Cancelado</span>;
  if (pp.demorado) return <span className="chip chip-atrasado">Demorado</span>;
  return <span className="chip chip-en_fabricacion">Esperando</span>;
}

export function FilaProveedor({ pp, conPedido = false }: { pp: PedidoProveedor; conPedido?: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const cambiar = (estado: 'pedido' | 'recibido' | 'cancelado') =>
    iniciar(async () => {
      const r = await cambiarEstadoProveedor(pp.pedido_id, pp.id, estado);
      setError(r.error ?? null);
    });

  return (
    <div className="item">
      <div className="acciones" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <div style={{ minWidth: 0 }}>
          <div className="item-titulo">
            {pp.proveedor_nombre}
            {conPedido && (
              <a href={`/pedidos/${pp.pedido_id}`} className="quiet" style={{ fontWeight: 400 }}>
                {' '}
                · #{pp.pedido_numero} {pp.cliente_nombre}
              </a>
            )}
          </div>
          {pp.detalle && <div className="item-detalle">{pp.detalle}</div>}
          <div className="xs faint" style={{ marginTop: 2 }}>
            Pedido {fechaCorta(pp.fecha_pedido)}
            {pp.estado === 'recibido'
              ? ` · llegó ${fechaCorta(pp.fecha_recepcion)}`
              : pp.fecha_esperada
                ? ` · espera ${fechaCorta(pp.fecha_esperada)}`
                : ''}
            {pp.link_drive && (
              <>
                {' · '}
                <a href={pp.link_drive} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                  Ver en Drive
                </a>
              </>
            )}
          </div>
        </div>
        <ChipProveedor pp={pp} />
      </div>
      <div className="acciones" style={{ marginTop: 6 }}>
        {pp.estado === 'pedido' ? (
          <>
            <button type="button" className="btn btn-chico btn-primario" disabled={pendiente} onClick={() => cambiar('recibido')}>
              {pendiente ? 'Guardando…' : 'Marcar recibido'}
            </button>
            <button
              type="button"
              className="btn btn-chico btn-fantasma"
              disabled={pendiente}
              onClick={() => confirm('¿Cancelar este pedido al proveedor?') && cambiar('cancelado')}
            >
              Cancelar
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-chico btn-fantasma" disabled={pendiente} onClick={() => cambiar('pedido')}>
            Volver a "esperando"
          </button>
        )}
        {!conPedido && (
          <button
            type="button"
            className="btn btn-chico btn-fantasma btn-peligro"
            disabled={pendiente}
            style={{ marginLeft: 'auto' }}
            onClick={() => confirm('¿Borrar este registro?') && iniciar(() => borrarPedidoProveedor(pp.pedido_id, pp.id))}
          >
            Borrar
          </button>
        )}
      </div>
      {error && <p className="error-form" style={{ marginTop: 6 }}>{error}</p>}
    </div>
  );
}

export function NuevoPedidoProveedor({
  pedidoId,
  proveedores,
  feriados,
  abiertoInicial,
  sugerencias,
  yaPedidos,
}: {
  pedidoId: string;
  proveedores: Proveedor[];
  feriados: string[];
  abiertoInicial: boolean;
  /** Qué pedirle a cada proveedor según los productos (por nombre de proveedor). */
  sugerencias: Record<string, string>;
  /** Proveedores que ya tienen un pedido activo para este pedido. */
  yaPedidos: string[];
}) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  const [estado, accion, guardando] = useActionState<EstadoProv, FormData>(pedirAProveedor.bind(null, pedidoId), {});
  const [proveedorId, setProveedorId] = useState(proveedores[0]?.id ?? '');
  const [fechaPedido, setFechaPedido] = useState(hoyAR());
  const [fechaManual, setFechaManual] = useState('');
  const [detalle, setDetalle] = useState(sugerencias[proveedores[0]?.nombre ?? ''] ?? '');
  const plazo = proveedores.find((p) => p.id === proveedorId)?.plazo_dias ?? 25;
  const esperada = fechaManual || sumarDiasHabiles(fechaPedido || hoyAR(), plazo, new Set(feriados));

  useEffect(() => {
    if (estado.ok) {
      setAbierto(false);
      setFechaManual('');
    }
  }, [estado]);

  // Registro en un toque: proveedor, hoy y el detalle armado con los productos.
  const pedirYa = (prov: Proveedor) => {
    const fd = new FormData();
    fd.set('proveedor_id', prov.id);
    fd.set('detalle', sugerencias[prov.nombre] ?? '');
    fd.set('fecha_pedido', hoyAR());
    startTransition(() => accion(fd));
  };
  const rapidos = proveedores.filter((p) => sugerencias[p.nombre] !== undefined && !yaPedidos.includes(p.id));

  if (!abierto)
    return (
      <div style={{ marginTop: 8 }} className="form-bloque">
        {rapidos.length > 0 && (
          <div className="acciones">
            {rapidos.map((p) => (
              <button key={p.id} type="button" className="btn btn-primario btn-chico" disabled={guardando} onClick={() => pedirYa(p)}>
                {guardando ? 'Guardando…' : `✓ Ya se pidió a ${p.nombre}`}
              </button>
            ))}
          </div>
        )}
        {estado.error && <p className="error-form">{estado.error}</p>}
        <div>
          <button type="button" className="btn btn-chico" onClick={() => setAbierto(true)}>
            + Registrar pedido a proveedor (con detalle o fecha)
          </button>
        </div>
      </div>
    );

  return (
    <form
      className="item form-bloque"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => accion(fd));
      }}
    >
      <div className="campo">
        <span className="etiqueta">Proveedor</span>
        <div className="segmentado">
          {proveedores.map((p) => (
            <label key={p.id}>
              <input
                type="radio"
                name="proveedor_id"
                value={p.id}
                checked={proveedorId === p.id}
                onChange={() => {
                  setProveedorId(p.id);
                  setDetalle(sugerencias[p.nombre] ?? '');
                }}
              />
              {p.nombre}
            </label>
          ))}
        </div>
      </div>
      <div className="campo">
        <label htmlFor="pp_detalle">Qué se pidió</label>
        <input
          id="pp_detalle"
          name="detalle"
          type="text"
          placeholder="Tapa 10mm 160x90, estructura bronce…"
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
        />
      </div>
      <div className="fila fila-2m">
        <div className="campo">
          <label htmlFor="pp_fecha">Fecha de pedido</label>
          <input id="pp_fecha" name="fecha_pedido" type="date" value={fechaPedido} onChange={(e) => setFechaPedido(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="pp_esperada">Llega aprox.</label>
          <input id="pp_esperada" name="fecha_esperada" type="date" value={esperada} onChange={(e) => setFechaManual(e.target.value)} />
          <span className="ayuda">{fechaManual ? 'Cambiada a mano' : `${plazo} días hábiles después del pedido`}</span>
        </div>
      </div>
      <div className="campo">
        <label htmlFor="pp_link">Link al pedido en Drive (opcional)</label>
        <input id="pp_link" name="link_drive" type="text" inputMode="url" placeholder="https://drive.google.com/…" />
      </div>
      {estado.error && <p className="error-form">{estado.error}</p>}
      <div className="acciones">
        <button className="btn btn-primario btn-chico" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Registrar'}
        </button>
        <button type="button" className="btn btn-chico" onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

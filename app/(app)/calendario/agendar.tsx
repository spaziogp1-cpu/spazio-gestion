'use client';

import { startTransition, useActionState, useEffect, useMemo, useState } from 'react';
import { ENVIOS, nombreEtapa } from '@/lib/constantes';
import { fechaCorta } from '@/lib/fechas';
import { agendarEntrega, type EstadoEntrega } from './actions';

export type PedidoParaAgendar = {
  id: string;
  numero: number;
  cliente_nombre: string;
  cliente_localidad: string | null;
  productos: string;
  etapa: string;
  envio: string;
  fecha_entrega_programada: string | null;
};

export function AgendarEntrega({ pedidos, fechaInicial }: { pedidos: PedidoParaAgendar[]; fechaInicial: string }) {
  const [abierto, setAbierto] = useState(false);
  const [buscar, setBuscar] = useState('');
  const [pedidoId, setPedidoId] = useState('');
  const [estado, accion, guardando] = useActionState<EstadoEntrega, FormData>(agendarEntrega, {});

  useEffect(() => {
    if (estado.ok) {
      setPedidoId('');
      setBuscar('');
    }
  }, [estado]);

  const elegido = pedidos.find((p) => p.id === pedidoId);
  const lista = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    // Primero los que están listos y todavía no tienen fecha.
    const orden = (p: PedidoParaAgendar) => (p.fecha_entrega_programada ? 2 : p.etapa === 'lista' ? 0 : 1);
    return pedidos
      .filter((p) => !q || `${p.numero} ${p.cliente_nombre} ${p.cliente_localidad ?? ''} ${p.productos}`.toLowerCase().includes(q))
      .sort((a, b) => orden(a) - orden(b) || a.numero - b.numero)
      .slice(0, 8);
  }, [pedidos, buscar]);

  if (!abierto)
    return (
      <button type="button" className="btn btn-primario btn-chico" onClick={() => setAbierto(true)}>
        + Agendar entrega
      </button>
    );

  return (
    <section className="card agendar-entrega">
      <form
        className="form-bloque"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => accion(fd));
        }}
      >
        <div className="card-titulo" style={{ padding: 0, border: 0 }}>
          <h2>Agendar entrega</h2>
          <button type="button" className="btn btn-fantasma btn-chico" onClick={() => setAbierto(false)}>
            Cerrar
          </button>
        </div>
        <input type="hidden" name="pedido_id" value={pedidoId} />
        {elegido ? (
          <div className="agendar-elegido">
            <div>
              <strong>
                #{elegido.numero} {elegido.cliente_nombre}
              </strong>
              <div className="small faint">
                {[elegido.productos, elegido.cliente_localidad, nombreEtapa(elegido.etapa)].filter(Boolean).join(' · ')}
                {elegido.fecha_entrega_programada && ` · ya agendada el ${fechaCorta(elegido.fecha_entrega_programada)}`}
              </div>
            </div>
            <button type="button" className="btn btn-chico" onClick={() => setPedidoId('')}>
              Cambiar
            </button>
          </div>
        ) : (
          <div className="campo">
            <label htmlFor="buscar-pedido">Pedido</label>
            <input id="buscar-pedido" type="search" placeholder="Número, cliente o localidad…" value={buscar} onChange={(e) => setBuscar(e.target.value)} autoFocus />
            <div className="agendar-lista">
              {lista.length === 0 && <p className="small faint">No hay pedidos activos que coincidan.</p>}
              {lista.map((p) => (
                <button key={p.id} type="button" className="agendar-opcion" onClick={() => setPedidoId(p.id)}>
                  <span>
                    <strong>#{p.numero}</strong> {p.cliente_nombre}
                    {p.cliente_localidad && <span className="faint"> · {p.cliente_localidad}</span>}
                  </span>
                  <span className="small faint">
                    {nombreEtapa(p.etapa)}
                    {p.fecha_entrega_programada && ` · agendada ${fechaCorta(p.fecha_entrega_programada)}`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="fila fila-2m">
          <div className="campo">
            <label htmlFor="fecha-entrega">Día</label>
            <input id="fecha-entrega" name="fecha" type="date" defaultValue={elegido?.fecha_entrega_programada ?? fechaInicial} key={`${pedidoId}-${fechaInicial}`} required />
          </div>
          <div className="campo">
            <label htmlFor="hora-entrega">Horario (opcional)</label>
            <input id="hora-entrega" name="hora" type="time" />
          </div>
        </div>
        <div className="campo">
          <label htmlFor="envio-entrega">Cómo</label>
          <select id="envio-entrega" name="envio" defaultValue={elegido?.envio ?? 'flete'} key={pedidoId}>
            {ENVIOS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <button className="btn btn-primario" disabled={guardando || !pedidoId}>
            {guardando ? 'Guardando…' : 'Agendar'}
          </button>
        </div>
        {estado.ok && <p className="aviso aviso-ok">{estado.ok}</p>}
        {estado.error && <p className="error-form">{estado.error}</p>}
      </form>
    </section>
  );
}

'use client';

import { startTransition, useActionState, useEffect, useRef, useState } from 'react';
import { hoyAR, sumarDiasHabiles } from '@/lib/fechas';
import type { Proveedor } from '@/lib/tipos';
import { pedirParaStock, type EstadoProv } from './actions';

export default function NuevoStock({ proveedores, feriados }: { proveedores: Proveedor[]; feriados: string[] }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, guardando] = useActionState<EstadoProv, FormData>(pedirParaStock, {});
  const [proveedorId, setProveedorId] = useState(proveedores[0]?.id ?? 'nuevo');
  const [plazoNuevo, setPlazoNuevo] = useState('10');
  const [fechaPedido, setFechaPedido] = useState(hoyAR());
  const [fechaManual, setFechaManual] = useState('');
  const form = useRef<HTMLFormElement>(null);

  const esNuevo = proveedorId === 'nuevo';
  const plazo = esNuevo ? Math.max(1, Number(plazoNuevo) || 10) : (proveedores.find((p) => p.id === proveedorId)?.plazo_dias ?? 25);
  const esperada = fechaManual || sumarDiasHabiles(fechaPedido || hoyAR(), plazo, new Set(feriados));

  useEffect(() => {
    if (estado.ok) {
      form.current?.reset();
      setFechaManual('');
      setAbierto(false);
    }
  }, [estado]);

  if (!abierto)
    return (
      <div className="acciones" style={{ marginBottom: 12, alignItems: 'center' }}>
        <button type="button" className="btn btn-primario" onClick={() => setAbierto(true)}>
          + Pedido para stock
        </button>
        {estado.ok && <span className="small" style={{ color: 'var(--ok)' }}>{estado.ok}</span>}
      </div>
    );

  return (
    <section className="card card-pad" style={{ marginBottom: 12, maxWidth: 640 }}>
      <form
        ref={form}
        className="form-bloque"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => accion(fd));
        }}
      >
        <div>
          <h2>Pedido para stock</h2>
          <p className="quiet small">Compras para tener, que no son de un pedido de cliente.</p>
        </div>

        <div className="campo">
          <span className="etiqueta">Proveedor</span>
          <div className="segmentado">
            {proveedores.map((p) => (
              <label key={p.id}>
                <input type="radio" name="proveedor_id" value={p.id} checked={proveedorId === p.id} onChange={() => setProveedorId(p.id)} />
                {p.nombre}
              </label>
            ))}
            <label>
              <input type="radio" name="proveedor_id" value="nuevo" checked={esNuevo} onChange={() => setProveedorId('nuevo')} />+ Otro
            </label>
          </div>
        </div>

        {esNuevo && (
          <div className="fila fila-3">
            <div className="campo">
              <label htmlFor="st_prov">Nombre del proveedor</label>
              <input id="st_prov" name="proveedor_nuevo" type="text" required autoFocus />
            </div>
            <div className="campo">
              <label htmlFor="st_que">Qué provee</label>
              <input id="st_que" name="que_provee" type="text" placeholder="Cuerina, herrajes…" />
            </div>
            <div className="campo">
              <label htmlFor="st_plazo">Tarda (días hábiles)</label>
              <input id="st_plazo" name="plazo_nuevo" type="number" min={1} value={plazoNuevo} onChange={(e) => setPlazoNuevo(e.target.value)} />
            </div>
          </div>
        )}

        <div className="fila fila-2">
          <div className="campo">
            <label htmlFor="st_detalle">Qué se pidió</label>
            <input id="st_detalle" name="detalle" type="text" required placeholder="Vidrio incoloro 10mm, estructuras bronce…" />
          </div>
          <div className="campo">
            <label htmlFor="st_cant">Cantidad</label>
            <input id="st_cant" name="cantidad" type="text" placeholder="10 unidades" />
          </div>
        </div>

        <div className="fila fila-2m">
          <div className="campo">
            <label htmlFor="st_fecha">Fecha de pedido</label>
            <input id="st_fecha" name="fecha_pedido" type="date" value={fechaPedido} onChange={(e) => setFechaPedido(e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="st_esperada">Llega aprox.</label>
            <input id="st_esperada" name="fecha_esperada" type="date" value={esperada} onChange={(e) => setFechaManual(e.target.value)} />
            <span className="ayuda">{fechaManual ? 'Cambiada a mano' : `${plazo} días hábiles después del pedido`}</span>
          </div>
        </div>

        <div className="campo">
          <label htmlFor="st_link">Link al pedido en Drive (opcional)</label>
          <input id="st_link" name="link_drive" type="text" inputMode="url" placeholder="https://drive.google.com/…" />
        </div>
        <div className="campo">
          <label htmlFor="st_nota">Nota (opcional)</label>
          <input id="st_nota" name="nota" type="text" placeholder="Para fotos, para la feria, precio acordado…" />
        </div>

        {estado.error && <p className="error-form">{estado.error}</p>}
        <div className="acciones">
          <button className="btn btn-primario" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Registrar pedido'}
          </button>
          <button type="button" className="btn" onClick={() => setAbierto(false)}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}

'use client';

import { startTransition, useActionState, useEffect, useState, useTransition } from 'react';
import { cambiarEstadoObjetivo, crearObjetivo, type EstadoObjetivo } from './actions';

export function NuevoObjetivo({ equipo }: { equipo: { id: string; nombre: string }[] }) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<'numerico' | 'proyecto'>('numerico');
  const [estado, accion, guardando] = useActionState<EstadoObjetivo, FormData>(crearObjetivo, {});
  useEffect(() => {
    if (estado.ok) setAbierto(false);
  }, [estado]);

  if (!abierto)
    return (
      <button type="button" className="btn btn-primario" onClick={() => setAbierto(true)}>
        + Nuevo objetivo
      </button>
    );

  return (
    <section className="card card-pad" style={{ maxWidth: 640, marginBottom: 12 }}>
      <form
        className="form-bloque"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => accion(fd));
        }}
      >
        <h2>Nuevo objetivo</h2>
        <div className="segmentado">
          <label>
            <input type="radio" name="tipo" value="numerico" checked={tipo === 'numerico'} onChange={() => setTipo('numerico')} />
            Meta de ventas
          </label>
          <label>
            <input type="radio" name="tipo" value="proyecto" checked={tipo === 'proyecto'} onChange={() => setTipo('proyecto')} />
            Proyecto con fecha
          </label>
        </div>
        <div className="campo">
          <label htmlFor="ob_titulo">Nombre</label>
          <input
            id="ob_titulo"
            name="titulo"
            type="text"
            required
            placeholder={tipo === 'numerico' ? 'Ventas de la semana' : 'Integración de IA en WhatsApp'}
          />
        </div>
        <div className="campo">
          <label htmlFor="ob_resp">Responsable</label>
          <select id="ob_resp" name="responsable_id" defaultValue="">
            <option value="">Todo el equipo</option>
            {equipo.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </div>
        {tipo === 'numerico' ? (
          <div className="fila fila-3">
            <div className="campo">
              <label htmlFor="ob_metrica">Qué se mide</label>
              <select id="ob_metrica" name="metrica" defaultValue="ventas">
                <option value="ventas">Cantidad de ventas</option>
                <option value="facturacion">Facturación ($)</option>
              </select>
            </div>
            <div className="campo">
              <label htmlFor="ob_periodo">Cada</label>
              <select id="ob_periodo" name="periodo" defaultValue="semana">
                <option value="semana">Semana</option>
                <option value="mes">Mes</option>
              </select>
            </div>
            <div className="campo">
              <label htmlFor="ob_meta">Meta</label>
              <input id="ob_meta" name="meta" type="text" inputMode="numeric" className="num" required placeholder="20" />
            </div>
          </div>
        ) : (
          <>
            <div className="campo" style={{ maxWidth: 240 }}>
              <label htmlFor="ob_fecha">Tiene que estar para</label>
              <input id="ob_fecha" name="fecha_limite" type="date" required />
            </div>
            <div className="campo">
              <label htmlFor="ob_desc">Descripción (opcional)</label>
              <textarea id="ob_desc" name="descripcion" style={{ minHeight: 60 }} />
            </div>
            <p className="quiet small">Después de crearlo, le agregás las tareas y el avance se calcula con las que se van terminando.</p>
          </>
        )}
        {estado.error && <p className="error-form">{estado.error}</p>}
        <div className="acciones">
          <button className="btn btn-primario" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Crear objetivo'}
          </button>
          <button type="button" className="btn" onClick={() => setAbierto(false)}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}

export function AccionesObjetivo({ id }: { id: string }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="acciones">
      <button type="button" className="btn btn-chico" disabled={pendiente} onClick={() => iniciar(() => cambiarEstadoObjetivo(id, 'cumplido'))}>
        ✓ Cumplido
      </button>
      <button
        type="button"
        className="btn btn-chico btn-fantasma"
        disabled={pendiente}
        onClick={() => confirm('¿Dar de baja este objetivo?') && iniciar(() => cambiarEstadoObjetivo(id, 'cancelado'))}
      >
        Dar de baja
      </button>
    </div>
  );
}

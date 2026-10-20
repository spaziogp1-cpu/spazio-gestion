'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { ESTADOS_PRESUPUESTO } from '@/lib/cotizador/estados';
import { aprobarDescuento, cambiarEstado, duplicarPresupuesto, guardarNotas } from '../actions';

export function AccionesPresupuesto({
  id,
  estado,
  texto,
  whatsapp,
  necesitaAprobacion,
  esAdmin,
  bloqueado,
  pedidoId,
}: {
  id: string;
  estado: string;
  texto: string;
  whatsapp: string | null;
  necesitaAprobacion: boolean;
  esAdmin: boolean;
  bloqueado: boolean;
  pedidoId: string | null;
}) {
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  const hacer = (f: () => Promise<{ error?: string } | void>) =>
    empezar(async () => {
      setError(null);
      const r = await f();
      if (r && r.error) setError(r.error);
    });
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
      // Copiar un borrador para mandarlo lo marca como enviado.
      if (estado === 'borrador' && !necesitaAprobacion) hacer(() => cambiarEstado(id, 'enviado'));
    } catch {
      setError('No se pudo copiar: seleccioná el texto y copialo a mano.');
    }
  };

  return (
    <div className="form-bloque">
      {necesitaAprobacion && (
        <ul className="editor-avisos">
          <li data-nivel="advertencia">
            El descuento supera el tope. {esAdmin ? 'Aprobalo para poder enviarlo.' : 'Un administrador tiene que aprobarlo antes de enviarlo.'}
          </li>
        </ul>
      )}
      {necesitaAprobacion && esAdmin && (
        <button type="button" className="btn btn-chico" disabled={pendiente} onClick={() => hacer(() => aprobarDescuento(id))}>
          Aprobar descuento
        </button>
      )}
      <div className="acciones">
        <button type="button" className="btn btn-primario" onClick={copiar} disabled={necesitaAprobacion}>
          {copiado ? 'Copiado ✓' : 'Copiar para WhatsApp'}
        </button>
        {whatsapp && !necesitaAprobacion && (
          <a
            className="btn"
            href={`${whatsapp}?text=${encodeURIComponent(texto)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              if (estado === 'borrador') hacer(() => cambiarEstado(id, 'enviado'));
            }}
          >
            Abrir WhatsApp
          </a>
        )}
      </div>

      <div className="campo">
        <label htmlFor="pr-estado">Estado</label>
        <select id="pr-estado" value={estado} disabled={pendiente} onChange={(e) => hacer(() => cambiarEstado(id, e.target.value))}>
          {ESTADOS_PRESUPUESTO.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="acciones">
        {pedidoId ? (
          <Link href={`/pedidos/${pedidoId}`} className="btn btn-chico btn-primario">
            Ver el pedido
          </Link>
        ) : (
          !necesitaAprobacion && (
            <Link href={`/pedidos/nuevo?presupuesto=${id}`} className="btn btn-chico btn-primario">
              Convertir en pedido
            </Link>
          )
        )}
        {!bloqueado && (
          <Link href={`/cotizador/${id}/editar`} className="btn btn-chico">
            Editar
          </Link>
        )}
        <button type="button" className="btn btn-chico" disabled={pendiente} onClick={() => hacer(() => duplicarPresupuesto(id))}>
          {pendiente ? 'Un momento…' : 'Duplicar'}
        </button>
      </div>
      {error && <p className="error-form" role="alert">{error}</p>}
    </div>
  );
}

export function Notas({ id, inicial }: { id: string; inicial: string }) {
  const [valor, setValor] = useState(inicial);
  const [guardado, setGuardado] = useState(inicial);
  const [pendiente, empezar] = useTransition();
  const [ok, setOk] = useState(false);
  return (
    <div className="form-bloque">
      <textarea value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Seguimiento, lo que pidió el cliente…" aria-label="Notas internas" />
      {valor !== guardado && (
        <div>
          <button
            type="button"
            className="btn btn-chico"
            disabled={pendiente}
            onClick={() =>
              empezar(async () => {
                const r = await guardarNotas(id, valor);
                if (!r.error) {
                  setGuardado(valor);
                  setOk(true);
                  setTimeout(() => setOk(false), 1500);
                }
              })
            }
          >
            Guardar notas
          </button>
        </div>
      )}
      {ok && <span className="small" style={{ color: 'var(--ok)' }}>Guardado</span>}
    </div>
  );
}

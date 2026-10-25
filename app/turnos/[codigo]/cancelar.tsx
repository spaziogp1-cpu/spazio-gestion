'use client';

import { useState, useTransition } from 'react';
import { cancelarTurno } from '../actions';

export function Cancelar({ codigo }: { codigo: string }) {
  const [seguro, setSeguro] = useState(false);
  const [error, setError] = useState<string>();
  const [pendiente, iniciar] = useTransition();
  if (!seguro)
    return (
      <button type="button" className="btn btn-fantasma btn-chico" onClick={() => setSeguro(true)}>
        Cancelar el turno
      </button>
    );
  return (
    <span className="acciones">
      <button
        type="button"
        className="btn btn-chico btn-peligro"
        disabled={pendiente}
        onClick={() => iniciar(async () => setError((await cancelarTurno(codigo))?.error))}
      >
        {pendiente ? 'Cancelando…' : 'Sí, cancelar'}
      </button>
      <button type="button" className="btn btn-fantasma btn-chico" onClick={() => setSeguro(false)}>
        No
      </button>
      {error && <span className="error-form">{error}</span>}
    </span>
  );
}

'use client';

import { useTransition } from 'react';
import { marcarLeidos } from './actions';

export function MarcarTodo() {
  const [pendiente, iniciar] = useTransition();
  return (
    <button type="button" className="btn btn-chico" disabled={pendiente} onClick={() => iniciar(() => marcarLeidos())}>
      Marcar todo como leído
    </button>
  );
}

export function MarcarUno({ id }: { id: string }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <button
      type="button"
      className="aviso-marcar"
      disabled={pendiente}
      onClick={() => iniciar(() => marcarLeidos([id]))}
      aria-label="Marcar como leído"
      title="Marcar como leído"
    >
      ✓
    </button>
  );
}

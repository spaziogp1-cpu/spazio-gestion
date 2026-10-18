'use client';

import { useEffect, useTransition } from 'react';
import { marcarLeidos } from './actions';

export function MarcarTodo() {
  const [pendiente, iniciar] = useTransition();
  return (
    <button type="button" className="btn btn-chico" disabled={pendiente} onClick={() => iniciar(() => marcarLeidos())}>
      Marcar todo como leído
    </button>
  );
}

// Al abrir la página, los avisos quedan como leídos (siguen resaltados mientras la mirás).
export function MarcarAlVer() {
  const [, iniciar] = useTransition();
  useEffect(() => {
    const t = setTimeout(() => iniciar(() => marcarLeidos()), 1500);
    return () => clearTimeout(t);
  }, []);
  return null;
}

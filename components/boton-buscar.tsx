'use client';

import { useEffect, useState } from 'react';
import { IconoBuscar } from './iconos';

export const EVENTO_BUSCADOR = 'spazio:abrir-buscador';

export function abrirBuscador(texto?: string) {
  window.dispatchEvent(new CustomEvent(EVENTO_BUSCADOR, { detail: texto }));
}

// Botón que abre el buscador global. En la barra lateral (escritorio) y arriba del contenido (celular).
export function BotonBuscar({ className = '' }: { className?: string }) {
  const [atajo, setAtajo] = useState('Ctrl K');
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setAtajo('⌘K');
  }, []);
  return (
    <button type="button" className={`boton-buscar ${className}`} onClick={() => abrirBuscador()}>
      <IconoBuscar />
      <span className="boton-buscar-texto">Buscar…</span>
      <kbd>{atajo}</kbd>
    </button>
  );
}

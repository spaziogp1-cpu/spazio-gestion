'use client';

import { useEffect, useState } from 'react';

type Tema = 'auto' | 'claro' | 'oscuro';
const OPCIONES: { id: Tema; txt: string }[] = [
  { id: 'claro', txt: 'Claro' },
  { id: 'oscuro', txt: 'Oscuro' },
  { id: 'auto', txt: 'Auto' },
];

function aplicar(t: Tema) {
  const html = document.documentElement;
  if (t === 'auto') html.removeAttribute('data-tema');
  else html.setAttribute('data-tema', t);
}

// Elige entre tema claro, oscuro o el del dispositivo. Se guarda en este navegador.
export function SelectorTema({ claro = false }: { claro?: boolean }) {
  const [tema, setTema] = useState<Tema>('auto');
  useEffect(() => {
    try {
      const t = localStorage.getItem('tema') as Tema | null;
      if (t === 'claro' || t === 'oscuro') setTema(t);
    } catch {
      // sin almacenamiento: queda automático
    }
  }, []);
  return (
    <div className={`tema${claro ? ' tema-claro' : ''}`} role="group" aria-label="Tema">
      {OPCIONES.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={tema === o.id}
          onClick={() => {
            setTema(o.id);
            aplicar(o.id);
            try {
              if (o.id === 'auto') localStorage.removeItem('tema');
              else localStorage.setItem('tema', o.id);
            } catch {
              // nada
            }
          }}
        >
          {o.txt}
        </button>
      ))}
    </div>
  );
}

// Se ejecuta antes de pintar la página, para que no parpadee el tema.
export const SCRIPT_TEMA = `try{var t=localStorage.getItem('tema');if(t==='claro'||t==='oscuro')document.documentElement.setAttribute('data-tema',t)}catch(e){}`;

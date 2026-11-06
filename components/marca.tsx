// Marca de Spazio: el logo original (blanco sobre transparente, 938 × 360 px).
// Se usa siempre el archivo tal cual, a escala proporcional: nada de recortes,
// sombras ni filtros. Como es blanco, va sobre superficies grafito: el menú
// lateral y la pantalla de ingreso ya lo son; en páginas claras se apoya en
// una "placa" grafito (prop `placa`), que además le da su área de respiro.
export const LOGO = { src: '/marca/spazio-logo.png', ancho: 938, alto: 360 };

export function Logo({ alto = 40, className = '' }: { alto?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LOGO.src}
      alt="Spazio"
      width={Math.round((alto * LOGO.ancho) / LOGO.alto)}
      height={alto}
      className={`logo ${className}`}
      decoding="async"
    />
  );
}

export function Marca({ sub = 'Gestión', alto = 40, placa = false }: { sub?: string; alto?: number; placa?: boolean; chica?: boolean }) {
  return (
    <span className={`marca-spazio${placa ? ' marca-placa' : ''}`}>
      <Logo alto={alto} />
      {sub && <span className="marca-sub">{sub}</span>}
    </span>
  );
}

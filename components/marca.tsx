// Marca de la app: cinco vidrios de colores superpuestos + "Spazio" en serif.
export function Marca({ chica = false }: { chica?: boolean }) {
  return (
    <span className={`marca-spazio${chica ? ' marca-chica' : ''}`}>
      <span className="vidrios" aria-hidden="true">
        <span style={{ background: 'var(--c-amarillo)' }} />
        <span style={{ background: 'var(--c-rosa)' }} />
        <span style={{ background: 'var(--c-azul)' }} />
        <span style={{ background: 'var(--c-verde)' }} />
        <span style={{ background: 'var(--c-violeta)' }} />
      </span>
      <span className="marca-nombre">Spazio</span>
      <span className="marca-sub">Gestión</span>
    </span>
  );
}

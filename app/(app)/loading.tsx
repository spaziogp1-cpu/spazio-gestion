// Se muestra al instante mientras el servidor arma la pantalla pedida,
// así al tocar una sección la app responde enseguida en vez de quedarse quieta.
export default function Cargando() {
  return (
    <div className="cargando" aria-busy="true" aria-label="Cargando">
      <div className="esqueleto esq-titulo" />
      <div className="esqueleto esq-sub" />
      <div className="card esq-card">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="esq-fila">
            <div className="esqueleto esq-linea" style={{ width: `${55 + ((i * 17) % 35)}%` }} />
            <div className="esqueleto esq-linea corta" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Se muestra al instante al tocar cualquier sección mientras el servidor trae los datos,
// así la app responde enseguida en vez de quedarse quieta hasta que carga todo.
export default function Cargando() {
  return (
    <div className="cargando" role="status" aria-label="Cargando">
      <div className="cargando-barra cargando-titulo" />
      <div className="card card-pad">
        <div className="cargando-barra" />
        <div className="cargando-barra cargando-corta" />
        <div className="cargando-barra" />
      </div>
      <div className="card card-pad">
        <div className="cargando-barra" />
        <div className="cargando-barra cargando-corta" />
        <div className="cargando-barra" />
        <div className="cargando-barra cargando-corta" />
      </div>
    </div>
  );
}

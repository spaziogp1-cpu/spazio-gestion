import Link from 'next/link';

export default function NoEncontrado() {
  return (
    <main className="login">
      <div className="card form-bloque">
        <h1>No encontramos esa página</h1>
        <p className="quiet">Puede que el pedido se haya borrado o que el link esté mal.</p>
        <Link href="/pedidos" className="btn btn-primario">
          Ir a pedidos
        </Link>
      </div>
    </main>
  );
}

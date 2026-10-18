'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconoClientes, IconoMas, IconoPedidos, IconoProduccion, IconoProveedores } from './iconos';

const LINKS = [
  { href: '/pedidos', nombre: 'Pedidos', Icono: IconoPedidos },
  { href: '/produccion', nombre: 'Producción', Icono: IconoProduccion },
  { href: '/proveedores', nombre: 'Proveedores', Icono: IconoProveedores },
  { href: '/clientes', nombre: 'Clientes', Icono: IconoClientes },
];

function activo(path: string, href: string) {
  if (href === '/pedidos') return path === '/pedidos' || (path.startsWith('/pedidos/') && path !== '/pedidos/nuevo');
  return path === href || path.startsWith(href + '/');
}

export function Sidebar({ nombre }: { nombre: string }) {
  const path = usePathname();
  return (
    <nav className="sidebar" aria-label="Principal">
      <Link href="/" className="marca">
        <img src="/icon.svg" alt="" />
        Spazio
      </Link>
      <Link href="/pedidos/nuevo" className="btn btn-primario" style={{ marginBottom: 12 }}>
        <IconoMas className="" /> Nuevo pedido
      </Link>
      {LINKS.map(({ href, nombre, Icono }) => (
        <Link key={href} href={href} className="navlink" aria-current={activo(path, href) ? 'page' : undefined}>
          <Icono /> {nombre}
        </Link>
      ))}
      <div className="pie">
        <div>{nombre}</div>
        <form action="/auth/salir" method="post">
          <button className="btn btn-fantasma btn-chico" style={{ paddingLeft: 0 }}>
            Salir
          </button>
        </form>
      </div>
    </nav>
  );
}

export function TabBar() {
  const path = usePathname();
  return (
    <nav className="tabbar" aria-label="Principal">
      <Link href="/pedidos" className="tab" aria-current={activo(path, '/pedidos') ? 'page' : undefined}>
        <IconoPedidos /> Pedidos
      </Link>
      <Link href="/produccion" className="tab" aria-current={activo(path, '/produccion') ? 'page' : undefined}>
        <IconoProduccion /> Producción
      </Link>
      <Link href="/pedidos/nuevo" className="tab tab-mas" aria-label="Nuevo pedido">
        <IconoMas /> Nuevo
      </Link>
      <Link href="/proveedores" className="tab" aria-current={activo(path, '/proveedores') ? 'page' : undefined}>
        <IconoProveedores /> Proveed.
      </Link>
      <Link href="/clientes" className="tab" aria-current={activo(path, '/clientes') ? 'page' : undefined}>
        <IconoClientes /> Clientes
      </Link>
    </nav>
  );
}

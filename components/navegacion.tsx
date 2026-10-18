'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  IconoCalendario,
  IconoClientes,
  IconoMas,
  IconoMasMenu,
  IconoObjetivos,
  IconoPedidos,
  IconoProduccion,
  IconoProveedores,
  IconoShowroom,
  IconoTareas,
} from './iconos';

export const SECCIONES = [
  { href: '/pedidos', nombre: 'Pedidos', Icono: IconoPedidos },
  { href: '/produccion', nombre: 'Producción', Icono: IconoProduccion },
  { href: '/tareas', nombre: 'Tareas', Icono: IconoTareas },
  { href: '/calendario', nombre: 'Calendario', Icono: IconoCalendario },
  { href: '/showroom', nombre: 'Showroom', Icono: IconoShowroom },
  { href: '/objetivos', nombre: 'Objetivos', Icono: IconoObjetivos },
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
        <IconoMas /> Nuevo pedido
      </Link>
      {SECCIONES.map(({ href, nombre, Icono }) => (
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

const EN_BARRA = ['/pedidos', '/tareas', '/calendario'];

export function TabBar() {
  const path = usePathname();
  const enMas = !EN_BARRA.some((h) => activo(path, h)) && path !== '/pedidos/nuevo' && path !== '/';
  return (
    <nav className="tabbar" aria-label="Principal">
      <Link href="/pedidos" className="tab" aria-current={activo(path, '/pedidos') ? 'page' : undefined}>
        <IconoPedidos /> Pedidos
      </Link>
      <Link href="/tareas" className="tab" aria-current={activo(path, '/tareas') ? 'page' : undefined}>
        <IconoTareas /> Tareas
      </Link>
      <Link href="/pedidos/nuevo" className="tab tab-mas" aria-label="Nuevo pedido">
        <IconoMas /> Nuevo
      </Link>
      <Link href="/calendario" className="tab" aria-current={activo(path, '/calendario') ? 'page' : undefined}>
        <IconoCalendario /> Agenda
      </Link>
      <Link href="/mas" className="tab" aria-current={enMas ? 'page' : undefined}>
        <IconoMasMenu /> Más
      </Link>
    </nav>
  );
}

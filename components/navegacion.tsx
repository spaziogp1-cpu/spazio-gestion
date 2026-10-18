'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  IconoAjustes,
  IconoAvisos,
  IconoCalendario,
  IconoContenido,
  IconoInicio,
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
  { href: '/', nombre: 'Mi día', Icono: IconoInicio },
  { href: '/pedidos', nombre: 'Pedidos', Icono: IconoPedidos },
  { href: '/produccion', nombre: 'Producción', Icono: IconoProduccion },
  { href: '/tareas', nombre: 'Tareas', Icono: IconoTareas },
  { href: '/calendario', nombre: 'Calendario', Icono: IconoCalendario },
  { href: '/showroom', nombre: 'Showroom', Icono: IconoShowroom },
  { href: '/objetivos', nombre: 'Objetivos', Icono: IconoObjetivos },
  { href: '/proveedores', nombre: 'Proveedores', Icono: IconoProveedores },
  { href: '/clientes', nombre: 'Clientes', Icono: IconoClientes },
  { href: '/contenido', nombre: 'Contenido', Icono: IconoContenido },
  { href: '/avisos', nombre: 'Avisos', Icono: IconoAvisos },
  { href: '/ajustes', nombre: 'Ajustes', Icono: IconoAjustes },
];

function activo(path: string, href: string) {
  if (href === '/') return path === '/';
  if (href === '/pedidos') return path === '/pedidos' || (path.startsWith('/pedidos/') && path !== '/pedidos/nuevo');
  return path === href || path.startsWith(href + '/');
}

export function Sidebar({ nombre, avisos }: { nombre: string; avisos: number }) {
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
          {href === '/avisos' && avisos > 0 && <span className="insignia">{avisos > 99 ? '99+' : avisos}</span>}
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

const EN_BARRA = ['/', '/pedidos', '/tareas'];

export function TabBar({ avisos }: { avisos: number }) {
  const path = usePathname();
  const enMas = !EN_BARRA.some((h) => activo(path, h)) && path !== '/pedidos/nuevo';
  return (
    <nav className="tabbar" aria-label="Principal">
      <Link href="/" className="tab" aria-current={activo(path, '/') ? 'page' : undefined}>
        <IconoInicio /> Mi día
        {avisos > 0 && <span className="insignia">{avisos > 9 ? '9+' : avisos}</span>}
      </Link>
      <Link href="/pedidos" className="tab" aria-current={activo(path, '/pedidos') ? 'page' : undefined}>
        <IconoPedidos /> Pedidos
      </Link>
      <Link href="/pedidos/nuevo" className="tab tab-mas" aria-label="Nuevo pedido">
        <IconoMas /> Nuevo
      </Link>
      <Link href="/tareas" className="tab" aria-current={activo(path, '/tareas') ? 'page' : undefined}>
        <IconoTareas /> Tareas
      </Link>
      <Link href="/mas" className="tab" aria-current={enMas ? 'page' : undefined}>
        <IconoMasMenu /> Más
      </Link>
    </nav>
  );
}

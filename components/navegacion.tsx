'use client';

import Link from 'next/link';
import { BotonBuscar } from './boton-buscar';
import { Marca } from './marca';
import { SelectorTema } from './tema';
import { usePathname } from 'next/navigation';
import {
  IconoAjustes,
  IconoAvisos,
  IconoCalendario,
  IconoContenido,
  IconoEntregas,
  IconoCotizador,
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

// Cada sección tiene su color de vidrio (se usa en el menú y en "Más").
export const SECCIONES = [
  { href: '/', nombre: 'Mi día', Icono: IconoInicio, color: 'amarillo' },
  { href: '/pedidos', nombre: 'Pedidos', Icono: IconoPedidos, color: 'naranja' },
  { href: '/cotizador', nombre: 'Cotizador', Icono: IconoCotizador, color: 'violeta' },
  { href: '/produccion', nombre: 'Producción', Icono: IconoProduccion, color: 'rosa' },
  { href: '/entregas', nombre: 'Entregas', Icono: IconoEntregas, color: 'azul' },
  { href: '/tareas', nombre: 'Tareas', Icono: IconoTareas, color: 'violeta' },
  { href: '/calendario', nombre: 'Calendario', Icono: IconoCalendario, color: 'azul' },
  { href: '/showroom', nombre: 'Showroom', Icono: IconoShowroom, color: 'verde' },
  { href: '/objetivos', nombre: 'Objetivos', Icono: IconoObjetivos, color: 'rojo' },
  { href: '/proveedores', nombre: 'Proveedores', Icono: IconoProveedores, color: 'bronce' },
  { href: '/clientes', nombre: 'Clientes', Icono: IconoClientes, color: 'naranja' },
  { href: '/contenido', nombre: 'Contenido', Icono: IconoContenido, color: 'rosa' },
  { href: '/avisos', nombre: 'Avisos', Icono: IconoAvisos, color: 'amarillo' },
  { href: '/ajustes', nombre: 'Ajustes', Icono: IconoAjustes, color: 'gris' },
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
      <Link href="/" className="marca" aria-label="Spazio Gestión, Mi día">
        <Marca />
      </Link>
      <Link href="/pedidos/nuevo" className="btn btn-primario" style={{ marginBottom: 12 }}>
        <IconoMas /> Nuevo pedido
      </Link>
      <BotonBuscar />
      {SECCIONES.map(({ href, nombre, color }) => (
        <Link key={href} href={href} className="navlink" aria-current={activo(path, href) ? 'page' : undefined}>
          <span className="punto-seccion" style={{ background: `var(--c-${color})` }} aria-hidden="true" /> {nombre}
          {href === '/avisos' && avisos > 0 && <span className="insignia">{avisos > 99 ? '99+' : avisos}</span>}
        </Link>
      ))}
      <div className="pie">
        <SelectorTema />
        <div style={{ marginTop: 10 }}>{nombre}</div>
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

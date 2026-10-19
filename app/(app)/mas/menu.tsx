'use client';

import Link from 'next/link';
import { SECCIONES } from '@/components/navegacion';

export default function MenuMas() {
  return (
    <>
      <div className="cabecera">
        <h1>Secciones</h1>
      </div>
      <div className="menu-mas">
        {SECCIONES.map(({ href, nombre, Icono, color }) => (
          <Link key={href} href={href} className={`card menu-mas-item vidrio-${color}`}>
            <Icono />
            <span>{nombre}</span>
          </Link>
        ))}
      </div>
      <form action="/auth/salir" method="post" style={{ marginTop: 20 }}>
        <button className="btn btn-bloque">Salir</button>
      </form>
    </>
  );
}

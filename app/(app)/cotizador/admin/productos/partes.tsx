'use client';

import { startTransition, useActionState } from 'react';
import { crearProducto, guardarProducto, type EstadoProducto } from './actions';

type Categoria = { id: string; nombre: string };

function enviar(accion: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => accion(fd));
  };
}

export function FormNuevoProducto({ categorias }: { categorias: Categoria[] }) {
  const [estado, accion, guardando] = useActionState<EstadoProducto, FormData>(crearProducto, {});
  return (
    <form onSubmit={enviar(accion)} className="form-bloque">
      <div className="campo">
        <label htmlFor="np-nombre">Nombre</label>
        <input id="np-nombre" name="nombre" type="text" placeholder="Mesa Luna" required />
      </div>
      <div className="fila fila-2">
        <div className="campo">
          <label htmlFor="np-cat">Categoría</label>
          <select id="np-cat" name="categoria_id" defaultValue={categorias[0]?.id ?? ''}>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="np-margen">Margen fijo (%) <span className="quiet">opcional</span></label>
          <input id="np-margen" name="margen" type="number" step="0.5" min={0} max={94} placeholder="Se pone en el presupuesto" />
        </div>
      </div>
      <p className="small quiet">Precio = costo ÷ (1 − margen). Con 45%, un costo de $100 da $182.</p>
      {estado.error && <p className="error-form">{estado.error}</p>}
      <div>
        <button className="btn btn-primario btn-chico" disabled={guardando}>
          {guardando ? 'Creando…' : 'Crear y armar la receta'}
        </button>
      </div>
    </form>
  );
}

export function FormProducto({
  producto,
  categorias,
  margen,
}: {
  producto: { id: string; nombre: string; categoria_id: string | null; descripcion: string | null; foto_url: string | null; tiendanube_url: string | null; activo: boolean };
  categorias: Categoria[];
  margen: number | null;
}) {
  const [estado, accion, guardando] = useActionState<EstadoProducto, FormData>(guardarProducto.bind(null, producto.id), {});
  return (
    <form onSubmit={enviar(accion)} className="form-bloque">
      <div className="campo">
        <label htmlFor="p-nombre">Nombre</label>
        <input id="p-nombre" name="nombre" type="text" defaultValue={producto.nombre} required />
      </div>
      <div className="fila fila-2">
        <div className="campo">
          <label htmlFor="p-cat">Categoría</label>
          <select id="p-cat" name="categoria_id" defaultValue={producto.categoria_id ?? ''}>
            <option value="">Sin categoría</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="p-margen">Margen fijo (%) <span className="quiet">opcional</span></label>
          <input id="p-margen" name="margen" type="number" step="0.5" min={0} max={94} defaultValue={margen != null ? Math.round(margen * 1000) / 10 : ''} placeholder="Se pone en el presupuesto" />
          <span className="ayuda">Se aplica enseguida, sin publicar.</span>
        </div>
      </div>
      <div className="campo">
        <label htmlFor="p-desc">Descripción para el cliente</label>
        <textarea id="p-desc" name="descripcion" defaultValue={producto.descripcion ?? ''} placeholder="Mesa ratona de vidrio pegado con UV…" />
      </div>
      <div className="campo">
        <label htmlFor="p-foto">Foto (link https)</label>
        <input id="p-foto" name="foto_url" type="text" defaultValue={producto.foto_url ?? ''} placeholder="https://…" />
      </div>
      <div className="campo">
        <label htmlFor="p-tn">Link en la tienda</label>
        <input id="p-tn" name="tiendanube_url" type="text" defaultValue={producto.tiendanube_url ?? ''} placeholder="https://spaziodesign.net/productos/…" />
      </div>
      <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="checkbox" name="activo" defaultChecked={producto.activo} /> Se puede cotizar
      </label>
      {estado.error && <p className="error-form">{estado.error}</p>}
      <div className="acciones" style={{ alignItems: 'center' }}>
        <button className="btn btn-primario btn-chico" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        {estado.ok && <span className="small" style={{ color: 'var(--ok)' }}>{estado.ok}</span>}
      </div>
    </form>
  );
}

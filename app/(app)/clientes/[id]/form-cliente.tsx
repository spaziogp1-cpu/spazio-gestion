'use client';

import { startTransition, useActionState } from 'react';
import type { Cliente } from '@/lib/tipos';
import { actualizarCliente, type EstadoCliente } from '../actions';

const CAMPOS: { name: keyof Cliente; label: string; type?: string; inputMode?: 'tel' | 'email' | 'numeric' }[] = [
  { name: 'nombre', label: 'Nombre' },
  { name: 'telefono', label: 'Teléfono', type: 'tel', inputMode: 'tel' },
  { name: 'email', label: 'Email', type: 'email', inputMode: 'email' },
  { name: 'dni', label: 'DNI', inputMode: 'numeric' },
  { name: 'direccion', label: 'Dirección' },
  { name: 'localidad', label: 'Localidad' },
  { name: 'codigo_postal', label: 'Código postal', inputMode: 'numeric' },
];

export default function FormCliente({ cliente }: { cliente: Cliente }) {
  const [estado, accion, guardando] = useActionState<EstadoCliente, FormData>(actualizarCliente.bind(null, cliente.id), {});
  return (
    <section className="card card-pad">
      <form
        className="form-bloque"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => accion(fd));
        }}
      >
        <h2>Datos</h2>
        {CAMPOS.map((c) => (
          <div key={c.name} className="campo">
            <label htmlFor={`c_${c.name}`}>{c.label}</label>
            <input
              id={`c_${c.name}`}
              name={c.name}
              type={c.type ?? 'text'}
              inputMode={c.inputMode}
              defaultValue={(cliente[c.name] as string | null) ?? ''}
              required={c.name === 'nombre'}
            />
          </div>
        ))}
        <div className="campo">
          <label htmlFor="c_notas">Notas</label>
          <textarea id="c_notas" name="notas" defaultValue={cliente.notas ?? ''} />
        </div>
        {estado.error && <p className="error-form">{estado.error}</p>}
        {estado.ok && <p className="aviso aviso-ok">{estado.ok}</p>}
        <button className="btn btn-primario" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
    </section>
  );
}

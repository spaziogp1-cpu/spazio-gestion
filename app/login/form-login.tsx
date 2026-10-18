'use client';

import { useActionState } from 'react';
import { pedirLink, verificarCodigo, type EstadoCodigo, type EstadoLogin } from './actions';

export default function FormLogin() {
  const [estado, accion, enviando] = useActionState<EstadoLogin, FormData>(pedirLink, {});
  const [estadoCod, accionCod, verificando] = useActionState<EstadoCodigo, FormData>(verificarCodigo, {});

  if (estado.ok) {
    return (
      <div className="form-bloque">
        <h1>Revisá tu email</h1>
        <p className="quiet">
          Te mandamos un link a <strong>{estado.email}</strong>. Tocalo para entrar, o escribí acá el código de 6 dígitos que viene en el
          mismo email.
        </p>
        <form action={accionCod} className="form-bloque">
          <input type="hidden" name="email" value={estado.email} />
          <div className="campo">
            <label htmlFor="codigo">Código</label>
            <input
              id="codigo"
              name="codigo"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]*"
              maxLength={8}
              className="mono"
              required
              autoFocus
            />
          </div>
          {estadoCod.error && <p className="error-form">{estadoCod.error}</p>}
          <button className="btn btn-primario btn-bloque" disabled={verificando}>
            {verificando ? 'Verificando…' : 'Entrar'}
          </button>
        </form>
        <p className="faint small">Si no llega en un par de minutos, mirá en Spam.</p>
      </div>
    );
  }

  return (
    <form action={accion} className="form-bloque">
      <h1>Ingresar</h1>
      <p className="quiet small">Te mandamos un link y un código a tu email, sin contraseña.</p>
      <div className="campo">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={estado.email} autoFocus />
      </div>
      {estado.error && <p className="error-form">{estado.error}</p>}
      <button className="btn btn-primario btn-bloque" disabled={enviando}>
        {enviando ? 'Enviando…' : 'Mandarme el link'}
      </button>
    </form>
  );
}

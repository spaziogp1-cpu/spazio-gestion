'use client';

import { useActionState, useState } from 'react';
import { entrarConContrasena, pedirLink, verificarCodigo, type EstadoCodigo, type EstadoLogin } from './actions';

export default function FormLogin() {
  const [estado, accion, enviando] = useActionState<EstadoLogin, FormData>(pedirLink, {});
  const [estadoCod, accionCod, verificando] = useActionState<EstadoCodigo, FormData>(verificarCodigo, {});
  const [estadoPass, accionPass, entrando] = useActionState<EstadoLogin, FormData>(entrarConContrasena, {});
  const [conCodigo, setConCodigo] = useState(false);

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

  if (!conCodigo)
    return (
      <form action={accionPass} className="form-bloque">
        <h1>Ingresar</h1>
        <div className="campo">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="username" inputMode="email" required defaultValue={estadoPass.email} />
        </div>
        <div className="campo">
          <label htmlFor="password">Contraseña</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {estadoPass.error && <p className="error-form">{estadoPass.error}</p>}
        <button className="btn btn-primario btn-bloque" disabled={entrando}>
          {entrando ? 'Entrando…' : 'Entrar'}
        </button>
        <button type="button" className="btn btn-fantasma btn-bloque" onClick={() => setConCodigo(true)}>
          No tengo contraseña: entrar con un código por email
        </button>
      </form>
    );

  return (
    <form action={accion} className="form-bloque">
      <h1>Ingresar</h1>
      <p className="quiet small">Te mandamos un link y un código a tu email. Después podés crear tu contraseña en Ajustes.</p>
      <div className="campo">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={estado.email} autoFocus />
      </div>
      {estado.error && <p className="error-form">{estado.error}</p>}
      <button className="btn btn-primario btn-bloque" disabled={enviando}>
        {enviando ? 'Enviando…' : 'Mandarme el código'}
      </button>
      <button type="button" className="btn btn-fantasma btn-bloque" onClick={() => setConCodigo(false)}>
        Entrar con contraseña
      </button>
    </form>
  );
}

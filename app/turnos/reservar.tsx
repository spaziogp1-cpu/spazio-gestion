'use client';

import { useActionState, useState } from 'react';
import { fechaCorta, fechaLarga, type Horario } from '@/lib/turnos';
import { reservarTurno, type EstadoTurno } from './actions';

export function Reservar({
  dias,
  reemplaza,
  previo,
}: {
  dias: [string, Horario[]][];
  reemplaza?: string;
  previo?: { nombre: string; telefono: string; email: string | null };
}) {
  const [dia, setDia] = useState(dias[0][0]);
  const [hora, setHora] = useState<string | null>(null);
  const [estado, accion, enviando] = useActionState<EstadoTurno, FormData>(reservarTurno, {});
  const horas = dias.find(([d]) => d === dia)?.[1] ?? [];
  const manana = horas.filter((h) => h.hora < '13:00');
  const tarde = horas.filter((h) => h.hora >= '13:00');

  return (
    <form action={accion} className="form-bloque">
      <div className="campo">
        <span className="etiqueta">1. Elegí el día</span>
        <div className="turnos-dias" role="radiogroup" aria-label="Día">
          {dias.map(([d]) => {
            const c = fechaCorta(d);
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={d === dia}
                className={`turnos-dia${d === dia ? ' activo' : ''}`}
                onClick={() => {
                  setDia(d);
                  setHora(null);
                }}
              >
                <span className="turnos-dia-nombre">{c.dia}</span>
                <span className="turnos-dia-numero">{c.numero}</span>
                <span className="turnos-dia-mes">{c.mes}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="campo">
        <span className="etiqueta">2. Elegí el horario · {fechaLarga(dia)}</span>
        {[
          ['Mañana', manana],
          ['Tarde', tarde],
        ].map(([nombre, hs]) =>
          (hs as Horario[]).length ? (
            <div key={nombre as string}>
              <span className="quiet small">{nombre as string}</span>
              <div className="turnos-horas" role="radiogroup" aria-label={`Horarios de la ${String(nombre).toLowerCase()}`}>
                {(hs as Horario[]).map((h) => (
                  <button
                    key={h.hora}
                    type="button"
                    role="radio"
                    aria-checked={h.hora === hora}
                    className={`turnos-hora${h.hora === hora ? ' activo' : ''}`}
                    onClick={() => setHora(h.hora)}
                  >
                    {h.hora}
                  </button>
                ))}
              </div>
            </div>
          ) : null,
        )}
      </div>

      {hora && (
        <div className="form-bloque turnos-datos">
          <span className="etiqueta">3. Tus datos</span>
          <input type="hidden" name="fecha" value={dia} />
          <input type="hidden" name="hora" value={hora} />
          {reemplaza && <input type="hidden" name="reemplaza" value={reemplaza} />}
          <input type="text" name="sitio" tabIndex={-1} autoComplete="off" className="turnos-trampa" aria-hidden="true" />
          <div className="campo">
            <label htmlFor="t-nombre">Nombre y apellido</label>
            <input id="t-nombre" name="nombre" required minLength={2} autoComplete="name" defaultValue={previo?.nombre} />
          </div>
          <div className="campo">
            <label htmlFor="t-tel">WhatsApp</label>
            <input id="t-tel" name="telefono" type="tel" required inputMode="tel" autoComplete="tel" placeholder="11 5555-1234" defaultValue={previo?.telefono} />
          </div>
          <div className="campo">
            <label htmlFor="t-email">
              Email <span className="quiet">(opcional)</span>
            </label>
            <input id="t-email" name="email" type="email" autoComplete="email" defaultValue={previo?.email ?? ''} />
          </div>
          <div className="campo">
            <label htmlFor="t-motivo">
              ¿Qué te gustaría ver? <span className="quiet">(opcional)</span>
            </label>
            <textarea id="t-motivo" name="motivo" rows={2} placeholder="Una mesa ratona, espejos de colores, una medida especial…" />
          </div>
          {estado.error && <p className="error-form">{estado.error}</p>}
          <button className="btn btn-primario" disabled={enviando}>
            {enviando ? 'Reservando…' : `Reservar el ${fechaLarga(dia)} a las ${hora}`}
          </button>
        </div>
      )}
    </form>
  );
}

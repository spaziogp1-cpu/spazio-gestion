'use client';

import { useActionState, useState } from 'react';
import { TarjetaGift } from '@/components/tarjeta-gift';
import { errorMonto, fechaAR, fechaVencimiento, GC_DEDICATORIA_MAX, GC_MONTOS_SUGERIDOS, GC_OCASIONES, GC_REVISION_DESDE, fraseOcasion } from '@/lib/giftcard';
import { pedirGiftCard, type EstadoGift } from './actions';

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`;
const soloNumero = (t: string) => Number(t.replace(/\D/g, '')) || 0;

export function Comprar({ hoy, maxInicio }: { hoy: string; maxInicio: string }) {
  const [elegido, setElegido] = useState<number | 'otro'>(500_000);
  const [otro, setOtro] = useState('');
  const [ocasion, setOcasion] = useState('sin_ocasion');
  const [para, setPara] = useState('');
  const [de, setDe] = useState('');
  const [dedicatoria, setDedicatoria] = useState('');
  const [inicio, setInicio] = useState(hoy);
  const [estado, accion, enviando] = useActionState<EstadoGift, FormData>(pedirGiftCard, {});

  const monto = elegido === 'otro' ? soloNumero(otro) : elegido;
  const errMonto = elegido === 'otro' && otro ? errorMonto(monto) : null;
  const montoOk = monto > 0 && !errorMonto(monto);
  const vence = fechaVencimiento(inicio >= hoy ? inicio : hoy, hoy);

  return (
    <form action={accion} className="form-bloque">
      <TarjetaGift monto={montoOk ? pesos(monto) : undefined} frase={fraseOcasion(ocasion)} para={para.trim() || undefined} de={de.trim() || undefined} />

      <div className="turnos-paso">
        <span className="etiqueta">1. Elegí el monto</span>
        <div className="gc-montos" role="radiogroup" aria-label="Monto">
          {GC_MONTOS_SUGERIDOS.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={elegido === m} className="gc-monto-btn" onClick={() => setElegido(m)}>
              {pesos(m)}
            </button>
          ))}
          <button type="button" role="radio" aria-checked={elegido === 'otro'} className="gc-monto-btn" onClick={() => setElegido('otro')}>
            Otro monto
          </button>
        </div>
        {elegido === 'otro' && (
          <div className="campo">
            <label htmlFor="g-otro">Monto en pesos</label>
            <input
              id="g-otro"
              inputMode="numeric"
              placeholder="Desde $50.000, de a $10.000"
              value={otro}
              onChange={(e) => {
                const n = soloNumero(e.target.value);
                setOtro(n ? n.toLocaleString('es-AR') : '');
              }}
              aria-describedby="g-otro-ayuda"
              autoFocus
            />
            <span id="g-otro-ayuda" className={errMonto ? 'error-form' : 'ayuda'}>
              {errMonto ?? 'Mínimo $50.000, en múltiplos de $10.000. No hay máximo.'}
            </span>
          </div>
        )}
        {montoOk && monto >= GC_REVISION_DESDE && <p className="ayuda small quiet">Para montos desde $3.000.000 revisamos el pedido antes de pasarte los datos de pago.</p>}
        <input type="hidden" name="monto" value={montoOk ? String(monto) : ''} />
      </div>

      <div className="turnos-paso">
        <span className="etiqueta">
          2. ¿Para qué ocasión? <span className="quiet">(opcional)</span>
        </span>
        <div className="gc-ocasiones" role="radiogroup" aria-label="Ocasión">
          {GC_OCASIONES.map((o) => (
            <button key={o.clave} type="button" role="radio" aria-checked={ocasion === o.clave} className="chip-opcion" onClick={() => setOcasion(o.clave)}>
              {o.nombre}
            </button>
          ))}
        </div>
        <input type="hidden" name="ocasion" value={ocasion} />
      </div>

      <div className="turnos-paso turnos-datos">
        <span className="etiqueta">3. ¿Para quién es?</span>
        <div className="campo">
          <label htmlFor="g-para">Nombre</label>
          <input id="g-para" name="para_nombre" required minLength={2} maxLength={80} value={para} onChange={(e) => setPara(e.target.value)} placeholder="Lucía" />
        </div>
        <div className="fila-2">
          <div className="campo">
            <label htmlFor="g-para-email">Email</label>
            <input id="g-para-email" name="para_email" type="email" autoComplete="off" />
          </div>
          <div className="campo">
            <label htmlFor="g-para-tel">WhatsApp</label>
            <input id="g-para-tel" name="para_telefono" type="tel" inputMode="tel" autoComplete="off" placeholder="11 5555-1234" />
          </div>
        </div>
        <span className="ayuda small quiet">Con uno de los dos alcanza: ahí le mandamos la tarjeta.</span>
      </div>

      <div className="turnos-paso turnos-datos">
        <span className="etiqueta">4. Tu mensaje</span>
        <div className="campo">
          <label htmlFor="g-de">De parte de</label>
          <input id="g-de" name="de_nombre" required minLength={2} maxLength={80} value={de} onChange={(e) => setDe(e.target.value)} placeholder="Ana y Martín" />
        </div>
        <div className="campo">
          <label htmlFor="g-ded">
            Dedicatoria <span className="quiet">(opcional)</span>
          </label>
          <textarea
            id="g-ded"
            name="dedicatoria"
            rows={3}
            maxLength={GC_DEDICATORIA_MAX}
            value={dedicatoria}
            onChange={(e) => setDedicatoria(e.target.value)}
            placeholder="Para que elijan algo hecho a su medida. ¡Felicidades por esta nueva etapa!"
          />
          <span className="gc-contador">
            {dedicatoria.length}/{GC_DEDICATORIA_MAX}
          </span>
        </div>
        <div className="campo">
          <label htmlFor="g-inicio">¿Desde cuándo vale?</label>
          <input id="g-inicio" name="fecha_inicio" type="date" min={hoy} max={maxInicio} value={inicio} onChange={(e) => setInicio(e.target.value || hoy)} />
          <span className="ayuda">
            Tiene 3 meses desde esa fecha para hacer su pedido (hasta el {fechaAR(vence)}). Si la transferencia se acredita después, los 3 meses cuentan desde ese día. Podés elegir hasta 60 días adelante.
          </span>
        </div>
      </div>

      <div className="turnos-paso turnos-datos">
        <span className="etiqueta">5. Tus datos</span>
        <input type="text" name="sitio" tabIndex={-1} autoComplete="off" className="turnos-trampa" aria-hidden="true" />
        <div className="campo">
          <label htmlFor="g-comp">Nombre y apellido</label>
          <input id="g-comp" name="comprador_nombre" required minLength={2} autoComplete="name" />
        </div>
        <div className="fila-2">
          <div className="campo">
            <label htmlFor="g-comp-tel">WhatsApp</label>
            <input id="g-comp-tel" name="comprador_telefono" type="tel" required inputMode="tel" autoComplete="tel" placeholder="11 5555-1234" />
          </div>
          <div className="campo">
            <label htmlFor="g-comp-email">Email</label>
            <input id="g-comp-email" name="comprador_email" type="email" required autoComplete="email" />
          </div>
        </div>
        {montoOk && (
          <div className="gc-resumen" aria-live="polite">
            <div>
              <span>Gift card{para.trim() ? ` para ${para.trim()}` : ''}</span>
              <strong>{pesos(monto)}</strong>
            </div>
            <div className="quiet small">
              <span>Se paga por transferencia. Te escribimos por WhatsApp con los datos.</span>
            </div>
          </div>
        )}
        {estado.error && <p className="error-form">{estado.error}</p>}
        <button className="btn btn-primario" disabled={enviando || !montoOk}>
          {enviando ? 'Enviando…' : montoOk ? `Pedir gift card de ${pesos(monto)}` : 'Elegí un monto'}
        </button>
      </div>
    </form>
  );
}

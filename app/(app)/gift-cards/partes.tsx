'use client';

import { useActionState, useState, useTransition } from 'react';
import { TarjetaGift } from '@/components/tarjeta-gift';
import { fechaAR, linkWhatsAppTexto, mensajePago, nombreOcasion } from '@/lib/giftcard';
import { canjear, cancelarSolicitud, emitirGiftCard, guardarDatosPago, marcarRevisada, nuevoCodigo, prorrogar, reintegrar, type Emitida, type EstadoGC } from './actions';

export type Solicitud = {
  id: string;
  numero: number;
  estado: 'pendiente_pago' | 'en_revision' | 'emitida' | 'cancelada';
  monto: number;
  ocasion: string;
  para_nombre: string;
  para_email: string | null;
  para_telefono: string | null;
  de_nombre: string;
  dedicatoria: string | null;
  comprador_nombre: string;
  comprador_email: string;
  comprador_telefono: string;
  fecha_inicio: string;
  motivo_cancelacion: string | null;
  creado_en: string;
};

export type Tarjeta = {
  id: string;
  codigo_visible: string;
  monto_inicial: number;
  saldo: number;
  ocasion: string;
  para_nombre: string;
  para_email: string | null;
  para_telefono: string | null;
  de_nombre: string;
  inicio: string;
  vence: string;
  prorrogada: boolean;
  estado: 'activa' | 'anulada';
};

const pesos = (n: number) => `$${Math.round(Number(n)).toLocaleString('es-AR')}`;
const ESTADO_SOL: Record<Solicitud['estado'], string> = {
  pendiente_pago: 'Esperando transferencia',
  en_revision: 'En revisión (monto alto)',
  emitida: 'Emitida',
  cancelada: 'Cancelada',
};

function horasDesde(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
}

async function copiar(textoACopiar: string) {
  try {
    await navigator.clipboard.writeText(textoACopiar);
    return true;
  } catch {
    window.prompt('Copiá el texto', textoACopiar);
    return false;
  }
}

// ---------------------------------------------------------------------
// Código recién emitido: se ve una sola vez
// ---------------------------------------------------------------------
function CodigoEmitido({ e }: { e: Emitida }) {
  const [copiado, setCopiado] = useState('');
  return (
    <div className="form-bloque" style={{ marginTop: 8 }}>
      <p className="small">
        <strong>Código de {e.para}</strong> · se ve solo ahora: guardalo o mandalo ya.
      </p>
      <div className="gc-codigo-nuevo">{e.codigo}</div>
      <p className="small quiet">
        {e.email.enviado
          ? `Le mandamos el correo a ${e.email.a}.`
          : e.email.a
            ? `No se pudo mandar el correo a ${e.email.a}${e.email.error ? ` (${e.email.error})` : ''}. Mandáselo por WhatsApp.`
            : 'No dejó email: mandáselo por WhatsApp.'}{' '}
        Vale hasta el {fechaAR(e.vence)}.
      </p>
      <div className="acciones">
        {e.whatsapp && (
          <a className="btn btn-primario btn-chico" href={e.whatsapp} target="_blank" rel="noopener noreferrer">
            Mandar por WhatsApp
          </a>
        )}
        <button type="button" className="btn btn-chico" onClick={async () => setCopiado((await copiar(e.mensaje)) ? 'mensaje' : '')}>
          {copiado === 'mensaje' ? '¡Copiado!' : 'Copiar mensaje'}
        </button>
        <button type="button" className="btn btn-chico" onClick={async () => setCopiado((await copiar(e.codigo)) ? 'codigo' : '')}>
          {copiado === 'codigo' ? '¡Copiado!' : 'Copiar código'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Un pedido de gift card
// ---------------------------------------------------------------------
export function FilaSolicitud({ s, pago, esAdmin, hoy }: { s: Solicitud; pago: Record<string, string>; esAdmin: boolean; hoy: string }) {
  const [confirmar, setConfirmar] = useState(false);
  const [estado, accion, emitiendo] = useActionState<EstadoGC, FormData>(emitirGiftCard.bind(null, s.id), {});
  const [pendiente, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const referencia = `GC-${s.numero}`;
  const abierta = s.estado === 'pendiente_pago' || s.estado === 'en_revision';
  const horas = horasDesde(s.creado_en);
  const waPago = linkWhatsAppTexto(
    s.comprador_telefono,
    mensajePago({ comprador: s.comprador_nombre.split(' ')[0], referencia, monto: s.monto, para: s.para_nombre, alias: pago.gc_alias ?? '', cbu: pago.gc_cbu ?? '', titular: pago.gc_titular ?? '' }),
  );
  const waRecordatorio = linkWhatsAppTexto(
    s.comprador_telefono,
    `¡Hola, ${s.comprador_nombre.split(' ')[0]}! Te recordamos tu gift card ${referencia} por ${pesos(s.monto)} para ${s.para_nombre}. Si ya transferiste, mandanos el comprobante por acá. Guardamos el pedido hasta mañana.`,
  );

  return (
    <div className="gc-fila">
      <div className="gc-fila-cab">
        <span>
          <strong>{referencia}</strong> · {pesos(s.monto)} · para {s.para_nombre}
        </span>
        <span className={`gc-estado gc-estado-${s.estado}`}>{ESTADO_SOL[s.estado]}</span>
      </div>
      <span className="small quiet">
        Compra {s.comprador_nombre} · {s.comprador_telefono} · {s.comprador_email}
        <br />
        Recibe {[s.para_email, s.para_telefono].filter(Boolean).join(' · ')} · De {s.de_nombre}
        {s.ocasion !== 'sin_ocasion' && ` · ${nombreOcasion(s.ocasion)}`}
        {s.fecha_inicio > hoy && ` · Vale desde el ${fechaAR(s.fecha_inicio)}`}
      </span>
      {s.dedicatoria && <span className="small">“{s.dedicatoria}”</span>}
      {abierta && (
        <span className={`small ${horas >= 72 ? 'error-form' : horas >= 48 ? 'quiet' : 'quiet'}`} style={horas >= 72 ? { padding: '6px 10px' } : undefined}>
          Pedido hace {horas < 1 ? 'menos de 1 hora' : horas < 48 ? `${horas} h` : `${Math.floor(horas / 24)} días`}
          {horas >= 72 ? ' · pasaron 72 horas: si no transfirió, cancelalo.' : horas >= 48 ? ' · mandale un recordatorio.' : ''}
        </span>
      )}
      {s.estado === 'cancelada' && s.motivo_cancelacion && <span className="small quiet">Motivo: {s.motivo_cancelacion}</span>}

      {abierta && (
        <div className="acciones">
          {s.estado === 'en_revision' ? (
            <button type="button" className="btn btn-chico" disabled={pendiente} onClick={() => startTransition(async () => setMsg((await marcarRevisada(s.id)).error ?? null))}>
              Ya lo revisé: pasar a cobrar
            </button>
          ) : (
            waPago && (
              <a className="btn btn-chico" href={waPago} target="_blank" rel="noopener noreferrer">
                Mandar datos de pago
              </a>
            )
          )}
          {horas >= 48 && waRecordatorio && s.estado === 'pendiente_pago' && (
            <a className="btn btn-chico" href={waRecordatorio} target="_blank" rel="noopener noreferrer">
              Recordatorio
            </a>
          )}
          {esAdmin && s.estado === 'pendiente_pago' && !estado.emitida && (
            <button type="button" className="btn btn-primario btn-chico" onClick={() => setConfirmar((c) => !c)}>
              Confirmar transferencia
            </button>
          )}
          <button
            type="button"
            className="btn btn-fantasma btn-chico btn-peligro"
            disabled={pendiente}
            onClick={() => {
              const motivo = window.prompt(`¿Cancelar ${referencia}? Podés escribir el motivo (opcional):`, horas >= 72 ? 'No transfirió en 72 horas' : '');
              if (motivo === null) return;
              startTransition(async () => setMsg((await cancelarSolicitud(s.id, motivo)).error ?? null));
            }}
          >
            Cancelar
          </button>
        </div>
      )}

      {confirmar && !estado.emitida && (
        <form action={accion} className="form-bloque card card-pad" style={{ marginTop: 6 }}>
          <div className="campo">
            <label htmlFor={`acr-${s.id}`}>Fecha en que se acreditó</label>
            <input id={`acr-${s.id}`} name="acreditada" type="date" defaultValue={hoy} max={hoy} required />
          </div>
          <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <input type="checkbox" name="verificado" value="1" required />
            <span>
              Vi en el home banking que se acreditaron <strong>{pesos(s.monto)}</strong> con la referencia {referencia}. (El comprobante solo no alcanza.)
            </span>
          </label>
          {estado.error && <p className="error-form">{estado.error}</p>}
          <div className="acciones">
            <button className="btn btn-primario btn-chico" disabled={emitiendo}>
              {emitiendo ? 'Emitiendo…' : 'Emitir y mandar la gift card'}
            </button>
            <button type="button" className="btn btn-fantasma btn-chico" onClick={() => setConfirmar(false)}>
              Volver
            </button>
          </div>
        </form>
      )}
      {estado.emitida && <CodigoEmitido e={estado.emitida} />}
      {msg && <p className="error-form">{msg}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------
// Una tarjeta emitida
// ---------------------------------------------------------------------
export function FilaTarjeta({ t, esAdmin, hoy }: { t: Tarjeta; esAdmin: boolean; hoy: string }) {
  const [pendiente, startTransition] = useTransition();
  const [res, setRes] = useState<EstadoGC>({});
  const [reint, setReint] = useState(false);
  const [estadoR, accionR, reintegrando] = useActionState<EstadoGC, FormData>(reintegrar.bind(null, t.id), {});
  const vencida = t.vence < hoy;
  const puedeProrrogar = !t.prorrogada && vencida && hoy <= sumar30(t.vence);
  const estadoTxt = t.estado === 'anulada' ? 'Anulada' : vencida ? 'Vencida' : Number(t.saldo) <= 0 ? 'Sin saldo' : t.inicio > hoy ? `Desde el ${fechaAR(t.inicio)}` : 'Activa';

  return (
    <div className="gc-fila">
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div className="gc-mini">
          <TarjetaGift chica />
        </div>
        <div style={{ display: 'grid', gap: 4, minWidth: 0, flex: 1 }}>
          <div className="gc-fila-cab">
            <span>
              <strong>{pesos(t.saldo)}</strong> <span className="small quiet">de {pesos(t.monto_inicial)}</span>
            </span>
            <span className={`gc-estado gc-estado-${estadoTxt === 'Activa' ? 'activa' : vencida ? 'vencida' : 'usada'}`}>{estadoTxt}</span>
          </div>
          <span className="small">
            Para {t.para_nombre} · de {t.de_nombre}
          </span>
          <span className="small quiet">
            <span style={{ fontFamily: 'var(--mono)' }}>{t.codigo_visible}</span> · vence {fechaAR(t.vence)}
            {t.prorrogada && ' (prorrogada)'}
          </span>
          <div className="acciones">
            {puedeProrrogar && (
              <button type="button" className="btn btn-chico" disabled={pendiente} onClick={() => startTransition(async () => setRes(await prorrogar(t.id)))}>
                Prorrogar 30 días
              </button>
            )}
            {esAdmin && (
              <button
                type="button"
                className="btn btn-fantasma btn-chico"
                disabled={pendiente}
                onClick={() => {
                  if (!window.confirm('Se genera un código nuevo y el anterior deja de servir. ¿Seguimos?')) return;
                  startTransition(async () => setRes(await nuevoCodigo(t.id)));
                }}
              >
                Reenviar con código nuevo
              </button>
            )}
            {esAdmin && (
              <button type="button" className="btn btn-fantasma btn-chico" onClick={() => setReint((r) => !r)}>
                Reintegrar saldo
              </button>
            )}
          </div>
          {reint && (
            <form action={accionR} className="form-bloque">
              <div className="fila-2m">
                <div className="campo">
                  <label htmlFor={`re-m-${t.id}`}>Monto</label>
                  <input id={`re-m-${t.id}`} name="monto" inputMode="numeric" required />
                </div>
                <div className="campo">
                  <label htmlFor={`re-n-${t.id}`}>Motivo</label>
                  <input id={`re-n-${t.id}`} name="nota" placeholder="Pedido cancelado" />
                </div>
              </div>
              <button className="btn btn-chico" disabled={reintegrando}>
                Reintegrar
              </button>
              {estadoR.error && <p className="error-form">{estadoR.error}</p>}
              {estadoR.ok && <p className="aviso aviso-ok">{estadoR.ok}</p>}
            </form>
          )}
          {res.error && <p className="error-form">{res.error}</p>}
          {res.ok && !res.emitida && <p className="aviso aviso-ok">{res.ok}</p>}
          {res.emitida && <CodigoEmitido e={res.emitida} />}
        </div>
      </div>
    </div>
  );
}

function sumar30(fecha: string) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------
// Descontar saldo al cerrar un pedido
// ---------------------------------------------------------------------
export function Canjear() {
  const [clave, setClave] = useState(() => crypto.randomUUID());
  const [estado, accion, guardando] = useActionState<EstadoGC, FormData>(async (prev: EstadoGC, fd: FormData) => {
    const r = await canjear(prev, fd);
    if (r.ok) setClave(crypto.randomUUID());
    return r;
  }, {});
  return (
    <form action={accion} className="form-bloque">
      <input type="hidden" name="clave" value={clave} />
      <div className="campo">
        <label htmlFor="cj-codigo">Código de la gift card</label>
        <input id="cj-codigo" name="codigo" placeholder="SPZ-XXXX-XXXX" autoCapitalize="characters" autoComplete="off" required />
      </div>
      <div className="fila-2m">
        <div className="campo">
          <label htmlFor="cj-monto">Monto a descontar</label>
          <input id="cj-monto" name="monto" inputMode="numeric" placeholder="$" required />
        </div>
        <div className="campo">
          <label htmlFor="cj-pedido">
            N.º de pedido <span className="quiet">(opcional)</span>
          </label>
          <input id="cj-pedido" name="pedido" inputMode="numeric" />
        </div>
      </div>
      <div className="campo">
        <label htmlFor="cj-nota">Nota</label>
        <input id="cj-nota" name="nota" placeholder="Qué se compró" />
      </div>
      <span className="ayuda small quiet">Pedile a quien la usa que te confirme el código. Se pueden usar hasta 3 gift cards por pedido.</span>
      {estado.error && <p className="error-form">{estado.error}</p>}
      {estado.ok && (
        <p className="aviso aviso-ok">
          {estado.ok} Queda {pesos(estado.saldo ?? 0)}.
        </p>
      )}
      <button className="btn btn-primario" disabled={guardando}>
        {guardando ? 'Descontando…' : 'Descontar saldo'}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------
// Datos de pago y WhatsApp (los usa el mensaje "Mandar datos de pago")
// ---------------------------------------------------------------------
export function DatosPago({ valores, esAdmin }: { valores: Record<string, string>; esAdmin: boolean }) {
  const [estado, accion, guardando] = useActionState<EstadoGC, FormData>(guardarDatosPago, {});
  return (
    <form action={accion} className="form-bloque">
      <div className="campo">
        <label htmlFor="dp-alias">Alias</label>
        <input id="dp-alias" name="gc_alias" defaultValue={valores.gc_alias ?? ''} disabled={!esAdmin} />
      </div>
      <div className="campo">
        <label htmlFor="dp-cbu">CBU</label>
        <input id="dp-cbu" name="gc_cbu" inputMode="numeric" defaultValue={valores.gc_cbu ?? ''} disabled={!esAdmin} />
      </div>
      <div className="campo">
        <label htmlFor="dp-titular">Titular</label>
        <input id="dp-titular" name="gc_titular" defaultValue={valores.gc_titular ?? ''} disabled={!esAdmin} />
      </div>
      <div className="campo">
        <label htmlFor="dp-wa">WhatsApp de Spazio</label>
        <input id="dp-wa" name="gc_whatsapp" type="tel" defaultValue={valores.gc_whatsapp ?? ''} disabled={!esAdmin} />
      </div>
      <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" name="gc_activa" value="si" defaultChecked={(valores.gc_activa ?? 'si') === 'si'} disabled={!esAdmin} />
        Vender gift cards en la página pública
      </label>
      {estado.error && <p className="error-form">{estado.error}</p>}
      {estado.ok && <p className="aviso aviso-ok">{estado.ok}</p>}
      {esAdmin && (
        <button className="btn btn-chico" disabled={guardando}>
          Guardar
        </button>
      )}
    </form>
  );
}

// La gift card de Spazio ("Luz filtrada"): papel claro y vidrios de color superpuestos.
// Se usa en la página pública (vista previa en vivo), en la confirmación y en el saldo.
export function TarjetaGift({
  monto,
  frase,
  para,
  de,
  codigo,
  vence,
  chica = false,
}: {
  monto?: string;
  frase?: string;
  para?: string;
  de?: string;
  codigo?: string;
  vence?: string;
  chica?: boolean;
}) {
  return (
    <div className={`gc-tarjeta${chica ? ' gc-tarjeta-chica' : ''}`} role="img" aria-label={`Gift card de Spazio${monto ? ` por ${monto}` : ''}${para ? ` para ${para}` : ''}`}>
      <span className="gc-luz gc-luz-1" aria-hidden="true" />
      <span className="gc-luz gc-luz-2" aria-hidden="true" />
      <span className="gc-vidrio gc-vidrio-ambar" aria-hidden="true" />
      <span className="gc-vidrio gc-vidrio-rosa" aria-hidden="true" />
      <span className="gc-vidrio gc-vidrio-verde" aria-hidden="true" />
      <span className="gc-vidrio gc-vidrio-humo" aria-hidden="true" />
      <div className="gc-contenido">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-spazio-negro.png" alt="Spazio" className="gc-logo" />
        <div className="gc-pie">
          {monto ? <span className="gc-monto">{monto}</span> : <span className="gc-titulo">Gift card</span>}
          {monto && <span className="gc-etiqueta">Gift card</span>}
          {frase && <span className="gc-frase">{frase}</span>}
          {(para || de) && (
            <span className="gc-para">
              {para && <>Para {para}</>}
              {para && de && ' · '}
              {de && <>De {de}</>}
            </span>
          )}
          {(codigo || vence) && (
            <span className="gc-datos">
              {codigo && <span className="gc-codigo">{codigo}</span>}
              {vence && <span>Válida para pedir hasta {vence}</span>}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

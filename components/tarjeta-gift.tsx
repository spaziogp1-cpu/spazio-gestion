import { Poppins } from 'next/font/google';

// La gift card de Spazio: vidrio rojo sobre blanco (frente) y fondo rojo con De/Para/dedicatoria (reverso).
// Se usa en la página pública (vista previa en vivo), en la confirmación, en el saldo y en la sección interna.
const poppins = Poppins({ subsets: ['latin'], weight: ['300', '400', '700'], variable: '--fuente-gc', display: 'swap' });

export const MENSAJE_GIFT_DEFECTO = 'Para que elijas algo que te haga sonreír cada vez que lo veas. Un regalo con mucho cariño, para vos.';

export function TarjetaGift({ monto, chica = false }: { monto?: string; chica?: boolean }) {
  return (
    <div
      className={`gc-tarjeta ${poppins.variable}${chica ? ' gc-tarjeta-chica' : ''}`}
      role="img"
      aria-label={`Gift card de Spazio Design${monto ? ` por ${monto}` : ''}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/gc-frente.jpg" alt="" className="gc-fondo" />
      <span className="gc-marca">Spazio Design</span>
      {monto && <span className="gc-monto">{monto}</span>}
      <p className="gc-titulo">
        Gift
        <br />
        card
      </p>
    </div>
  );
}

export function TarjetaGiftDorso({ de, para, mensaje }: { de?: string; para?: string; mensaje?: string }) {
  const texto = mensaje?.trim();
  return (
    <div className={`gc-tarjeta gc-dorso ${poppins.variable}`} role="img" aria-label={`Reverso de la gift card${para ? ` para ${para}` : ''}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/gc-dorso.jpg" alt="" className="gc-fondo" />
      <div className="gc-dorso-datos">
        <span className="gc-linea">
          De: <span>{de}</span>
        </span>
        <span className="gc-linea">
          Para: <span>{para}</span>
        </span>
      </div>
      <p className={`gc-mensaje${texto ? '' : ' gc-mensaje-vacio'}`}>{texto || MENSAJE_GIFT_DEFECTO}</p>
    </div>
  );
}

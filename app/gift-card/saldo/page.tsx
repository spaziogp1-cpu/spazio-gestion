import type { Metadata } from 'next';
import { TarjetaGift } from '@/components/tarjeta-gift';
import { fechaAR, fraseOcasion, normalizarCodigo } from '@/lib/giftcard';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: { absolute: 'Saldo de tu gift card · Spazio Design' }, robots: { index: false } };
export const dynamic = 'force-dynamic';

type Saldo = {
  para_nombre: string;
  de_nombre: string;
  ocasion: string;
  monto_inicial: number;
  saldo: number;
  inicio: string;
  vence: string;
  estado: 'activa' | 'vencida' | 'usada' | 'anulada' | 'todavia_no';
  codigo_fin: string;
};

const pesos = (n: number) => `$${Math.round(Number(n)).toLocaleString('es-AR')}`;
const ESTADOS: Record<Saldo['estado'], string> = {
  activa: 'Activa',
  vencida: 'Vencida',
  usada: 'Sin saldo',
  anulada: 'Anulada',
  todavia_no: 'Todavía no empezó',
};

export default async function SaldoPage({ searchParams }: { searchParams: Promise<{ codigo?: string }> }) {
  const { codigo } = await searchParams;
  const normal = codigo ? normalizarCodigo(codigo) : null;
  let saldo: Saldo | null = null;
  if (normal) {
    const supabase = await createClient();
    const { data } = await supabase.rpc('gc_saldo', { p_codigo: normal });
    saldo = (data as Saldo | null) ?? null;
  }

  return (
    <main className="turnos gc-publica">
      <header className="turnos-cabecera">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <a href="/gift-card" aria-label="Spazio Design"><img src="/logo-spazio-negro.png" alt="Spazio" /></a>
      </header>
      <section className="card turnos-card form-bloque">
        <h1>
          Tu <em>gift card</em>
        </h1>
        <form method="get" className="form-bloque">
          <div className="campo">
            <label htmlFor="s-codigo">Código</label>
            <input id="s-codigo" name="codigo" defaultValue={normal ?? codigo ?? ''} placeholder="SPZ-XXXX-XXXX" autoCapitalize="characters" autoComplete="off" required />
          </div>
          <button className="btn btn-primario">Ver saldo</button>
        </form>
        {codigo && !saldo && <p className="error-form">No encontramos una gift card con ese código. Revisá que esté bien escrito.</p>}
        {saldo && (
          <>
            <TarjetaGift monto={pesos(saldo.monto_inicial)} frase={fraseOcasion(saldo.ocasion)} para={saldo.para_nombre} de={saldo.de_nombre} codigo={`SPZ-····-${saldo.codigo_fin}`} vence={fechaAR(saldo.vence)} />
            <div className="turnos-resumen">
              <span className="quiet small">Saldo disponible</span>
              <span className="gc-saldo-grande">{pesos(saldo.saldo)}</span>
              <span>
                <span className={`gc-estado gc-estado-${saldo.estado}`}>{ESTADOS[saldo.estado]}</span>
              </span>
              <span className="small quiet">
                {saldo.estado === 'todavia_no'
                  ? `Se puede usar desde el ${fechaAR(saldo.inicio)}.`
                  : saldo.estado === 'vencida'
                    ? `Venció el ${fechaAR(saldo.vence)}. Si pasaron menos de 30 días, escribinos: podemos darte una prórroga.`
                    : `Válida para pedir hasta el ${fechaAR(saldo.vence)}, a las 23:59.`}
              </span>
            </div>
            <p className="small quiet">Para usarla, escribinos por WhatsApp con tu código y te ayudamos a elegir tu pieza, sus medidas y su color.</p>
          </>
        )}
      </section>
    </main>
  );
}

import type { Metadata } from 'next';
import { TarjetaGift } from '@/components/tarjeta-gift';
import { hoyAR, sumarDiasCorridos } from '@/lib/fechas';
import { GC_INICIO_MAX_DIAS } from '@/lib/giftcard';
import { createClient } from '@/lib/supabase/server';
import { Comprar } from './comprar';

export const metadata: Metadata = {
  title: { absolute: 'Gift card · Spazio Design' },
  description: 'Regalá diseño y la libertad de elegir: una gift card de Spazio para una pieza a medida, en el color que quieran.',
};
export const dynamic = 'force-dynamic';

export default async function GiftCardPage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc('gc_config');
  const config = (data ?? { activa: false, whatsapp: '' }) as { activa: boolean; whatsapp: string };
  const hoy = hoyAR();

  return (
    <main className="turnos gc-publica">
      <header className="turnos-cabecera">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <a href="https://www.spaziodesign.net" aria-label="Spazio Design"><img src="/logo-spazio-negro.png" alt="Spazio" /></a>
      </header>
      <section className="card turnos-card">
        <div className="gc-hero">
          <h1>
            Regalá <em>diseño</em>
          </h1>
          <p className="sub">Quien la recibe elige su pieza a medida, en el color que quiera. Vos elegís el monto y le escribís unas palabras.</p>
        </div>
        {config.activa ? (
          <Comprar hoy={hoy} maxInicio={sumarDiasCorridos(hoy, GC_INICIO_MAX_DIAS)} />
        ) : (
          <>
            <TarjetaGift />
            <p className="aviso">Por ahora no estamos vendiendo gift cards online. Escribinos por WhatsApp y te ayudamos.</p>
          </>
        )}
        <div className="gc-condiciones">
          <strong>Cómo funciona</strong>
          <ul>
            <li>No se cobra acá: te escribimos por WhatsApp con los datos para transferir.</li>
            <li>Cuando se acredita la transferencia, la activamos y le llega a quien la recibe por correo y WhatsApp.</li>
            <li>Tiene 3 meses para hacer su pedido. Se usa en todos nuestros productos, también para pagar el envío.</li>
            <li>Es un saldo en pesos, no un precio congelado: si lo que elige cuesta más, paga la diferencia; si cuesta menos, el resto le queda para otra compra mientras esté vigente.</li>
            <li>Se pueden combinar hasta 3 gift cards en un pedido. Si te arrepentís, tenés 10 días para cancelarla mientras no se haya usado.</li>
          </ul>
        </div>
      </section>
      <p className="small quiet">
        ¿Ya tenés una? <a href="/gift-card/saldo">Consultá tu saldo</a>
      </p>
    </main>
  );
}

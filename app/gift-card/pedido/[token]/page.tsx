import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TarjetaGift, TarjetaGiftDorso } from '@/components/tarjeta-gift';
import { fraseOcasion, linkWhatsAppTexto } from '@/lib/giftcard';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: { absolute: 'Tu gift card · Spazio Design' }, robots: { index: false } };
export const dynamic = 'force-dynamic';

type Solicitud = {
  referencia: string;
  estado: 'pendiente_pago' | 'en_revision' | 'emitida' | 'cancelada';
  monto: number;
  ocasion: string;
  para_nombre: string;
  de_nombre: string;
  dedicatoria: string | null;
  comprador_nombre: string;
  whatsapp: string;
};

const pesos = (n: number) => `$${Math.round(Number(n)).toLocaleString('es-AR')}`;

export default async function PedidoGiftPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ nuevo?: string }> }) {
  const [{ token }, { nuevo }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const { data } = await supabase.rpc('gc_solicitud_por_token', { p_token: token });
  if (!data) notFound();
  const s = data as Solicitud;
  const nombre = s.comprador_nombre.split(' ')[0];
  const wa = linkWhatsAppTexto(s.whatsapp, `¡Hola! Hice el pedido de gift card ${s.referencia} por ${pesos(s.monto)} para ${s.para_nombre}.`);

  return (
    <main className="turnos gc-publica">
      <header className="turnos-cabecera">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <a href="/gift-card" aria-label="Spazio Design"><img src="/logo-spazio-negro.png" alt="Spazio" /></a>
      </header>
      <section className="card turnos-card form-bloque">
        {s.estado === 'cancelada' ? (
          <>
            <h1>Pedido cancelado</h1>
            <p className="sub">El pedido {s.referencia} se canceló. Si querés retomarlo, escribinos.</p>
            <a className="btn btn-primario" href="/gift-card">
              Pedir otra gift card
            </a>
          </>
        ) : (
          <>
            <h1>{s.estado === 'emitida' ? '¡Ya está activa!' : nuevo ? <>¡Gracias, {nombre}!</> : 'Tu gift card'}</h1>
            <div className="gc-caras gc-caras-lado">
              <TarjetaGift monto={pesos(s.monto)} />
              <TarjetaGiftDorso de={s.de_nombre} para={s.para_nombre} mensaje={s.dedicatoria || fraseOcasion(s.ocasion)} />
            </div>
            <div className="turnos-resumen">
              <span className="quiet small">Referencia del pedido</span>
              <span className="turnos-resumen-hora">{s.referencia}</span>
            </div>
            {s.estado === 'emitida' ? (
              <p className="sub">Recibimos tu transferencia y le mandamos la gift card a {s.para_nombre}. ¡Gracias por regalar Spazio!</p>
            ) : (
              <>
                {s.estado === 'en_revision' && (
                  <p className="aviso">Por el monto, primero revisamos el pedido. Te escribimos enseguida para seguir.</p>
                )}
                <ol className="gc-pasos">
                  <li>Te escribimos por WhatsApp con los datos para transferir.</li>
                  <li>
                    Transferís el monto exacto ({pesos(s.monto)}) con la referencia <strong>{s.referencia}</strong> en el concepto.
                  </li>
                  <li>Cuando se acredita, la activamos y le llega a {s.para_nombre} por correo y WhatsApp.</li>
                </ol>
                <p className="small quiet">Guardamos tu pedido 72 horas. Si ya transferiste, mandanos el comprobante por WhatsApp.</p>
                {wa && (
                  <div className="acciones turnos-acciones">
                    <a className="btn btn-primario" href={wa} target="_blank" rel="noopener noreferrer">
                      Escribinos por WhatsApp
                    </a>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}

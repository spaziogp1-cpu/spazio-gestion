import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { hoyAR } from '@/lib/fechas';
import { miembroActual } from '@/lib/sesion';
import { Canjear, DatosPago, FilaSolicitud, FilaTarjeta, type Solicitud, type Tarjeta } from './partes';

export const metadata: Metadata = { title: 'Gift cards' };

export default async function GiftCardsPage() {
  const { miembro, supabase } = await miembroActual();
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'spazio-gestion.vercel.app';
  const urlPublica = `${host.startsWith('localhost') ? 'http' : 'https'}://${host}/gift-card`;

  const [{ data: sol, error }, { data: cards }, { data: params }] = await Promise.all([
    supabase.from('gc_solicitudes').select('*').order('creado_en', { ascending: false }).limit(120),
    supabase.from('gift_cards_saldo').select('*').order('creado_en', { ascending: false }).limit(200),
    supabase.from('parametros').select('clave, valor').in('clave', ['gc_alias', 'gc_cbu', 'gc_titular', 'gc_whatsapp', 'gc_activa']),
  ]);

  if (error) {
    return (
      <>
        <div className="cabecera">
          <h1>Gift cards</h1>
        </div>
        <p className="aviso aviso-mal">
          Falta preparar la base de datos: corré <code>supabase/migrations/0027_gift_cards.sql</code> en Supabase → SQL Editor.
        </p>
      </>
    );
  }

  const solicitudes = (sol ?? []) as Solicitud[];
  const tarjetas = (cards ?? []) as Tarjeta[];
  const pago = Object.fromEntries((params ?? []).map((p: { clave: string; valor: string }) => [p.clave, p.valor ?? ''])) as Record<string, string>;
  const pendientes = solicitudes.filter((s) => s.estado === 'pendiente_pago' || s.estado === 'en_revision');
  const cerradas = solicitudes.filter((s) => s.estado === 'emitida' || s.estado === 'cancelada').slice(0, 30);
  const hoy = hoyAR();
  const activas = tarjetas.filter((t) => t.estado === 'activa' && t.vence >= hoy && Number(t.saldo) > 0);
  const otras = tarjetas.filter((t) => !activas.includes(t));
  const saldoTotal = activas.reduce((a, t) => a + Number(t.saldo), 0);
  const esAdmin = miembro.rol === 'admin';

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Gift cards</h1>
          <p className="sub">
            {pendientes.length === 0 ? 'Sin pedidos pendientes' : `${pendientes.length} ${pendientes.length === 1 ? 'pedido pendiente' : 'pedidos pendientes'}`}
            {' · '}
            {activas.length} activas · saldo vigente ${Math.round(saldoTotal).toLocaleString('es-AR')}
          </p>
        </div>
        <a className="btn btn-chico" href={urlPublica} target="_blank" rel="noopener noreferrer">
          Ver la página de compra
        </a>
      </div>

      {!pago.gc_alias && !pago.gc_cbu && (
        <p className="aviso" style={{ marginBottom: 12, background: 'var(--warn-soft)', color: 'var(--warn)' }}>
          Cargá el alias, el CBU y el titular en «Datos de pago» para que el mensaje que le mandás a quien compra salga completo.
        </p>
      )}

      <div className="grid-ficha">
        <div className="col">
          <section className="card">
            <div className="card-titulo">
              <h2>Pedidos por cobrar</h2>
            </div>
            {pendientes.length === 0 ? (
              <p className="vacio">No hay pedidos esperando la transferencia.</p>
            ) : (
              <ul className="lista">
                {pendientes.map((s) => (
                  <li key={s.id} id={`solicitud-${s.id}`}>
                    <FilaSolicitud s={s} pago={pago} esAdmin={esAdmin} hoy={hoy} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="card-titulo">
              <h2>Tarjetas activas</h2>
            </div>
            {activas.length === 0 ? (
              <p className="vacio">Todavía no hay gift cards activas.</p>
            ) : (
              <ul className="lista">
                {activas.map((t) => (
                  <li key={t.id}>
                    <FilaTarjeta t={t} esAdmin={esAdmin} hoy={hoy} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="col">
          <section className="card">
            <div className="card-titulo">
              <h2>Usar saldo</h2>
            </div>
            <div className="seccion">
              <Canjear />
            </div>
          </section>

          <section className="card">
            <div className="card-titulo">
              <h2>Datos de pago</h2>
            </div>
            <div className="seccion">
              <DatosPago valores={pago} esAdmin={esAdmin} />
            </div>
          </section>

          {otras.length > 0 && (
            <section className="card">
              <div className="card-titulo">
                <h2>Usadas, vencidas o anuladas</h2>
              </div>
              <ul className="lista">
                {otras.slice(0, 40).map((t) => (
                  <li key={t.id}>
                    <FilaTarjeta t={t} esAdmin={esAdmin} hoy={hoy} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {cerradas.length > 0 && (
            <section className="card">
              <div className="card-titulo">
                <h2>Pedidos cerrados</h2>
              </div>
              <ul className="lista">
                {cerradas.map((s) => (
                  <li key={s.id} id={`solicitud-${s.id}`}>
                    <FilaSolicitud s={s} pago={pago} esAdmin={esAdmin} hoy={hoy} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

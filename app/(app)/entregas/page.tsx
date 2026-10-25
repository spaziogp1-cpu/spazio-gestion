import type { Metadata } from 'next';
import Link from 'next/link';
import { mapsConfigurado } from '@/lib/entregas/geocodificar';
import type { Entrega } from '@/lib/entregas/tipos';
import { hoyAR, sumarDiasCorridos } from '@/lib/fechas';
import { miembroActual } from '@/lib/sesion';
import { FilaEntrega, type PedidoDeEntrega } from './partes';

export const metadata: Metadata = { title: 'Entregas' };

const VISTAS = [
  { id: 'revisar', nombre: 'Revisar', estados: ['revisar'] },
  { id: 'listas', nombre: 'Listas para planificar', estados: ['lista'] },
  { id: 'en-ruta', nombre: 'En ruta', estados: ['propuesta', 'confirmada', 'en_camino'] },
  { id: 'cerradas', nombre: 'Cerradas', estados: ['entregada', 'no_entregada', 'cancelada'] },
] as const;

export default async function EntregasPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver } = await searchParams;
  const vista = VISTAS.find((v) => v.id === ver) ?? VISTAS[0];
  const { supabase } = await miembroActual();
  const hace30 = sumarDiasCorridos(hoyAR(), -30);

  const [{ data: abiertas, error }, { data: cerradas }, { data: param }] = await Promise.all([
    supabase.from('entregas').select('*').not('estado', 'in', '(entregada,no_entregada,cancelada)').order('fecha_acordada', { nullsFirst: false }).order('creado_en'),
    vista.id === 'cerradas'
      ? supabase.from('entregas').select('*').in('estado', ['entregada', 'no_entregada', 'cancelada']).gte('cerrada_en', `${hace30}T00:00:00Z`).order('cerrada_en', { ascending: false }).limit(60)
      : Promise.resolve({ data: [] }),
    supabase.from('parametros').select('valor').eq('clave', 'entregas_etapa_despacho').maybeSingle(),
  ]);

  if (error) {
    return (
      <>
        <div className="cabecera">
          <h1>Entregas</h1>
        </div>
        <p className="aviso aviso-mal">Falta correr la migración 0022 (entregas) en Supabase.</p>
      </>
    );
  }

  const todas = [...((abiertas ?? []) as Entrega[]), ...((cerradas ?? []) as Entrega[])];
  const cuenta = (estados: readonly string[]) => todas.filter((e) => estados.includes(e.estado)).length;
  const mostrar = todas.filter((e) => (vista.estados as readonly string[]).includes(e.estado));

  const ids = [...new Set(mostrar.map((e) => e.pedido_id))];
  const { data: peds } = ids.length
    ? await supabase.from('pedidos_resumen').select('id, numero, cliente_nombre, productos, envio, etapa, fecha_limite, saldo').in('id', ids)
    : { data: [] };
  const pedidos = new Map(((peds ?? []) as PedidoDeEntrega[]).map((p) => [p.id, p]));
  const etapa = param?.valor === 'lista' ? 'Fabricada' : 'Embalada';

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Entregas</h1>
          <p className="sub">
            {cuenta(['revisar'])} para revisar · {cuenta(['lista'])} listas para planificar
          </p>
        </div>
        <Link href="/entregas/planificar" className="btn btn-primario btn-chico">
          Planificar el día
        </Link>
      </div>

      <nav className="filtros" aria-label="Qué entregas ver">
        {VISTAS.map((v) => (
          <Link key={v.id} href={v.id === 'revisar' ? '/entregas' : `/entregas?ver=${v.id}`} className="filtro" aria-current={v.id === vista.id ? 'true' : undefined}>
            {v.nombre}
            {v.id !== 'cerradas' && <span className="n">{cuenta(v.estados)}</span>}
          </Link>
        ))}
      </nav>

      {!mapsConfigurado() && (
        <p className="aviso" style={{ background: 'var(--surface-2)', marginBottom: 12 }}>
          Todavía no está la clave de Google Maps, así que las direcciones no se ubican solas. Mientras tanto podés pegar las coordenadas desde Google Maps en
          cada entrega (Editar → Coordenadas).
        </p>
      )}

      <section className="card">
        {mostrar.length === 0 ? (
          <div className="vacio">
            {vista.id === 'revisar'
              ? `No hay entregas para revisar. Un pedido entra acá cuando llega a ${etapa} y va por flete, expreso o a coordinar.`
              : vista.id === 'listas'
                ? 'No hay entregas listas. Las que están en Revisar pasan acá cuando tienen todos los datos.'
                : vista.id === 'en-ruta'
                  ? 'No hay entregas en rutas confirmadas. Se arman en Planificar el día.'
                  : 'No hay entregas cerradas en los últimos 30 días.'}
          </div>
        ) : (
          <div className="seccion">
            {mostrar.map((e) => (
              <FilaEntrega key={e.id} e={e} pedido={pedidos.get(e.pedido_id)} maps={mapsConfigurado()} />
            ))}
          </div>
        )}
      </section>
      <p className="small quiet" style={{ marginTop: 10 }}>
        Entran los pedidos desde la etapa {etapa} que van por flete, expreso o a coordinar. La etapa se cambia en <Link href="/ajustes#reparto">Ajustes → Reparto</Link>.
      </p>
    </>
  );
}

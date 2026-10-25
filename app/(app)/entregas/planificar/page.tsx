import type { Metadata } from 'next';
import Link from 'next/link';
import { deposito, type Vehiculo } from '@/lib/entregas/datos-plan';
import { optimizacionConfigurada } from '@/lib/entregas/google-rutas';
import type { Entrega } from '@/lib/entregas/tipos';
import { fechaCorta, hoyAR, sumarDiasCorridos } from '@/lib/fechas';
import { miembroActual } from '@/lib/sesion';
import { PlanDelDia, type ParadaVista, type RutaVista } from './partes';

export const metadata: Metadata = { title: 'Planificar entregas' };
export const dynamic = 'force-dynamic';

const diaSemana = (f: string) => {
  const [a, m, d] = f.split('-').map(Number);
  return String(((new Date(Date.UTC(a, m - 1, d)).getUTCDay() + 6) % 7) + 1);
};

export default async function PlanificarPage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const { fecha: f } = await searchParams;
  const { supabase } = await miembroActual();
  const hoy = hoyAR();

  const { data: proximas, error } = await supabase.from('entregas').select('fecha_acordada, estado').in('estado', ['lista', 'confirmada', 'en_camino']).gte('fecha_acordada', hoy).lte('fecha_acordada', sumarDiasCorridos(hoy, 30));
  if (error) {
    return (
      <>
        <div className="cabecera">
          <h1>Planificar entregas</h1>
        </div>
        <p className="aviso aviso-mal">Falta correr la migración 0023 (rutas) en Supabase.</p>
      </>
    );
  }
  const porFecha = new Map<string, { listas: number; confirmadas: number }>();
  for (const e of (proximas ?? []) as { fecha_acordada: string; estado: string }[]) {
    const x = porFecha.get(e.fecha_acordada) ?? { listas: 0, confirmadas: 0 };
    if (e.estado === 'lista') x.listas++;
    else x.confirmadas++;
    porFecha.set(e.fecha_acordada, x);
  }
  const fechas = [...porFecha.keys()].sort();
  const fecha = f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : (fechas.find((x) => porFecha.get(x)!.listas > 0) ?? sumarDiasCorridos(hoy, 1));

  const [{ data: vs }, { data: rs }, { data: om }, { data: listas }, dep] = await Promise.all([
    supabase.from('vehiculos').select('*').eq('activo', true).order('orden'),
    supabase.from('rutas').select('*, ruta_paradas(*)').eq('fecha', fecha).in('estado', ['propuesta', 'confirmada', 'en_curso', 'terminada']).order('creado_en'),
    supabase.from('rutas_omitidas').select('entrega_id, motivo').eq('fecha', fecha),
    supabase.from('entregas').select('*').eq('estado', 'lista').eq('fecha_acordada', fecha),
    deposito(supabase),
  ]);
  const vehiculos = (vs ?? []) as Vehiculo[];
  type RutaFila = { id: string; vehiculo_id: string; estado: string; salida: string | null; regreso: string | null; km: number | null; minutos: number | null; costo_estimado: number | null; polyline: string | null; calculo: string; desactualizada: boolean; con_cambios: string | null; ruta_paradas: { id: string; entrega_id: string; orden: number; llegada: string | null; salida: string | null; minutos_viaje: number | null; km_desde_anterior: number | null; fuera_de_franja: boolean; espera_minutos: number }[] };
  const rutasDb = (rs ?? []) as RutaFila[];

  // Datos de cada entrega que aparece (en rutas, omitidas o listas).
  const ids = new Set<string>([...rutasDb.flatMap((r) => r.ruta_paradas.map((p) => p.entrega_id)), ...((om ?? []) as { entrega_id: string }[]).map((o) => o.entrega_id), ...((listas ?? []) as Entrega[]).map((e) => e.id)]);
  const { data: es } = ids.size ? await supabase.from('entregas').select('*').in('id', [...ids]) : { data: [] };
  const entregas = new Map(((es ?? []) as Entrega[]).map((e) => [e.id, e]));
  const pedIds = [...new Set([...entregas.values()].map((e) => e.pedido_id))];
  const { data: ps } = pedIds.length ? await supabase.from('pedidos_resumen').select('id, numero, cliente_nombre, productos').in('id', pedIds) : { data: [] };
  const pedidos = new Map(((ps ?? []) as { id: string; numero: number; cliente_nombre: string; productos: string }[]).map((p) => [p.id, p]));

  const vista = (entregaId: string): ParadaVista['entrega'] => {
    const e = entregas.get(entregaId);
    const p = e ? pedidos.get(e.pedido_id) : undefined;
    return {
      id: entregaId,
      pedidoId: e?.pedido_id ?? '',
      titulo: p ? `#${p.numero} ${p.cliente_nombre}` : 'Entrega',
      productos: p?.productos ?? '',
      direccion: e ? [e.tipo === 'expreso' && e.expreso_nombre ? `Expreso ${e.expreso_nombre}` : null, e.direccion, e.piso_depto, e.localidad].filter(Boolean).join(', ') : '',
      franja: e?.franja_desde && e.franja_hasta ? `${e.franja_desde.slice(0, 5)} a ${e.franja_hasta.slice(0, 5)}` : '',
      unidades: Number(e?.unidades ?? 0),
      personas: e?.personas ?? 1,
      lat: e?.lat ?? null,
      lng: e?.lng ?? null,
      estado: e?.estado ?? 'lista',
    };
  };
  const rutas: RutaVista[] = rutasDb.map((r) => ({
    id: r.id,
    vehiculo: vehiculos.find((v) => v.id === r.vehiculo_id) ?? null,
    estado: r.estado,
    salida: r.salida?.slice(0, 5) ?? null,
    regreso: r.regreso?.slice(0, 5) ?? null,
    km: r.km == null ? null : Number(r.km),
    minutos: r.minutos,
    costo: r.costo_estimado == null ? null : Number(r.costo_estimado),
    polyline: r.polyline,
    calculo: r.calculo,
    desactualizada: r.desactualizada,
    conCambios: r.con_cambios,
    paradas: [...r.ruta_paradas]
      .sort((a, b) => a.orden - b.orden)
      .map((p) => ({ id: p.id, llegada: p.llegada?.slice(0, 5) ?? null, salida: p.salida?.slice(0, 5) ?? null, minutosViaje: p.minutos_viaje, km: p.km_desde_anterior == null ? null : Number(p.km_desde_anterior), fueraDeFranja: p.fuera_de_franja, espera: p.espera_minutos, entrega: vista(p.entrega_id) })),
  }));
  const enRuta = new Set(rutas.flatMap((r) => r.paradas.map((p) => p.entrega.id)));
  const omitidas = ((om ?? []) as { entrega_id: string; motivo: string }[]).filter((o) => !enRuta.has(o.entrega_id)).map((o) => ({ entrega: vista(o.entrega_id), motivo: o.motivo }));
  const sinPlanificar = ((listas ?? []) as Entrega[]).filter((e) => !enRuta.has(e.id) && !omitidas.some((o) => o.entrega.id === e.id)).map((e) => vista(e.id));
  const dia = diaSemana(fecha);

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Planificar entregas</h1>
          <p className="sub">
            {fechaCorta(fecha)} · {porFecha.get(fecha)?.listas ?? 0} listas · {porFecha.get(fecha)?.confirmadas ?? 0} confirmadas
          </p>
        </div>
        <Link href="/entregas?ver=listas" className="btn btn-chico">
          Ver entregas
        </Link>
      </div>

      <nav className="filtros" aria-label="Día">
        {[...new Set([...fechas, fecha])].sort().map((x) => (
          <Link key={x} href={`/entregas/planificar?fecha=${x}`} className="filtro" aria-current={x === fecha ? 'true' : undefined}>
            {fechaCorta(x)}
            {porFecha.get(x) && <span className="n">{porFecha.get(x)!.listas + porFecha.get(x)!.confirmadas}</span>}
          </Link>
        ))}
      </nav>

      {!dep && (
        <p className="aviso aviso-mal" style={{ marginBottom: 12 }}>
          Falta ubicar el depósito. Cargá la clave de Google Maps y guardá <Link href="/ajustes#reparto">Ajustes → Reparto</Link>.
        </p>
      )}

      <PlanDelDia
        fecha={fecha}
        vehiculos={vehiculos.map((v) => ({ id: v.id, nombre: v.nombre, fletero: v.fletero, trabaja: v.dias.split(',').includes(dia) }))}
        rutas={rutas}
        omitidas={omitidas}
        sinPlanificar={sinPlanificar}
        deposito={dep}
        google={optimizacionConfigurada()}
        claveMapa={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? null}
      />
    </>
  );
}

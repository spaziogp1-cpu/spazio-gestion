'use server';

import { revalidatePath } from 'next/cache';
import { geocodificar, mapsConfigurado } from '@/lib/entregas/geocodificar';
import { direccionCompleta, leerCoordenadas, type Entrega } from '@/lib/entregas/tipos';
import { texto } from '@/lib/formato';
import { miembroActual } from '@/lib/sesion';

export type EstadoEntregaForm = { ok?: string; error?: string };

const hora = (v: FormDataEntryValue | null) => {
  const t = texto(v);
  return t && /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : null;
};
const fecha = (v: FormDataEntryValue | null) => {
  const t = texto(v);
  return t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
};
const numero = (v: FormDataEntryValue | null, min: number, max: number) => {
  const t = texto(v);
  if (t == null) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};

function refrescar(pedidoId?: string) {
  revalidatePath('/entregas');
  if (pedidoId) revalidatePath(`/pedidos/${pedidoId}`);
}

async function evento(supabase: Awaited<ReturnType<typeof miembroActual>>['supabase'], entregaId: string, porId: string, tipo: string, detalle: string) {
  await supabase.from('entrega_eventos').insert({ entrega_id: entregaId, tipo, detalle, por_id: porId });
}

/** Busca la dirección en Google y guarda la ubicación. */
async function ubicar(supabase: Awaited<ReturnType<typeof miembroActual>>['supabase'], e: Pick<Entrega, 'id' | 'direccion' | 'localidad' | 'codigo_postal'>, porId: string) {
  if (!e.direccion) return { error: 'Primero cargá la dirección.' };
  const r = await geocodificar(direccionCompleta(e));
  if (!r.ok) {
    if (r.noEncontrada) await supabase.from('entregas').update({ precision: 'no_encontrada' }).eq('id', e.id);
    return { error: r.error };
  }
  const u = r.ubicacion;
  const { error } = await supabase
    .from('entregas')
    .update({ lat: u.lat, lng: u.lng, place_id: u.placeId, direccion_google: u.direccionGoogle, precision: u.precision, ubicacion_confirmada: false })
    .eq('id', e.id);
  if (error) return { error: 'No se pudo guardar la ubicación.' };
  await evento(supabase, e.id, porId, 'ubicada', `Ubicada por Google (${u.precision}): ${u.direccionGoogle}`);
  return { ok: u.precision === 'exacta' ? 'Ubicada en el mapa.' : 'Ubicada, pero de forma aproximada: revisala en el mapa y confirmala.' };
}

export async function guardarEntrega(id: string, _prev: EstadoEntregaForm, fd: FormData): Promise<EstadoEntregaForm> {
  const { miembro, supabase } = await miembroActual();
  const { data: antes } = await supabase.from('entregas').select('*').eq('id', id).maybeSingle();
  if (!antes) return { error: 'No se encontró la entrega.' };
  const e = antes as Entrega;
  if (!['revisar', 'lista'].includes(e.estado)) return { error: 'Esta entrega ya está en una ruta: se cambia desde la planificación.' };

  const desde = hora(fd.get('franja_desde'));
  const hasta = hora(fd.get('franja_hasta'));
  if (desde && hasta && hasta <= desde) return { error: 'La franja tiene que terminar después de empezar.' };
  const unidades = numero(fd.get('unidades_manual'), 0.25, 20);
  const personas = numero(fd.get('personas_manual'), 1, 4);
  if (unidades === undefined) return { error: 'La carga tiene que ser un número entre 0,25 y 20.' };
  if (personas === undefined) return { error: 'Las personas tienen que ser entre 1 y 4.' };
  const coordsTexto = texto(fd.get('coordenadas'));
  const coords = leerCoordenadas(coordsTexto);
  if (coordsTexto && !coords) return { error: 'Las coordenadas no se entienden. Copialas de Google Maps, por ejemplo -34.5975, -58.4372.' };
  const ascensor = texto(fd.get('ascensor'));

  const cambios: Record<string, unknown> = {
    direccion: texto(fd.get('direccion')),
    piso_depto: texto(fd.get('piso_depto')),
    localidad: texto(fd.get('localidad')),
    codigo_postal: texto(fd.get('codigo_postal')),
    expreso_nombre: texto(fd.get('expreso_nombre')),
    recibe_nombre: texto(fd.get('recibe_nombre')),
    recibe_telefono: texto(fd.get('recibe_telefono')),
    fecha_acordada: fecha(fd.get('fecha_acordada')),
    franja_desde: desde,
    franja_hasta: hasta,
    ascensor: ascensor && ['si', 'no', 'no_sabe'].includes(ascensor) ? ascensor : null,
    acceso_notas: texto(fd.get('acceso_notas')),
    ayuda_descarga: fd.get('ayuda_descarga') === 'on',
    instalacion: fd.get('instalacion') === 'on',
    unidades_manual: unidades,
    personas_manual: personas,
    notas: texto(fd.get('notas')),
  };
  if (coords) Object.assign(cambios, { lat: coords.lat, lng: coords.lng, place_id: null, direccion_google: null, precision: 'exacta', ubicacion_confirmada: true });

  const { data: despues, error } = await supabase.from('entregas').update(cambios).eq('id', id).select('*').single();
  if (error || !despues) return { error: `No se pudo guardar: ${error?.message ?? 'error desconocido'}` };
  const d = despues as Entrega;
  const cambioDireccion = (['direccion', 'localidad', 'codigo_postal'] as const).some((k) => (e[k] ?? null) !== (d[k] ?? null));
  if (cambioDireccion) await evento(supabase, id, miembro.id, 'cambio', `Dirección: ${[d.direccion, d.piso_depto, d.localidad].filter(Boolean).join(', ') || '—'}`);
  if (coords) await evento(supabase, id, miembro.id, 'ubicada', `Coordenadas cargadas a mano: ${coords.lat}, ${coords.lng}`);

  let aviso = '';
  if (!coords && d.direccion && d.lat == null && mapsConfigurado()) {
    const r = await ubicar(supabase, d, miembro.id);
    aviso = r.error ? ` No se pudo ubicar: ${r.error}` : ` ${r.ok}`;
  }
  refrescar(d.pedido_id);
  return { ok: `Guardado.${aviso}` };
}

export async function ubicarEntrega(id: string): Promise<EstadoEntregaForm> {
  const { miembro, supabase } = await miembroActual();
  const { data } = await supabase.from('entregas').select('id, pedido_id, direccion, localidad, codigo_postal').eq('id', id).maybeSingle();
  if (!data) return { error: 'No se encontró la entrega.' };
  const r = await ubicar(supabase, data as Entrega, miembro.id);
  refrescar((data as Entrega).pedido_id);
  return r;
}

export async function confirmarUbicacion(id: string): Promise<EstadoEntregaForm> {
  const { miembro, supabase } = await miembroActual();
  const { data, error } = await supabase.from('entregas').update({ ubicacion_confirmada: true }).eq('id', id).not('lat', 'is', null).select('pedido_id').maybeSingle();
  if (error || !data) return { error: 'No se pudo confirmar.' };
  await evento(supabase, id, miembro.id, 'ubicada', 'Ubicación confirmada a mano');
  refrescar(data.pedido_id);
  return { ok: 'Ubicación confirmada.' };
}

export async function sacarEntrega(id: string, motivo: string): Promise<EstadoEntregaForm> {
  const { supabase } = await miembroActual();
  const m = motivo.trim().slice(0, 200);
  if (!m) return { error: 'Escribí por qué sale de la lista.' };
  const { data: e } = await supabase.from('entregas').select('notas, pedido_id, estado').eq('id', id).maybeSingle();
  if (!e) return { error: 'No se encontró la entrega.' };
  if (!['revisar', 'lista'].includes(e.estado)) return { error: 'Esta entrega ya está en una ruta.' };
  const { error } = await supabase
    .from('entregas')
    .update({ estado: 'cancelada', notas: [e.notas, `Sacada de la lista: ${m}`].filter(Boolean).join('\n') })
    .eq('id', id);
  if (error) return { error: 'No se pudo sacar.' };
  refrescar(e.pedido_id);
  return { ok: 'Sacada de la lista.' };
}

/** Vuelve a crear la entrega de un pedido que está en la etapa de despacho (por ejemplo, después de sacarla por error). */
export async function crearEntrega(pedidoId: string): Promise<EstadoEntregaForm> {
  const { supabase } = await miembroActual();
  const { data, error } = await supabase.rpc('entrega_crear', { p_pedido: pedidoId });
  if (error) return { error: error.message };
  if (!data) return { error: 'Este pedido no corresponde a Entregas (revisá la etapa y la forma de envío) o ya tiene una abierta.' };
  refrescar(pedidoId);
  return { ok: 'Entrega creada.' };
}

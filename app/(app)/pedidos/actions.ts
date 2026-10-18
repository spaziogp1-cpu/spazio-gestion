'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ETAPAS } from '@/lib/constantes';
import { calcularFechaLimite, hoyAR } from '@/lib/fechas';
import { leerMonto, texto } from '@/lib/formato';
import { leerReglaPlazo } from '@/lib/parametros';
import { miembroActual } from '@/lib/sesion';

export type Estado = { error?: string; ok?: string };

const fechaValida = (f: string | null) => (f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : null);

// ---------------------------------------------------------------------
// Alta de pedido
// ---------------------------------------------------------------------
export async function crearPedido(_prev: Estado, fd: FormData): Promise<Estado> {
  const { supabase } = await miembroActual();

  const clienteId = texto(fd.get('cliente_id'));
  const nombre = texto(fd.get('cliente_nombre'));
  if (!clienteId && !nombre) return { error: 'Falta el cliente.' };

  const canal = texto(fd.get('canal'));
  if (!canal) return { error: 'Elegí por dónde entró la venta.' };

  // Productos: los campos vienen como listas paralelas (item_producto, item_modelo, …).
  const col = (k: string) => fd.getAll(`item_${k}`).map((v) => texto(v));
  const productos = col('producto');
  const items = productos
    .map((producto, i) => ({
      producto,
      modelo: col('modelo')[i],
      color: col('color')[i],
      puntas: col('puntas')[i],
      tapa: col('tapa')[i],
      material: col('material')[i],
      medidas: col('medidas')[i],
      cantidad: Math.max(1, Math.round(leerMonto(fd.getAll('item_cantidad')[i] ?? '1')) || 1),
      precio: fd.getAll('item_precio')[i] ? leerMonto(fd.getAll('item_precio')[i]) : null,
    }))
    .filter((it) => it.producto || it.modelo || it.medidas);
  if (items.length === 0) return { error: 'Cargá al menos un producto.' };
  for (const it of items) if (!it.producto) it.producto = 'mesa';

  const fechaVenta = fechaValida(texto(fd.get('fecha_venta'))) ?? hoyAR();
  let fechaLimite = fechaValida(texto(fd.get('fecha_limite')));
  if (!fechaLimite) {
    const { regla, feriados } = await leerReglaPlazo(supabase);
    fechaLimite = calcularFechaLimite(fechaVenta, regla, new Set(feriados));
  }
  if (fechaLimite < fechaVenta) return { error: 'La fecha límite no puede ser anterior a la venta.' };

  const sumaItems = items.reduce((s, it) => s + (it.precio ?? 0) * it.cantidad, 0);
  const total = fd.get('total') && leerMonto(fd.get('total')) > 0 ? leerMonto(fd.get('total')) : sumaItems;
  const sena = leerMonto(fd.get('sena'));
  const envioCliente = leerMonto(fd.get('precio_envio_cliente'));
  if (sena > total + envioCliente && total > 0) return { error: 'La seña es mayor que el total.' };

  const pauta = texto(fd.get('pauta'));

  const { data: id, error } = await supabase.rpc('crear_pedido', {
    p: {
      cliente_id: clienteId,
      cliente: {
        nombre,
        telefono: texto(fd.get('cliente_telefono')),
        email: texto(fd.get('cliente_email')),
        dni: texto(fd.get('cliente_dni')),
        direccion: texto(fd.get('cliente_direccion')),
        localidad: texto(fd.get('cliente_localidad')),
        codigo_postal: texto(fd.get('cliente_cp')),
      },
      tipo_venta: texto(fd.get('tipo_venta')) ?? 'minorista',
      canal,
      responsable_id: texto(fd.get('responsable_id')),
      fecha_venta: fechaVenta,
      fecha_limite: fechaLimite,
      envio: texto(fd.get('envio')) ?? 'coordinar',
      direccion_entrega: texto(fd.get('direccion_entrega')),
      forma_pago: texto(fd.get('forma_pago')),
      total,
      sena,
      precio_envio_cliente: envioCliente,
      observaciones: texto(fd.get('observaciones')),
      pauta: pauta === 'si' ? true : pauta === 'no' ? false : null,
      campana: texto(fd.get('campana')),
      dm_inbound: texto(fd.get('dm_inbound')),
      items,
    },
  });
  if (error || !id) return { error: `No se pudo guardar el pedido: ${error?.message ?? 'error desconocido'}` };

  revalidatePath('/pedidos');
  redirect(`/pedidos/${id}?nuevo=1`);
}

// ---------------------------------------------------------------------
// Ficha del pedido
// ---------------------------------------------------------------------
export async function cambiarEtapa(pedidoId: string, etapa: string): Promise<Estado> {
  if (!ETAPAS.some((e) => e.id === etapa)) return { error: 'Etapa inválida.' };
  const { supabase } = await miembroActual();
  const cambios: Record<string, unknown> = { etapa };
  if (etapa === 'entregado') cambios.fecha_entrega_real = hoyAR();
  const { error } = await supabase.from('pedidos').update(cambios).eq('id', pedidoId);
  if (error) return { error: 'No se pudo cambiar la etapa.' };
  revalidatePath(`/pedidos/${pedidoId}`);
  revalidatePath('/pedidos');
  revalidatePath('/produccion');
  return { ok: 'Etapa actualizada' };
}

export async function actualizarPedido(pedidoId: string, _prev: Estado, fd: FormData): Promise<Estado> {
  const { supabase } = await miembroActual();
  const fechaLimite = fechaValida(texto(fd.get('fecha_limite')));
  if (!fechaLimite) return { error: 'La fecha límite es obligatoria.' };
  const pauta = texto(fd.get('pauta'));
  const { error } = await supabase
    .from('pedidos')
    .update({
      tipo_venta: texto(fd.get('tipo_venta')) ?? 'minorista',
      canal: texto(fd.get('canal')),
      responsable_id: texto(fd.get('responsable_id')),
      fecha_limite: fechaLimite,
      fecha_entrega_programada: fechaValida(texto(fd.get('fecha_entrega_programada'))),
      fecha_entrega_real: fechaValida(texto(fd.get('fecha_entrega_real'))),
      envio: texto(fd.get('envio')) ?? 'coordinar',
      direccion_entrega: texto(fd.get('direccion_entrega')),
      forma_pago: texto(fd.get('forma_pago')),
      total: leerMonto(fd.get('total')),
      precio_envio_cliente: leerMonto(fd.get('precio_envio_cliente')),
      observaciones: texto(fd.get('observaciones')),
      pauta: pauta === 'si' ? true : pauta === 'no' ? false : null,
      campana: texto(fd.get('campana')),
      dm_inbound: texto(fd.get('dm_inbound')),
    })
    .eq('id', pedidoId);
  if (error) return { error: `No se pudo guardar: ${error.message}` };
  revalidatePath(`/pedidos/${pedidoId}`);
  revalidatePath('/pedidos');
  return { ok: 'Cambios guardados' };
}

export async function agregarPago(pedidoId: string, _prev: Estado, fd: FormData): Promise<Estado> {
  const { miembro, supabase } = await miembroActual();
  const monto = leerMonto(fd.get('monto'));
  if (monto <= 0) return { error: 'Escribí el monto.' };
  const { error } = await supabase.from('pagos').insert({
    pedido_id: pedidoId,
    tipo: texto(fd.get('tipo')) ?? 'saldo',
    monto,
    medio: texto(fd.get('medio')),
    fecha: fechaValida(texto(fd.get('fecha'))) ?? hoyAR(),
    nota: texto(fd.get('nota')),
    creado_por: miembro.id,
  });
  if (error) return { error: 'No se pudo registrar el pago.' };
  revalidatePath(`/pedidos/${pedidoId}`);
  revalidatePath('/pedidos');
  return { ok: 'Pago registrado' };
}

export async function borrarPago(pedidoId: string, pagoId: string): Promise<void> {
  const { supabase } = await miembroActual();
  await supabase.from('pagos').delete().eq('id', pagoId).eq('pedido_id', pedidoId);
  revalidatePath(`/pedidos/${pedidoId}`);
}

export async function agregarComentario(pedidoId: string, _prev: Estado, fd: FormData): Promise<Estado> {
  const { miembro, supabase } = await miembroActual();
  const t = texto(fd.get('texto'));
  if (!t) return {};
  const { error } = await supabase.from('comentarios').insert({ pedido_id: pedidoId, autor_id: miembro.id, texto: t });
  if (error) return { error: 'No se pudo guardar la nota.' };
  revalidatePath(`/pedidos/${pedidoId}`);
  return { ok: 'ok' };
}

export async function guardarItem(pedidoId: string, itemId: string | null, _prev: Estado, fd: FormData): Promise<Estado> {
  const { supabase } = await miembroActual();
  const producto = texto(fd.get('producto'));
  if (!producto) return { error: 'Falta el producto.' };
  const fila = {
    producto,
    modelo: texto(fd.get('modelo')),
    color: texto(fd.get('color')),
    puntas: texto(fd.get('puntas')),
    tapa: texto(fd.get('tapa')),
    material: texto(fd.get('material')),
    medidas: texto(fd.get('medidas')),
    cantidad: Math.max(1, Math.round(leerMonto(fd.get('cantidad'))) || 1),
    precio: fd.get('precio') ? leerMonto(fd.get('precio')) : null,
    apto_fotos: fd.get('apto_fotos') === 'on',
  };
  const { error } = itemId
    ? await supabase.from('pedido_items').update(fila).eq('id', itemId).eq('pedido_id', pedidoId)
    : await supabase.from('pedido_items').insert({ ...fila, pedido_id: pedidoId, orden: 99 });
  if (error) return { error: 'No se pudo guardar el producto.' };
  revalidatePath(`/pedidos/${pedidoId}`);
  return { ok: 'Producto guardado' };
}

export async function borrarItem(pedidoId: string, itemId: string): Promise<void> {
  const { supabase } = await miembroActual();
  await supabase.from('pedido_items').delete().eq('id', itemId).eq('pedido_id', pedidoId);
  revalidatePath(`/pedidos/${pedidoId}`);
}

export async function registrarArchivo(
  pedidoId: string,
  datos: { nombre: string; ruta: string; tipo_mime: string | null; tamano: number },
): Promise<Estado> {
  const { miembro, supabase } = await miembroActual();
  if (!datos.ruta.startsWith(`pedidos/${pedidoId}/`)) return { error: 'Ruta inválida.' };
  const { error } = await supabase.from('archivos').insert({ ...datos, pedido_id: pedidoId, subido_por: miembro.id });
  if (error) return { error: 'No se pudo registrar el archivo.' };
  revalidatePath(`/pedidos/${pedidoId}`);
  return { ok: 'Archivo subido' };
}

export async function borrarArchivo(pedidoId: string, archivoId: string): Promise<void> {
  const { supabase } = await miembroActual();
  const { data } = await supabase.from('archivos').select('ruta').eq('id', archivoId).eq('pedido_id', pedidoId).maybeSingle();
  if (!data) return;
  await supabase.storage.from('archivos').remove([data.ruta]);
  await supabase.from('archivos').delete().eq('id', archivoId);
  revalidatePath(`/pedidos/${pedidoId}`);
}

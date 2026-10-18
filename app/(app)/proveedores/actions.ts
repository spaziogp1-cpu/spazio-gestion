'use server';

import { revalidatePath } from 'next/cache';
import { hoyAR, sumarDiasHabiles } from '@/lib/fechas';
import { texto } from '@/lib/formato';
import { leerReglaPlazo } from '@/lib/parametros';
import { miembroActual } from '@/lib/sesion';

export type EstadoProv = { error?: string; ok?: string };

const fechaValida = (f: string | null) => (f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : null);

function refrescar(pedidoId: string | null) {
  if (pedidoId) revalidatePath(`/pedidos/${pedidoId}`);
  revalidatePath('/pedidos');
  revalidatePath('/produccion');
  revalidatePath('/proveedores');
}

export async function pedirAProveedor(pedidoId: string, _prev: EstadoProv, fd: FormData): Promise<EstadoProv> {
  const { miembro, supabase } = await miembroActual();
  const proveedorId = texto(fd.get('proveedor_id'));
  if (!proveedorId) return { error: 'Elegí el proveedor.' };

  const link = texto(fd.get('link_drive'));
  if (link && !/^https?:\/\//i.test(link)) return { error: 'El link tiene que empezar con https://' };

  const fechaPedido = fechaValida(texto(fd.get('fecha_pedido'))) ?? hoyAR();
  let fechaEsperada = fechaValida(texto(fd.get('fecha_esperada')));
  if (!fechaEsperada) {
    const [{ data: prov }, { feriados }] = await Promise.all([
      supabase.from('proveedores').select('plazo_dias').eq('id', proveedorId).maybeSingle(),
      leerReglaPlazo(supabase),
    ]);
    fechaEsperada = sumarDiasHabiles(fechaPedido, prov?.plazo_dias ?? 25, new Set(feriados));
  }

  const { error } = await supabase.from('pedidos_proveedor').insert({
    pedido_id: pedidoId,
    proveedor_id: proveedorId,
    detalle: texto(fd.get('detalle')),
    fecha_pedido: fechaPedido,
    fecha_esperada: fechaEsperada,
    link_drive: link,
    creado_por: miembro.id,
  });
  if (error) return { error: `No se pudo guardar: ${error.message}` };
  refrescar(pedidoId);
  return { ok: 'Pedido a proveedor registrado' };
}

export async function cambiarEstadoProveedor(
  pedidoId: string | null,
  id: string,
  estado: 'pedido' | 'recibido' | 'cancelado',
): Promise<EstadoProv> {
  const { supabase } = await miembroActual();
  const { error } = await supabase
    .from('pedidos_proveedor')
    .update({ estado, fecha_recepcion: estado === 'recibido' ? hoyAR() : null })
    .eq('id', id);
  if (error) return { error: 'No se pudo actualizar.' };

  // Si ya llegó todo lo pedido, el pedido pasa a "En fabricación".
  if (estado === 'recibido' && pedidoId) {
    const { data: pend } = await supabase.from('pedidos_proveedor').select('id').eq('pedido_id', pedidoId).eq('estado', 'pedido');
    if (!pend?.length) {
      await supabase.from('pedidos').update({ etapa: 'en_fabricacion' }).eq('id', pedidoId).in('etapa', ['senado', 'pedido_fabrica']);
    }
  }
  refrescar(pedidoId);
  return { ok: 'Actualizado' };
}

export async function borrarPedidoProveedor(pedidoId: string | null, id: string): Promise<void> {
  const { supabase } = await miembroActual();
  await supabase.from('pedidos_proveedor').delete().eq('id', id);
  refrescar(pedidoId);
}

// ---------------------------------------------------------------------
// Pedidos para stock (no asociados a un pedido de cliente)
// ---------------------------------------------------------------------
export async function pedirParaStock(_prev: EstadoProv, fd: FormData): Promise<EstadoProv> {
  const { miembro, supabase } = await miembroActual();

  let proveedorId = texto(fd.get('proveedor_id'));
  let plazo = 25;
  if (proveedorId === 'nuevo' || !proveedorId) {
    const nombre = texto(fd.get('proveedor_nuevo'));
    if (!nombre) return { error: 'Escribí el nombre del proveedor nuevo.' };
    plazo = Math.max(1, Math.round(Number(texto(fd.get('plazo_nuevo')) ?? 10)) || 10);
    // Si ya existe con ese nombre, se reutiliza.
    const { data: existente } = await supabase.from('proveedores').select('id, plazo_dias').ilike('nombre', nombre).maybeSingle();
    if (existente) {
      proveedorId = existente.id;
      plazo = existente.plazo_dias;
    } else {
      const { data: creado, error: errProv } = await supabase
        .from('proveedores')
        .insert({ nombre, que_provee: texto(fd.get('que_provee')), plazo_dias: plazo })
        .select('id')
        .single();
      if (errProv || !creado) return { error: `No se pudo crear el proveedor: ${errProv?.message ?? ''}` };
      proveedorId = creado.id;
    }
  } else {
    const { data: prov } = await supabase.from('proveedores').select('plazo_dias').eq('id', proveedorId).maybeSingle();
    plazo = prov?.plazo_dias ?? 25;
  }

  const detalle = texto(fd.get('detalle'));
  if (!detalle) return { error: 'Escribí qué se pidió.' };
  const link = texto(fd.get('link_drive'));
  if (link && !/^https?:\/\//i.test(link)) return { error: 'El link tiene que empezar con https://' };

  const fechaPedido = fechaValida(texto(fd.get('fecha_pedido'))) ?? hoyAR();
  let fechaEsperada = fechaValida(texto(fd.get('fecha_esperada')));
  if (!fechaEsperada) {
    const { feriados } = await leerReglaPlazo(supabase);
    fechaEsperada = sumarDiasHabiles(fechaPedido, plazo, new Set(feriados));
  }

  const { error } = await supabase.from('pedidos_proveedor').insert({
    pedido_id: null,
    proveedor_id: proveedorId,
    detalle,
    cantidad: texto(fd.get('cantidad')),
    fecha_pedido: fechaPedido,
    fecha_esperada: fechaEsperada,
    link_drive: link,
    nota: texto(fd.get('nota')),
    creado_por: miembro.id,
  });
  if (error) return { error: `No se pudo guardar: ${error.message}` };
  refrescar(null);
  return { ok: 'Pedido para stock registrado' };
}

'use server';

import { revalidatePath } from 'next/cache';
import { hoyAR, sumarDiasCorridos } from '@/lib/fechas';
import { texto } from '@/lib/formato';
import { miembroActual } from '@/lib/sesion';

export type EstadoProv = { error?: string; ok?: string };

const fechaValida = (f: string | null) => (f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : null);

function refrescar(pedidoId: string) {
  revalidatePath(`/pedidos/${pedidoId}`);
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
    const { data: prov } = await supabase.from('proveedores').select('plazo_dias').eq('id', proveedorId).maybeSingle();
    fechaEsperada = sumarDiasCorridos(fechaPedido, prov?.plazo_dias ?? 20);
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
  pedidoId: string,
  id: string,
  estado: 'pedido' | 'recibido' | 'cancelado',
): Promise<EstadoProv> {
  const { supabase } = await miembroActual();
  const { error } = await supabase
    .from('pedidos_proveedor')
    .update({ estado, fecha_recepcion: estado === 'recibido' ? hoyAR() : null })
    .eq('id', id)
    .eq('pedido_id', pedidoId);
  if (error) return { error: 'No se pudo actualizar.' };

  // Si ya llegó todo lo pedido, el pedido pasa a "En fabricación".
  if (estado === 'recibido') {
    const { data: pend } = await supabase.from('pedidos_proveedor').select('id').eq('pedido_id', pedidoId).eq('estado', 'pedido');
    if (!pend?.length) {
      await supabase.from('pedidos').update({ etapa: 'en_fabricacion' }).eq('id', pedidoId).in('etapa', ['senado', 'pedido_fabrica']);
    }
  }
  refrescar(pedidoId);
  return { ok: 'Actualizado' };
}

export async function borrarPedidoProveedor(pedidoId: string, id: string): Promise<void> {
  const { supabase } = await miembroActual();
  await supabase.from('pedidos_proveedor').delete().eq('id', id).eq('pedido_id', pedidoId);
  refrescar(pedidoId);
}

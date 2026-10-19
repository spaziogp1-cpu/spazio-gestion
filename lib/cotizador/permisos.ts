import 'server-only';
import { redirect } from 'next/navigation';
import { miembroActual } from '@/lib/sesion';

/** La persona que está usando la app, solo si puede ver y editar costos. Si no, la manda al inicio. */
export async function conPermisoCostos() {
  const ctx = await miembroActual();
  if (ctx.miembro.rol === 'admin') return ctx;
  const { data } = await ctx.supabase.rpc('puede', { p_permiso: 'cotizador.costos' });
  if (data !== true) redirect('/?error=sin-permiso');
  return ctx;
}

/** Lo mismo para server actions: tira un error en vez de redirigir. */
export async function exigirPermisoCostos() {
  const ctx = await miembroActual();
  if (ctx.miembro.rol === 'admin') return ctx;
  const { data } = await ctx.supabase.rpc('puede', { p_permiso: 'cotizador.costos' });
  if (data !== true) throw new Error('No tenés permiso para ver ni cambiar costos.');
  return ctx;
}

export async function puedeVerCostos(): Promise<boolean> {
  const ctx = await miembroActual();
  if (ctx.miembro.rol === 'admin') return true;
  const { data } = await ctx.supabase.rpc('puede', { p_permiso: 'cotizador.costos' });
  return data === true;
}

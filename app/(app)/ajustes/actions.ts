'use server';

import { revalidatePath } from 'next/cache';
import { texto } from '@/lib/formato';
import { procesoDiario } from '@/lib/notificar/diario';
import { miembroActual } from '@/lib/sesion';

export type EstadoAjustes = { error?: string; ok?: string };

async function soloAdmin() {
  const ctx = await miembroActual();
  if (ctx.miembro.rol !== 'admin') throw new Error('Solo un administrador puede cambiar esto.');
  return ctx;
}

export async function guardarMiembro(id: string | null, _prev: EstadoAjustes, fd: FormData): Promise<EstadoAjustes> {
  try {
    const { supabase } = await soloAdmin();
    const nombre = texto(fd.get('nombre'));
    const email = texto(fd.get('email'))?.toLowerCase();
    if (!nombre || !email) return { error: 'Nombre y email son obligatorios.' };
    if (!/^\S+@\S+\.\S+$/.test(email)) return { error: 'El email no es válido.' };
    const fila = {
      nombre,
      email,
      alias_planilla: texto(fd.get('alias_planilla')),
      telefono: texto(fd.get('telefono')),
      rol: fd.get('rol') === 'admin' ? 'admin' : 'equipo',
      activo: fd.get('activo') === 'on',
    };
    const { error } = id ? await supabase.from('equipo').update(fila).eq('id', id) : await supabase.from('equipo').insert(fila);
    if (error) return { error: error.message.includes('duplicate') ? 'Ya hay alguien con ese email.' : `No se pudo guardar: ${error.message}` };
    revalidatePath('/ajustes');
    return { ok: id ? 'Guardado' : 'Agregado al equipo' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function guardarParametros(_prev: EstadoAjustes, fd: FormData): Promise<EstadoAjustes> {
  try {
    const { supabase } = await soloAdmin();
    const plazo = Math.round(Number(fd.get('plazo_entrega_dias')));
    const aviso = Math.round(Number(fd.get('aviso_dias_antes')));
    if (!(plazo > 0) || !(aviso >= 0)) return { error: 'Revisá los números.' };
    const tipo = fd.get('plazo_entrega_tipo') === 'habiles' ? 'habiles' : 'corridos';
    const filas = [
      { clave: 'plazo_entrega_dias', valor: String(plazo) },
      { clave: 'plazo_entrega_tipo', valor: tipo },
      { clave: 'aviso_dias_antes', valor: String(aviso) },
    ];
    for (const f of filas) {
      const { error } = await supabase.from('parametros').update({ valor: f.valor }).eq('clave', f.clave);
      if (error) return { error: `No se pudo guardar: ${error.message}` };
    }
    revalidatePath('/ajustes');
    return { ok: 'Guardado' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// Manda el resumen de hoy solo a quien lo pide, para probar cómo llega.
export async function enviarmeResumen(): Promise<EstadoAjustes> {
  const { miembro, supabase } = await miembroActual();
  try {
    let db = supabase;
    try {
      const { crearAdmin } = await import('@/lib/supabase/admin');
      db = crearAdmin() as unknown as typeof supabase;
    } catch {
      // Sin clave de servicio: se arma con los permisos del usuario.
    }
    const [inf] = await procesoDiario(db, miembro.id);
    revalidatePath('/', 'layout');
    if (!inf) return { error: 'No se encontró tu usuario.' };
    const wa =
      inf.whatsapp === 'enviado'
        ? ' También por WhatsApp.'
        : inf.whatsapp === 'sin teléfono'
          ? ' Para recibirlo por WhatsApp, cargá tu teléfono en Equipo.'
          : inf.whatsapp.startsWith('error')
            ? ` WhatsApp no salió (${inf.whatsapp}).`
            : '';
    if (inf.email === 'enviado') return { ok: `Listo: te mandé el resumen a ${miembro.email}${inf.avisos ? ` y se crearon ${inf.avisos} avisos` : ''}.${wa}` };
    if (inf.whatsapp === 'enviado') return { ok: `Te llegó por WhatsApp.${inf.email === 'sin configurar' ? '' : ` El email no salió: ${inf.email}`}` };
    if (inf.email === 'sin configurar') return { error: 'Falta configurar el envío de emails (RESEND_API_KEY en Vercel).' };
    return { error: `No se pudo mandar el email: ${inf.email}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function probarPlanilla(): Promise<EstadoAjustes> {
  const { supabase } = await miembroActual();
  try {
    const { planillaConfigurada } = await import('@/lib/planilla/google');
    if (!planillaConfigurada()) return { error: 'Falta cargar GOOGLE_SERVICE_ACCOUNT_JSON y PLANILLA_ID en Vercel.' };
    const { probarConexion, sincronizarPendientes } = await import('@/lib/planilla/sync');
    const encabezado = await probarConexion();
    const r = await sincronizarPendientes(supabase);
    revalidatePath('/ajustes');
    return {
      ok: `Conectada (VENTAS_2026 empieza con: ${encabezado}).${r.ok || r.error ? ` Pendientes: ${r.ok} escritos${r.error ? `, ${r.error} con error` : ''}.` : ''}`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// Trae las ventas pagadas de Tienda Nube de los últimos días que todavía no sean pedidos.
export async function importarTiendaNube(dias: number): Promise<EstadoAjustes> {
  try {
    await soloAdmin();
    const { crearAdmin } = await import('@/lib/supabase/admin');
    const { importarDesde } = await import('@/lib/tiendanube/importar');
    const { leerConexion } = await import('@/lib/tiendanube/api');
    const db = crearAdmin();
    if (!(await leerConexion(db))) return { error: 'Primero conectá la tienda.' };
    const desde = new Date(Date.now() - Math.min(Math.max(dias, 1), 60) * 86_400_000).toISOString();
    const r = await importarDesde(db, desde);
    revalidatePath('/ajustes');
    revalidatePath('/pedidos');
    if (r.errores.length) return { error: `${r.creadas} pedidos nuevos, ${r.errores.length} con error: ${r.errores[0]}` };
    if (!r.revisadas) return { ok: 'No hay ventas pagadas nuevas desde que se conectó la tienda.' };
    return { ok: `Revisé ${r.revisadas} ventas pagadas: ${r.creadas} pedidos nuevos${r.vinculadas ? `, ${r.vinculadas} ya estaban cargados a mano` : ''}.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

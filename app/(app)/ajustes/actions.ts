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

// ---------------------------------------------------------------------
// Asistente de IA: claves personales para conectar Claude o ChatGPT
// ---------------------------------------------------------------------
export async function crearClaveIA(nombre: string): Promise<EstadoAjustes & { clave?: string; url?: string }> {
  const { miembro, supabase } = await miembroActual();
  const { randomBytes } = await import('node:crypto');
  const { hashClave } = await import('@/lib/ia/mcp');
  const clave = `spz_${randomBytes(24).toString('base64url')}`;
  const { error } = await supabase.from('claves_ia').insert({
    miembro_id: miembro.id,
    nombre: ['Claude', 'ChatGPT', 'Otro'].includes(nombre) ? nombre : 'Claude',
    hash: hashClave(clave),
    ultimos: clave.slice(-4),
  });
  if (error) return { error: `No se pudo crear la clave: ${error.message}` };
  revalidatePath('/ajustes');
  return { ok: 'Clave creada', clave, url: `https://spazio-gestion.vercel.app/api/mcp/${clave}` };
}

export async function revocarClaveIA(id: string): Promise<EstadoAjustes> {
  const { supabase } = await miembroActual();
  const { error } = await supabase.from('claves_ia').update({ revocada_en: new Date().toISOString() }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/ajustes');
  return { ok: 'Clave revocada' };
}

// ---------------------------------------------------------------------
// Contraseñas
// ---------------------------------------------------------------------
const contrasenaValida = (p: string) => (p.length < 8 ? 'La contraseña tiene que tener al menos 8 caracteres.' : null);

/** Cada persona cambia su propia contraseña. */
export async function cambiarMiContrasena(_prev: EstadoAjustes, fd: FormData): Promise<EstadoAjustes> {
  const { supabase } = await miembroActual();
  const p1 = String(fd.get('password') ?? '');
  const p2 = String(fd.get('password2') ?? '');
  const mal = contrasenaValida(p1);
  if (mal) return { error: mal };
  if (p1 !== p2) return { error: 'Las dos contraseñas no coinciden.' };
  const { error } = await supabase.auth.updateUser({ password: p1 });
  if (error) return { error: /same|different/i.test(error.message) ? 'Es la misma contraseña que ya tenías.' : `No se pudo guardar: ${error.message}` };
  return { ok: 'Listo. Desde ahora podés entrar con tu email y esta contraseña.' };
}

/** Un administrador define la contraseña inicial de alguien del equipo (para que no tenga que usar el email). */
export async function definirContrasena(miembroId: string, _prev: EstadoAjustes, fd: FormData): Promise<EstadoAjustes> {
  try {
    const { supabase } = await soloAdmin();
    const password = String(fd.get('password') ?? '');
    const mal = contrasenaValida(password);
    if (mal) return { error: mal };
    const { data: m } = await supabase.from('equipo').select('email').eq('id', miembroId).single();
    if (!m) return { error: 'No se encontró a esa persona.' };
    const { crearAdmin } = await import('@/lib/supabase/admin');
    const admin = crearAdmin();
    const email = m.email.toLowerCase();
    const creado = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (creado.error) {
      // Ya tenía usuario: se busca y se le cambia la contraseña.
      let id: string | null = null;
      for (let page = 1; page <= 10 && !id; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) return { error: error.message };
        id = data.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
        if (data.users.length < 200) break;
      }
      if (!id) return { error: `No se pudo crear el usuario: ${creado.error.message}` };
      const { error } = await admin.auth.admin.updateUserById(id, { password, email_confirm: true });
      if (error) return { error: `No se pudo cambiar la contraseña: ${error.message}` };
    }
    return { ok: `Listo. Pasale la contraseña por privado; la puede cambiar en Ajustes.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// Trae ahora las ventas nuevas de la planilla original (también corre sola cada 15 minutos).
export async function traerDePlanillaOriginal(simular: boolean): Promise<EstadoAjustes> {
  try {
    const { miembro } = await soloAdmin();
    const { crearAdmin } = await import('@/lib/supabase/admin');
    const { importarDeOriginal } = await import('@/lib/planilla/importar-origen');
    const r = await importarDeOriginal(crearAdmin(`${miembro.email}`), { simular });
    revalidatePath('/ajustes');
    revalidatePath('/pedidos');
    const partes = [
      `Revisé ${r.revisadas} ventas de la planilla original.`,
      r.creadas.length ? `${simular ? 'Se crearían' : 'Pedidos nuevos'}: ${r.creadas.join(', ')}.` : 'No hay ventas nuevas para crear.',
      r.vinculadas ? `${r.vinculadas} ya estaban en la app.` : '',
    ].filter(Boolean);
    if (r.errores.length) return { error: `${partes.join(' ')} Errores: ${r.errores.join(' · ')}` };
    return { ok: partes.join(' ') };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

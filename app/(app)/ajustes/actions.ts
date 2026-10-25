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
      rol: fd.get('rol') === 'admin' ? 'admin' : fd.get('rol') === 'vendedor' ? 'vendedor' : 'equipo',
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
    // Interruptor de los WhatsApp automáticos (la fila se crea la primera vez).
    const { error: eWa } = await supabase.from('parametros').upsert(
      { clave: 'whatsapp_activo', valor: fd.get('whatsapp_activo') === 'on' ? 'si' : 'no', nota: 'Avisos automáticos por WhatsApp (si / no)' },
      { onConflict: 'clave' },
    );
    if (eWa) return { error: `No se pudo guardar: ${eWa.message}` };
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
    if (!planillaConfigurada()) return { error: 'Falta cargar GOOGLE_SERVICE_ACCOUNT_JSON en Vercel.' };
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

// ---------------------------------------------------------------------
// Reportes y recordatorios dentro de la app (los genera la base cada minuto).
const DIAS = ['1', '2', '3', '4', '5', '6', '7'];

export async function guardarAvisos(_prev: EstadoAjustes, fd: FormData): Promise<EstadoAjustes> {
  try {
    const { supabase } = await soloAdmin();
    const hora = (k: string) => {
      const v = String(fd.get(k) ?? '').trim();
      return /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null;
    };
    const manana = hora('reporte_manana_hora');
    const tarde = hora('reporte_tarde_hora');
    if (!manana || !tarde) return { error: 'Escribí las horas como 08:30.' };
    if (manana >= tarde) return { error: 'El reporte de la mañana tiene que ser antes que el de la tarde.' };
    const dias = DIAS.filter((d) => fd.get(`dia_${d}`) === 'on');
    if (!dias.length) return { error: 'Elegí al menos un día.' };
    const minutos = Math.round(Number(fd.get('recordatorio_minutos')));
    if (!(minutos >= 5 && minutos <= 240)) return { error: 'El recordatorio tiene que ser entre 5 y 240 minutos antes.' };
    const minutosTarea = Math.round(Number(fd.get('recordatorio_tarea_minutos') ?? 30));
    if (!(minutosTarea >= 5 && minutosTarea <= 240)) return { error: 'El recordatorio de las tareas tiene que ser entre 5 y 240 minutos antes.' };
    const zona = String(fd.get('zona_horaria') ?? '').trim() || 'America/Argentina/Buenos_Aires';
    try {
      new Intl.DateTimeFormat('es-AR', { timeZone: zona });
    } catch {
      return { error: `"${zona}" no es una zona horaria válida (por ejemplo America/Argentina/Buenos_Aires).` };
    }
    const filas = [
      { clave: 'reporte_manana_hora', valor: manana, nota: 'Hora del reporte de la mañana (HH:MM)' },
      { clave: 'reporte_tarde_hora', valor: tarde, nota: 'Hora del reporte de la tarde (HH:MM)' },
      { clave: 'reporte_dias', valor: dias.join(','), nota: 'Días con reporte: 1 = lunes … 7 = domingo' },
      { clave: 'recordatorio_minutos', valor: String(minutos), nota: 'Minutos antes de una entrega o visita para el recordatorio' },
      { clave: 'zona_horaria', valor: zona, nota: 'Zona horaria de los avisos' },
      { clave: 'recordatorio_tarea_minutos', valor: String(minutosTarea), nota: 'Minutos antes de una tarea con hora para el recordatorio' },
    ];
    const { error } = await supabase.from('parametros').upsert(filas, { onConflict: 'clave' });
    if (error) return { error: `No se pudo guardar: ${error.message}` };
    revalidatePath('/ajustes');
    return { ok: 'Guardado. Los cambios se usan desde el próximo minuto.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// Genera ahora el reporte de quien lo pide, para ver cómo queda (no reemplaza al del día).
export async function probarReporte(tipo: 'manana' | 'tarde'): Promise<EstadoAjustes & { id?: string }> {
  const { supabase } = await miembroActual();
  const { data, error } = await supabase.rpc('notif_reporte_prueba', { p_tipo: tipo });
  if (error) return { error: error.message.includes('notif_reporte_prueba') ? 'Falta correr la migración 0017 en Supabase.' : error.message };
  revalidatePath('/', 'layout');
  return { ok: 'Listo: está en Avisos.', id: data as string };
}

// Turnos online del showroom (página /turnos).
export async function guardarTurnos(_prev: EstadoAjustes, fd: FormData): Promise<EstadoAjustes> {
  try {
    const { supabase } = await soloAdmin();
    const hora = (v: FormDataEntryValue | null) => {
      const t = String(v ?? '').trim();
      return /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : null;
    };
    const horarios: Record<string, string> = {};
    for (let d = 1; d <= 7; d++) {
      if (fd.get(`abre_${d}`) !== 'on') continue;
      const desde = hora(fd.get(`desde_${d}`));
      const hasta = hora(fd.get(`hasta_${d}`));
      if (!desde || !hasta || desde >= hasta) return { error: `Revisá el horario del día ${['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][d - 1]}.` };
      horarios[String(d)] = `${desde}-${hasta}`;
    }
    const entero = (k: string, min: number, max: number, nombre: string) => {
      const n = Math.round(Number(fd.get(k)));
      if (!(n >= min && n <= max)) throw new Error(`${nombre}: entre ${min} y ${max}.`);
      return String(n);
    };
    // Días cerrados: uno por renglón o separados por coma, como 24/12 o 24/12/2026.
    const anio = Number(new Intl.DateTimeFormat('en', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric' }).format(new Date()));
    const cerrados: string[] = [];
    for (const t of String(fd.get('turnos_cerrados') ?? '').split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean)) {
      const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(t) ?? null;
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
      if (!m && !iso) return { error: `"${t}" no es una fecha (escribila como 24/12 o 24/12/2026).` };
      cerrados.push(iso ?? `${m![3] ? (m![3].length === 2 ? 2000 + Number(m![3]) : Number(m![3])) : anio}-${m![2].padStart(2, '0')}-${m![1].padStart(2, '0')}`);
    }
    const filas = [
      { clave: 'turnos_activo', valor: fd.get('turnos_activo') === 'on' ? 'si' : 'no', nota: 'Turnos online del showroom: si / no' },
      { clave: 'turnos_horarios', valor: JSON.stringify(horarios), nota: 'Horario de cada día (1 = lunes … 7 = domingo). Sin horario: cerrado' },
      { clave: 'turnos_duracion', valor: entero('turnos_duracion', 10, 240, 'Duración'), nota: 'Minutos de cada turno' },
      { clave: 'turnos_cupo', valor: entero('turnos_cupo', 1, 10, 'Visitas por horario'), nota: 'Cuántas visitas pueden reservar el mismo horario' },
      { clave: 'turnos_anticipacion_horas', valor: entero('turnos_anticipacion_horas', 0, 168, 'Anticipación'), nota: 'Horas mínimas de anticipación para reservar' },
      { clave: 'turnos_dias_adelante', valor: entero('turnos_dias_adelante', 1, 90, 'Días adelante'), nota: 'Hasta cuántos días adelante se puede reservar' },
      { clave: 'turnos_cerrados', valor: [...new Set(cerrados)].sort().join(','), nota: 'Días sin turnos, además de los feriados (AAAA-MM-DD separados por coma)' },
      { clave: 'showroom_direccion', valor: String(fd.get('showroom_direccion') ?? '').trim().slice(0, 200), nota: 'Dirección del showroom (se muestra al reservar)' },
      { clave: 'showroom_whatsapp', valor: String(fd.get('showroom_whatsapp') ?? '').trim().slice(0, 40), nota: 'WhatsApp de contacto que se muestra al reservar' },
    ];
    const { error } = await supabase.from('parametros').upsert(filas, { onConflict: 'clave' });
    if (error) return { error: `No se pudo guardar: ${error.message}` };
    revalidatePath('/ajustes');
    revalidatePath('/showroom');
    return { ok: 'Guardado. La página de turnos ya muestra los horarios nuevos.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// Reparto: etapa que habilita el despacho, depósito, carga y tiempos de cada parada.
const UNIDADES_CLAVES = ['mesa ratona', 'mesa auxiliar', 'mesa de luz', 'espejos', 'escritorio', 'mesa alta', 'mesa alta grande', 'sillas', 'taburete', 'estanteria', 'otro'];
export async function guardarReparto(_prev: EstadoAjustes, fd: FormData): Promise<EstadoAjustes> {
  try {
    const { supabase } = await soloAdmin();
    const etapa = fd.get('entregas_etapa_despacho') === 'lista' ? 'lista' : 'embalada';
    const num = (k: string, min: number, max: number, nombre: string) => {
      const n = Number(String(fd.get(k) ?? '').replace(',', '.'));
      if (!(n >= min && n <= max)) throw new Error(`${nombre}: entre ${min} y ${max}.`);
      return n;
    };
    const unidades: Record<string, number> = {};
    for (const k of UNIDADES_CLAVES) unidades[k] = num(`u_${k}`, 0, 20, `Carga de "${k}"`);
    const tiempos = {
      base: num('t_base', 0, 120, 'Minutos base'),
      por_unidad: num('t_por_unidad', 0, 60, 'Minutos por unidad'),
      por_piso: num('t_por_piso', 0, 30, 'Minutos por piso'),
      instalacion: num('t_instalacion', 0, 240, 'Minutos de instalación'),
    };
    const largo = num('entregas_largo_grande', 50, 400, 'Largo de mesa alta grande');
    const deposito = String(fd.get('deposito_direccion') ?? '').trim().slice(0, 200);
    if (!deposito) return { error: 'Escribí la dirección del depósito.' };

    const { data: antes } = await supabase.from('parametros').select('valor').eq('clave', 'deposito_direccion').maybeSingle();
    const filas: { clave: string; valor: string; nota: string }[] = [
      { clave: 'entregas_etapa_despacho', valor: etapa, nota: 'Etapa desde la que un pedido entra a Entregas: lista (Fabricada) o embalada' },
      { clave: 'deposito_direccion', valor: deposito, nota: 'Desde dónde salen los repartos' },
      { clave: 'entregas_unidades', valor: JSON.stringify(unidades), nota: 'Unidades de carga por producto (1 = una mesa ratona)' },
      { clave: 'entregas_largo_grande', valor: String(largo), nota: 'Desde qué largo (cm) una mesa alta cuenta como grande' },
      { clave: 'entregas_tiempos', valor: JSON.stringify(tiempos), nota: 'Minutos en cada parada: base, por unidad de carga, por piso sin ascensor y por instalación' },
    ];
    let aviso = '';
    const { geocodificar, mapsConfigurado } = await import('@/lib/entregas/geocodificar');
    const { data: lat } = await supabase.from('parametros').select('valor').eq('clave', 'deposito_lat').maybeSingle();
    if ((antes?.valor !== deposito || !lat?.valor) && mapsConfigurado()) {
      const r = await geocodificar(`${deposito}, Argentina`);
      if (r.ok) {
        filas.push({ clave: 'deposito_lat', valor: String(r.ubicacion.lat), nota: 'Latitud del depósito' }, { clave: 'deposito_lng', valor: String(r.ubicacion.lng), nota: 'Longitud del depósito' });
        aviso = ` Depósito ubicado: ${r.ubicacion.direccionGoogle}.`;
      } else aviso = ` No se pudo ubicar el depósito: ${r.error}.`;
    }
    const { error } = await supabase.from('parametros').upsert(filas, { onConflict: 'clave' });
    if (error) return { error: `No se pudo guardar: ${error.message}` };
    await supabase.rpc('entregas_recalcular');
    revalidatePath('/ajustes');
    revalidatePath('/entregas');
    return { ok: `Guardado. Las entregas abiertas se recalcularon.${aviso}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// Vehículos de los fleteros (planificación de entregas).
export async function guardarVehiculo(id: string | null, _prev: EstadoAjustes, fd: FormData): Promise<EstadoAjustes> {
  try {
    const { supabase } = await soloAdmin();
    const t = (k: string) => String(fd.get(k) ?? '').trim();
    const n = (k: string, min: number, max: number, nombre: string, opcional = false) => {
      const v = t(k);
      if (opcional && !v) return null;
      const x = Number(v.replace(',', '.'));
      if (!(x >= min && x <= max)) throw new Error(`${nombre}: entre ${min} y ${max}.`);
      return x;
    };
    const hora = (k: string) => {
      const v = t(k);
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new Error('Escribí la jornada como 08:30.');
      return v;
    };
    if (!t('nombre')) return { error: 'Poné un nombre al vehículo (por ejemplo, Trafic).' };
    const dias = [1, 2, 3, 4, 5, 6, 7].filter((d) => fd.get(`dia_${d}`) === 'on');
    const fila = {
      nombre: t('nombre').slice(0, 60),
      fletero: t('fletero') || null,
      telefono: t('telefono') || null,
      capacidad: n('capacidad', 0.25, 50, 'Capacidad'),
      largo_max: n('largo_max', 30, 600, 'Largo máximo'),
      ancho_max: n('ancho_max', 30, 300, 'Ancho máximo'),
      alto_max: n('alto_max', 30, 300, 'Alto máximo'),
      personas_max: n('personas_max', 1, 6, 'Personas'),
      jornada_desde: hora('jornada_desde'),
      jornada_hasta: hora('jornada_hasta'),
      vuelve_deposito: fd.get('vuelve_deposito') === 'on',
      dias: dias.join(','),
      precio_entrega: n('precio_entrega', 0, 10_000_000, 'Precio por entrega') ?? 0,
      descuento_desde: n('descuento_desde', 1, 50, 'Descuento desde'),
      precio_descuento: n('precio_descuento', 0, 10_000_000, 'Precio con descuento', true),
      activo: fd.get('activo') === 'on',
    };
    if (fila.jornada_hasta <= fila.jornada_desde) return { error: 'La jornada tiene que terminar después de empezar.' };
    const { error } = id ? await supabase.from('vehiculos').update(fila).eq('id', id) : await supabase.from('vehiculos').insert(fila);
    if (error) return { error: `No se pudo guardar: ${error.message}` };
    revalidatePath('/ajustes');
    revalidatePath('/entregas/planificar');
    return { ok: 'Guardado.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ENVIOS, ETAPAS, nombreEtapa } from '@/lib/constantes';
import { hoyAR, sumarDiasCorridos } from '@/lib/fechas';
import { actualizarPedido as actualizarEnPlanilla } from '@/lib/planilla/sync';
import { armarResumen } from '@/lib/resumen';

// Herramientas que la IA (Claude o ChatGPT) puede usar sobre los datos de la app.
// Todas actúan en nombre de la persona dueña de la clave.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = SupabaseClient<any, any, any>;
type Yo = { id: string; nombre: string; email: string };
type Args = Record<string, unknown>;
export type Contexto = { db: Cliente; yo: Yo };

type Herramienta = {
  name: string;
  title: string;
  description: string;
  soloLectura: boolean;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  ejecutar: (ctx: Contexto, args: Args) => Promise<unknown>;
};

class ErrorUsuario extends Error {}

const fechaOk = (v: unknown, campo: string): string => {
  const s = String(v ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ErrorUsuario(`${campo} tiene que tener formato AAAA-MM-DD`);
  return s;
};
const str = (v: unknown) => (v == null || v === '' ? null : String(v).trim() || null);
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function pedidoPorNumero(db: Cliente, numero: unknown) {
  const n = num(numero);
  if (!n) throw new ErrorUsuario('Falta el número de pedido');
  const { data } = await db.from('pedidos_resumen').select('*').eq('numero', n).maybeSingle();
  if (!data) throw new ErrorUsuario(`No existe el pedido #${n}`);
  return data as Record<string, any>;
}

async function miembroPorNombre(db: Cliente, nombre: string | null, yo: Yo): Promise<string | null> {
  if (!nombre) return yo.id;
  const n = nombre.toLowerCase();
  if (['equipo', 'todo el equipo', 'todos', 'nadie'].includes(n)) return null;
  if (['yo', 'mi', 'mí'].includes(n)) return yo.id;
  const { data } = await db.from('equipo').select('id, nombre, alias_planilla, email').eq('activo', true);
  const m = (data ?? []).find(
    (x: { nombre: string; alias_planilla: string | null; email: string }) =>
      x.nombre.toLowerCase().startsWith(n) || x.alias_planilla?.toLowerCase() === n || x.email.toLowerCase().startsWith(n),
  );
  if (!m) throw new ErrorUsuario(`No hay nadie activo en el equipo que se llame "${nombre}"`);
  return m.id;
}

const resumenPedido = (p: Record<string, any>) => ({
  numero: p.numero,
  cliente: p.cliente_nombre,
  localidad: p.cliente_localidad,
  productos: p.productos,
  etapa: nombreEtapa(p.etapa),
  canal: p.canal,
  vendedor: p.responsable_nombre,
  fecha_venta: p.fecha_venta,
  fecha_limite: p.fecha_limite,
  atrasado: p.atrasado,
  entrega_programada: p.fecha_entrega_programada ? `${p.fecha_entrega_programada}${p.hora_entrega_programada ? ' ' + String(p.hora_entrega_programada).slice(0, 5) : ''}` : null,
  envio: p.envio,
  total: Number(p.total),
  envio_cliente: Number(p.precio_envio_cliente),
  pagado: Number(p.pagado),
  saldo: Number(p.saldo),
  proveedores: p.prov_resumen || null,
});

export const HERRAMIENTAS: Herramienta[] = [
  {
    name: 'resumen_del_dia',
    title: 'Resumen del día',
    description:
      'Lo pendiente de hoy para quien pregunta: tareas vencidas y de hoy, visitas, entregas, pedidos atrasados o por vencer, pedidos listos para avisar, saldos por cobrar y proveedores demorados.',
    soloLectura: true,
    inputSchema: { type: 'object', properties: {} },
    async ejecutar({ db, yo }) {
      const r = await armarResumen(db, yo.id, 3);
      const t = (x: { titulo: string; vencimiento: string | null; id: string }) => ({ id: x.id, titulo: x.titulo, vence: x.vencimiento });
      return {
        hoy: hoyAR(),
        tareas_vencidas: r.tareasVencidas.map(t),
        tareas_de_hoy: r.tareasHoy.map(t),
        visitas_de_hoy: r.visitasHoy.map((v) => ({ nombre: v.nombre, hora: v.hora, motivo: v.motivo })),
        entregas_de_hoy: r.entregasHoy.map(resumenPedido),
        pedidos_atrasados: r.atrasados.map(resumenPedido),
        pedidos_por_vencer: r.porVencer.map(resumenPedido),
        listos_para_avisar: r.listasSinAvisar.map(resumenPedido),
        saldos_por_cobrar: r.saldos.map(resumenPedido),
        proveedores_demorados: r.proveedoresDemorados.map((x) => ({ proveedor: x.proveedor_nombre, pedido: x.pedido_numero, esperado: x.fecha_esperada, detalle: x.detalle })),
      };
    },
  },
  {
    name: 'buscar_pedidos',
    title: 'Buscar pedidos',
    description:
      'Busca pedidos por cliente, número, producto o localidad, y/o filtra por etapa. Por defecto trae solo los activos (no entregados ni cancelados). Etapas: senado, en_fabricacion, lista (se muestra como Fabricada), embalada, envio_coordinado, entregado, cancelado.',
    soloLectura: true,
    inputSchema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Cliente, número, producto o localidad' },
        etapa: { type: 'string', description: 'Una etapa puntual' },
        solo_atrasados: { type: 'boolean' },
        con_saldo: { type: 'boolean', description: 'Solo los que tienen saldo por cobrar' },
        incluir_terminados: { type: 'boolean', description: 'Incluir entregados y cancelados' },
      },
    },
    async ejecutar({ db }, a) {
      let q = db.from('pedidos_resumen').select('*').order('fecha_limite').limit(60);
      if (str(a.etapa)) q = q.eq('etapa', str(a.etapa));
      else if (!a.incluir_terminados) q = q.not('etapa', 'in', '(entregado,cancelado)');
      if (a.solo_atrasados) q = q.eq('atrasado', true);
      if (a.con_saldo) q = q.gt('saldo', 0);
      const texto = str(a.texto);
      if (texto) {
        const n = num(texto.replace('#', ''));
        q = n
          ? q.eq('numero', n)
          : q.or(`cliente_nombre.ilike.%${texto.replace(/[,()%]/g, ' ')}%,productos.ilike.%${texto.replace(/[,()%]/g, ' ')}%,cliente_localidad.ilike.%${texto.replace(/[,()%]/g, ' ')}%`);
      }
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { cantidad: data?.length ?? 0, pedidos: (data ?? []).map(resumenPedido) };
    },
  },
  {
    name: 'ver_pedido',
    title: 'Ver un pedido',
    description: 'Todo sobre un pedido por su número: cliente y contacto, productos, pagos, pedidos a proveedores, tareas y notas.',
    soloLectura: true,
    inputSchema: { type: 'object', properties: { numero: { type: 'number' } }, required: ['numero'] },
    async ejecutar({ db }, a) {
      const p = await pedidoPorNumero(db, a.numero);
      const [c, items, pagos, prov, tareas, notas] = await Promise.all([
        db.from('clientes').select('nombre, telefono, email, dni, direccion, localidad, codigo_postal').eq('id', p.cliente_id).single(),
        db.from('pedido_items').select('producto, modelo, color, puntas, tapa, material, medidas, cantidad, precio').eq('pedido_id', p.id).order('orden'),
        db.from('pagos').select('tipo, monto, medio, fecha, nota').eq('pedido_id', p.id).order('fecha'),
        db.from('proveedor_pendientes').select('proveedor_nombre, estado, detalle, fecha_pedido, fecha_esperada, fecha_recepcion, monto, demorado').eq('pedido_id', p.id),
        db.from('tareas_resumen').select('id, titulo, estado, vencimiento, responsable_nombre').eq('pedido_id', p.id).neq('estado', 'hecha'),
        db.from('comentarios').select('texto, creado_en').eq('pedido_id', p.id).order('creado_en', { ascending: false }).limit(10),
      ]);
      return {
        ...resumenPedido(p),
        direccion_entrega: p.direccion_entrega,
        forma_pago: p.forma_pago,
        observaciones: p.observaciones,
        cliente: c.data,
        productos: items.data,
        pagos: pagos.data,
        pedidos_a_proveedores: prov.data,
        tareas_abiertas: tareas.data,
        notas: notas.data,
        link: `https://spazio-gestion.vercel.app/pedidos/${p.id}`,
      };
    },
  },
  {
    name: 'calendario',
    title: 'Calendario',
    description: 'Entregas programadas, fechas límite, visitas al showroom, tareas con fecha y llegadas de proveedores entre dos fechas (AAAA-MM-DD). Máximo 62 días.',
    soloLectura: true,
    inputSchema: {
      type: 'object',
      properties: { desde: { type: 'string', description: 'AAAA-MM-DD' }, hasta: { type: 'string', description: 'AAAA-MM-DD' } },
      required: ['desde', 'hasta'],
    },
    async ejecutar({ db }, a) {
      const desde = fechaOk(a.desde, 'desde');
      let hasta = fechaOk(a.hasta, 'hasta');
      if (hasta > sumarDiasCorridos(desde, 62)) hasta = sumarDiasCorridos(desde, 62);
      const [entregas, limites, visitas, tareas, prov] = await Promise.all([
        db.from('pedidos_resumen').select('*').neq('etapa', 'cancelado').gte('fecha_entrega_programada', desde).lte('fecha_entrega_programada', hasta).order('fecha_entrega_programada'),
        db.from('pedidos_resumen').select('*').not('etapa', 'in', '(entregado,cancelado)').is('fecha_entrega_programada', null).gte('fecha_limite', desde).lte('fecha_limite', hasta).order('fecha_limite'),
        db.from('visitas').select('nombre, fecha, hora, motivo, estado').gte('fecha', desde).lte('fecha', hasta).neq('estado', 'cancelada').order('fecha'),
        db.from('tareas_resumen').select('id, titulo, vencimiento, responsable_nombre, prioridad').neq('estado', 'hecha').gte('vencimiento', desde).lte('vencimiento', hasta).order('vencimiento'),
        db.from('proveedor_pendientes').select('proveedor_nombre, fecha_esperada, detalle, pedido_numero, cliente_nombre, es_stock').eq('estado', 'pedido').gte('fecha_esperada', desde).lte('fecha_esperada', hasta),
      ]);
      return {
        entregas: (entregas.data ?? []).map(resumenPedido),
        fechas_limite_sin_entrega_agendada: (limites.data ?? []).map(resumenPedido),
        visitas: visitas.data,
        tareas: (tareas.data ?? []).map((t: Record<string, any>) => ({ ...t, responsable_nombre: t.responsable_nombre ?? 'Todo el equipo' })),
        llegadas_de_proveedores: prov.data,
      };
    },
  },
  {
    name: 'listar_tareas',
    title: 'Listar tareas',
    description: 'Tareas abiertas. "de" puede ser "mias" (por defecto), "todos", o el nombre de una persona. Las tareas de todo el equipo aparecen en todas las listas.',
    soloLectura: true,
    inputSchema: { type: 'object', properties: { de: { type: 'string' } } },
    async ejecutar({ db, yo }, a) {
      const de = str(a.de)?.toLowerCase() ?? 'mias';
      let q = db.from('tareas_resumen').select('id, titulo, estado, prioridad, vencimiento, vencida, responsable_nombre, pedido_numero, pedido_cliente').neq('estado', 'hecha').order('vencimiento', { nullsFirst: false }).limit(100);
      if (de !== 'todos') {
        const id = de === 'mias' || de === 'mías' ? yo.id : await miembroPorNombre(db, de, yo);
        q = id ? q.or(`responsable_id.eq.${id},responsable_id.is.null`) : q.is('responsable_id', null);
      }
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []).map((t: Record<string, any>) => ({ ...t, responsable_nombre: t.responsable_nombre ?? 'Todo el equipo' }));
    },
  },
  {
    name: 'reporte_ventas',
    title: 'Reporte de ventas',
    description: 'Cantidad de ventas y facturación entre dos fechas (por fecha de venta, sin cancelados), con el detalle por canal y por vendedor.',
    soloLectura: true,
    inputSchema: {
      type: 'object',
      properties: { desde: { type: 'string', description: 'AAAA-MM-DD' }, hasta: { type: 'string', description: 'AAAA-MM-DD' } },
      required: ['desde', 'hasta'],
    },
    async ejecutar({ db }, a) {
      const desde = fechaOk(a.desde, 'desde');
      const hasta = fechaOk(a.hasta, 'hasta');
      const { data, error } = await db.from('pedidos_resumen').select('canal, responsable_nombre, total, pagado, saldo').neq('etapa', 'cancelado').gte('fecha_venta', desde).lte('fecha_venta', hasta);
      if (error) throw new Error(error.message);
      const filas = (data ?? []) as { canal: string; responsable_nombre: string | null; total: number; pagado: number; saldo: number }[];
      const agrupar = (clave: (f: (typeof filas)[number]) => string) => {
        const m: Record<string, { ventas: number; facturacion: number }> = {};
        for (const f of filas) {
          const k = clave(f);
          m[k] ??= { ventas: 0, facturacion: 0 };
          m[k].ventas++;
          m[k].facturacion += Number(f.total);
        }
        return m;
      };
      return {
        desde,
        hasta,
        ventas: filas.length,
        facturacion: filas.reduce((s, f) => s + Number(f.total), 0),
        cobrado: filas.reduce((s, f) => s + Number(f.pagado), 0),
        saldo_pendiente: filas.reduce((s, f) => s + Math.max(0, Number(f.saldo)), 0),
        por_canal: agrupar((f) => f.canal),
        por_vendedor: agrupar((f) => f.responsable_nombre ?? 'sin vendedor'),
      };
    },
  },
  {
    name: 'crear_tarea',
    title: 'Crear tarea',
    description: 'Crea una tarea. "responsable": nombre de la persona, "equipo" para todo el equipo, o vacío para quien pregunta. "vencimiento" en AAAA-MM-DD; "hora" opcional en HH:MM (va al calendario y avisa antes). Opcional: número de pedido relacionado.',
    soloLectura: false,
    inputSchema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        responsable: { type: 'string' },
        vencimiento: { type: 'string', description: 'AAAA-MM-DD' },
        hora: { type: 'string', description: 'HH:MM, opcional (necesita vencimiento)' },
        prioridad: { type: 'string', enum: ['baja', 'media', 'alta'] },
        pedido_numero: { type: 'number' },
        descripcion: { type: 'string' },
      },
      required: ['titulo'],
    },
    async ejecutar({ db, yo }, a) {
      const titulo = str(a.titulo);
      if (!titulo) throw new ErrorUsuario('Falta el título');
      const responsable_id = await miembroPorNombre(db, str(a.responsable), yo);
      const pedido = a.pedido_numero ? await pedidoPorNumero(db, a.pedido_numero) : null;
      const prioridad = ['baja', 'media', 'alta'].includes(String(a.prioridad)) ? String(a.prioridad) : 'media';
      const vencimiento = a.vencimiento ? fechaOk(a.vencimiento, 'vencimiento') : null;
      const horaTxt = str(a.hora);
      if (horaTxt && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(horaTxt)) throw new ErrorUsuario('La hora tiene que ser HH:MM');
      if (horaTxt && !vencimiento) throw new ErrorUsuario('Para poner hora hace falta el día (vencimiento)');
      const { data, error } = await db
        .from('tareas')
        .insert({
          titulo,
          descripcion: str(a.descripcion),
          responsable_id,
          creado_por: yo.id,
          prioridad,
          vencimiento,
          ...(horaTxt ? { hora: horaTxt.padStart(5, '0') } : {}),
          pedido_id: pedido?.id ?? null,
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      return { ok: true, tarea_id: data.id };
    },
  },
  {
    name: 'completar_tarea',
    title: 'Marcar tarea como hecha',
    description: 'Marca una tarea como hecha. Usar el id que devuelven listar_tareas, resumen_del_dia o ver_pedido.',
    soloLectura: false,
    inputSchema: { type: 'object', properties: { tarea_id: { type: 'string' } }, required: ['tarea_id'] },
    async ejecutar({ db }, a) {
      const id = str(a.tarea_id);
      if (!id) throw new ErrorUsuario('Falta el id de la tarea');
      const { data, error } = await db.from('tareas').update({ estado: 'hecha' }).eq('id', id).select('titulo');
      if (error) throw new Error(error.message);
      if (!data?.length) throw new ErrorUsuario('No se encontró esa tarea');
      return { ok: true, tarea: data[0].titulo };
    },
  },
  {
    name: 'cambiar_etapa',
    title: 'Cambiar la etapa de un pedido',
    description: `Pasa un pedido a otra etapa. Etapas: ${ETAPAS.map((e) => `${e.id} (${e.nombre})`).join(', ')}. Al pasar a "entregado" se registra la fecha real de entrega de hoy.`,
    soloLectura: false,
    inputSchema: {
      type: 'object',
      properties: { numero: { type: 'number' }, etapa: { type: 'string', enum: ETAPAS.map((e) => e.id) } },
      required: ['numero', 'etapa'],
    },
    async ejecutar({ db }, a) {
      const p = await pedidoPorNumero(db, a.numero);
      const etapa = String(a.etapa);
      if (!ETAPAS.some((e) => e.id === etapa)) throw new ErrorUsuario('Etapa inválida');
      const cambios: Record<string, unknown> = { etapa };
      if (etapa === 'entregado') cambios.fecha_entrega_real = hoyAR();
      const { error } = await db.from('pedidos').update(cambios).eq('id', p.id);
      if (error) throw new Error(error.message);
      await actualizarEnPlanilla(db, p.id);
      return { ok: true, pedido: p.numero, antes: nombreEtapa(p.etapa), ahora: nombreEtapa(etapa) };
    },
  },
  {
    name: 'agendar_entrega',
    title: 'Agendar entrega',
    description:
      'Programa la entrega o el retiro de un pedido: fecha (AAAA-MM-DD), horario opcional (HH:MM) y modalidad (retira, flete, expreso, coordinar). Si el pedido estaba listo, pasa a "Envío o retiro coordinado".',
    soloLectura: false,
    inputSchema: {
      type: 'object',
      properties: {
        numero: { type: 'number' },
        fecha: { type: 'string', description: 'AAAA-MM-DD' },
        hora: { type: 'string', description: 'HH:MM' },
        envio: { type: 'string', enum: ENVIOS.map((e) => e.id) },
      },
      required: ['numero', 'fecha'],
    },
    async ejecutar({ db }, a) {
      const p = await pedidoPorNumero(db, a.numero);
      const hora = str(a.hora);
      const cambios: Record<string, unknown> = {
        fecha_entrega_programada: fechaOk(a.fecha, 'fecha'),
        hora_entrega_programada: hora && /^\d{1,2}:\d{2}$/.test(hora) ? hora.padStart(5, '0') : null,
      };
      if (ENVIOS.some((e) => e.id === a.envio)) cambios.envio = a.envio;
      if (p.etapa === 'lista' || p.etapa === 'embalada') cambios.etapa = 'envio_coordinado';
      const { error } = await db.from('pedidos').update(cambios).eq('id', p.id);
      if (error) throw new Error(error.message);
      if (cambios.etapa) await actualizarEnPlanilla(db, p.id);
      return { ok: true, pedido: p.numero, ...cambios };
    },
  },
  {
    name: 'registrar_pago',
    title: 'Registrar pago',
    description: 'Registra un pago de un cliente en un pedido. Tipo: sena, saldo, total u otro. Medio: transferencia, efectivo, pagonube, cuotas/mp, etc.',
    soloLectura: false,
    inputSchema: {
      type: 'object',
      properties: {
        numero: { type: 'number' },
        monto: { type: 'number' },
        tipo: { type: 'string', enum: ['sena', 'saldo', 'total', 'otro'] },
        medio: { type: 'string' },
        fecha: { type: 'string', description: 'AAAA-MM-DD, por defecto hoy' },
        nota: { type: 'string' },
      },
      required: ['numero', 'monto'],
    },
    async ejecutar({ db, yo }, a) {
      const p = await pedidoPorNumero(db, a.numero);
      const monto = num(a.monto);
      if (!monto || monto <= 0) throw new ErrorUsuario('El monto tiene que ser mayor a cero');
      const tipo = ['sena', 'saldo', 'total', 'otro'].includes(String(a.tipo)) ? String(a.tipo) : 'saldo';
      const { error } = await db.from('pagos').insert({
        pedido_id: p.id,
        tipo,
        monto,
        medio: str(a.medio),
        fecha: a.fecha ? fechaOk(a.fecha, 'fecha') : hoyAR(),
        nota: str(a.nota),
        creado_por: yo.id,
      });
      if (error) throw new Error(error.message);
      return { ok: true, pedido: p.numero, saldo_anterior: Number(p.saldo), saldo_nuevo: Number(p.saldo) - monto };
    },
  },
  {
    name: 'agregar_nota',
    title: 'Agregar nota a un pedido',
    description: 'Agrega una nota interna al pedido (queda en la ficha, visible para todo el equipo).',
    soloLectura: false,
    inputSchema: { type: 'object', properties: { numero: { type: 'number' }, texto: { type: 'string' } }, required: ['numero', 'texto'] },
    async ejecutar({ db, yo }, a) {
      const p = await pedidoPorNumero(db, a.numero);
      const texto = str(a.texto);
      if (!texto) throw new ErrorUsuario('Falta el texto');
      const { error } = await db.from('comentarios').insert({ pedido_id: p.id, autor_id: yo.id, texto });
      if (error) throw new Error(error.message);
      return { ok: true, pedido: p.numero };
    },
  },
];

export async function ejecutarHerramienta(ctx: Contexto, nombre: string, args: Args): Promise<{ texto: string; error: boolean }> {
  const h = HERRAMIENTAS.find((x) => x.name === nombre);
  if (!h) return { texto: `No existe la herramienta ${nombre}`, error: true };
  try {
    const r = await h.ejecutar(ctx, args ?? {});
    return { texto: JSON.stringify(r, null, 1), error: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!(e instanceof ErrorUsuario)) console.error('ia', nombre, e);
    return { texto: msg, error: true };
  }
}

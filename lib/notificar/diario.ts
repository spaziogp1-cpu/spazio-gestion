import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sincronizarPendientes } from '@/lib/planilla/sync';
import { importarDesde } from '@/lib/tiendanube/importar';
import { armarResumen, type Resumen } from '@/lib/resumen';
import { enviarEmail } from './email';
import { emailResumen, lineaWhatsApp } from './resumen-email';
import { enviarPlantilla, whatsappConfigurado } from './whatsapp';

type Miembro = { id: string; nombre: string; email: string; telefono: string | null; rol: string };
export type Informe = { persona: string; avisos: number; email: string; whatsapp: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = SupabaseClient<any, any, any>;

/** Crea los avisos dentro de la app para una persona. No repite avisos ya creados. */
async function crearAvisos(db: Cliente, m: Miembro, r: Resumen): Promise<number> {
  const filas: { usuario_id: string; tipo: string; titulo: string; cuerpo?: string; link: string; clave: string }[] = [];
  for (const p of r.atrasados)
    filas.push({ usuario_id: m.id, tipo: 'pedido_atrasado', titulo: `Atrasado: #${p.numero} ${p.cliente_nombre}`, cuerpo: `La fecha límite era el ${p.fecha_limite.split('-').reverse().join('/')}`, link: `/pedidos/${p.id}`, clave: `atrasado:${p.id}:${p.fecha_limite}:${m.id}` });
  for (const p of r.porVencer)
    filas.push({ usuario_id: m.id, tipo: 'pedido_por_vencer', titulo: `Vence pronto: #${p.numero} ${p.cliente_nombre}`, cuerpo: `Fecha límite ${p.fecha_limite.split('-').reverse().join('/')}`, link: `/pedidos/${p.id}`, clave: `porvencer:${p.id}:${p.fecha_limite}:${m.id}` });
  for (const t of r.tareasVencidas)
    filas.push({ usuario_id: m.id, tipo: 'tarea_vencida', titulo: `Tarea vencida: ${t.titulo}`, link: t.pedido_id ? `/pedidos/${t.pedido_id}` : '/tareas', clave: `tvencida:${t.id}:${t.vencimiento}` });
  if (m.rol === 'admin')
    for (const x of r.proveedoresDemorados)
      filas.push({ usuario_id: m.id, tipo: 'proveedor_demorado', titulo: `Demorado: ${x.proveedor_nombre}${x.es_stock ? ' (stock)' : ` · #${x.pedido_numero}`}`, cuerpo: x.detalle ?? undefined, link: x.pedido_id ? `/pedidos/${x.pedido_id}` : '/proveedores', clave: `provdem:${x.id}:${x.fecha_esperada}:${m.id}` });
  if (!filas.length) return 0;
  const { data, error } = await db.from('notificaciones').upsert(filas, { onConflict: 'clave', ignoreDuplicates: true }).select('id');
  if (error) throw new Error(`Avisos de ${m.nombre}: ${error.message}`);
  return data?.length ?? 0;
}

/** El proceso diario: resumen por email (y WhatsApp si está configurado) para cada persona. */
export async function procesoDiario(db: Cliente, soloMiembro?: string): Promise<Informe[]> {
  let q = db.from('equipo').select('id, nombre, email, telefono, rol').eq('activo', true);
  if (soloMiembro) q = q.eq('id', soloMiembro);
  const { data: equipo, error } = await q;
  if (error) throw new Error(error.message);

  const { data: param } = await db.from('parametros').select('valor').eq('clave', 'aviso_dias_antes').maybeSingle();
  const avisoDias = Number(param?.valor ?? 3) || 3;

  if (!soloMiembro) {
    // Ventas de Tienda Nube de los últimos 3 días que no hayan llegado por aviso.
    const hace3 = new Date(Date.now() - 3 * 86_400_000).toISOString();
    await importarDesde(db, hace3).catch((e) => console.error('tiendanube diario', e));
    // Pedidos que no se pudieron escribir en la planilla: se reintentan una vez por día.
    await sincronizarPendientes(db).catch((e) => console.error('planilla pendientes', e));
  }

  const informes: Informe[] = [];
  for (const m of (equipo ?? []) as Miembro[]) {
    const r = await armarResumen(db, m.id, avisoDias);
    const avisos = await crearAvisos(db, m, r);

    const { asunto, html, texto } = emailResumen(m.nombre, r);
    const mail = await enviarEmail(m.email, asunto, html, texto);

    let wa = 'sin configurar';
    if (whatsappConfigurado() && m.telefono) {
      const plantilla = process.env.WHATSAPP_PLANTILLA_RESUMEN || 'resumen_diario';
      const res = await enviarPlantilla(m.telefono, plantilla, [m.nombre, lineaWhatsApp(r)]);
      wa = res.ok ? 'enviado' : `error: ${res.error}`;
    } else if (whatsappConfigurado()) {
      wa = 'sin teléfono';
    }
    informes.push({ persona: m.nombre, avisos, email: mail.ok ? 'enviado' : mail.omitido ? 'sin configurar' : `error: ${mail.error}`, whatsapp: wa });
  }
  return informes;
}

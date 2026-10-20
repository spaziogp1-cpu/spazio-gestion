import 'server-only';
import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { crearAdmin } from '@/lib/supabase/admin';
import { HERRAMIENTAS, ejecutarHerramienta } from './herramientas';

// Servidor MCP (Model Context Protocol, transporte HTTP sin sesión) para conectar
// Claude o ChatGPT a la app. Cada persona usa su propia clave, que se crea en Ajustes.

const VERSIONES = ['2025-06-18', '2025-03-26', '2024-11-05'];
const INSTRUCCIONES = `Sos el asistente de Spazio Design, que fabrica y vende muebles de vidrio a medida en Argentina.
Estas herramientas leen y modifican la app de gestión interna: pedidos (con etapas Señado → En fabricación → Fabricada → Embalada → Envío o retiro coordinado → Entregado), tareas, calendario, pagos y reportes.
Respondé en español rioplatense. Las fechas son de Buenos Aires (AAAA-MM-DD). Los montos están en pesos argentinos.
Antes de cambiar algo (etapa, pago, entrega), confirmá con la persona si el pedido no es evidente.`;

type Pedido = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, any> };

export const hashClave = (clave: string) => createHash('sha256').update(clave.trim()).digest('hex');

async function quienEs(clave: string | null) {
  if (!clave || clave.length < 20) return null;
  const db = crearAdmin();
  const { data } = await db
    .from('claves_ia')
    .select('id, revocada_en, equipo!inner(id, nombre, email, activo)')
    .eq('hash', hashClave(clave))
    .maybeSingle();
  const m = (data as unknown as { id: string; revocada_en: string | null; equipo: { id: string; nombre: string; email: string; activo: boolean } } | null);
  if (!m || m.revocada_en || !m.equipo.activo) return null;
  await db.from('claves_ia').update({ ultimo_uso: new Date().toISOString() }).eq('id', m.id);
  return { id: m.equipo.id, nombre: m.equipo.nombre, email: m.equipo.email };
}

const respuesta = (id: Pedido['id'], result: unknown) => ({ jsonrpc: '2.0', id, result });
const fallo = (id: Pedido['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

export async function atenderMcp(request: NextRequest, claveRuta?: string) {
  const auth = request.headers.get('authorization');
  const clave = claveRuta ?? (auth?.toLowerCase().startsWith('bearer ') ? auth.slice(7) : null);
  const yo = await quienEs(clave);
  if (!yo) return NextResponse.json(fallo(null, -32001, 'Clave inválida o revocada. Creá una nueva en la app: Ajustes → Asistente de IA.'), { status: 401 });

  let cuerpo: Pedido | Pedido[];
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json(fallo(null, -32700, 'JSON inválido'), { status: 400 });
  }

  const ctx = { db: crearAdmin(`${yo.email}#ia`), yo };
  const atender = async (m: Pedido) => {
    // Notificaciones (sin id): no llevan respuesta.
    if (m.id === undefined || m.id === null) return null;
    switch (m.method) {
      case 'initialize': {
        const pedida = String(m.params?.protocolVersion ?? '');
        return respuesta(m.id, {
          protocolVersion: VERSIONES.includes(pedida) ? pedida : VERSIONES[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'spazio-gestion', title: 'Spazio Gestión', version: '1.0.0' },
          instructions: `${INSTRUCCIONES}\nQuien usa esta conexión es ${yo.nombre}.`,
        });
      }
      case 'ping':
        return respuesta(m.id, {});
      case 'tools/list':
        return respuesta(m.id, {
          tools: HERRAMIENTAS.map((h) => ({
            name: h.name,
            title: h.title,
            description: h.description,
            inputSchema: h.inputSchema,
            annotations: { title: h.title, readOnlyHint: h.soloLectura, destructiveHint: false, openWorldHint: false },
          })),
        });
      case 'tools/call': {
        const r = await ejecutarHerramienta(ctx, String(m.params?.name ?? ''), (m.params?.arguments ?? {}) as Record<string, unknown>);
        return respuesta(m.id, { content: [{ type: 'text', text: r.texto }], isError: r.error });
      }
      case 'resources/list':
        return respuesta(m.id, { resources: [] });
      case 'prompts/list':
        return respuesta(m.id, { prompts: [] });
      default:
        return fallo(m.id, -32601, `Método no soportado: ${m.method}`);
    }
  };

  if (Array.isArray(cuerpo)) {
    const rs = (await Promise.all(cuerpo.map(atender))).filter(Boolean);
    return rs.length ? NextResponse.json(rs) : new NextResponse(null, { status: 202 });
  }
  const r = await atender(cuerpo);
  return r ? NextResponse.json(r) : new NextResponse(null, { status: 202 });
}

export const sinStreaming = () =>
  new NextResponse(null, { status: 405, headers: { Allow: 'POST' } });

import 'server-only';
import { crearAdmin } from '@/lib/supabase/admin';
import { generarRemitoPdf, nombreRemito, type ItemRemito } from './pdf';

// Arma el remito de un pedido, lo guarda en los archivos del pedido y lo sube a Google Drive.
// Usa el cliente con permisos completos: lo llaman procesos del servidor (alta de pedidos y cron).

type Db = ReturnType<typeof crearAdmin>;
export type ConfigDrive = { secreto: string; carpeta: string; url: string | null };

export async function configDrive(db: Db): Promise<ConfigDrive | null> {
  const { data } = await db.from('integraciones').select('datos').eq('clave', 'drive_remitos').maybeSingle();
  return (data?.datos as ConfigDrive | undefined) ?? null;
}

/** Manda el PDF al script de Google del dueño de la carpeta. */
export async function subirADrive(cfg: ConfigDrive, nombre: string, pdf: Uint8Array): Promise<{ ok: true; id: string; url: string } | { ok: false; error: string }> {
  if (!cfg.url) return { ok: false, error: 'Falta conectar Google Drive (Ajustes → Remitos)' };
  try {
    const r = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secreto: cfg.secreto, carpeta: cfg.carpeta, nombre, pdf: Buffer.from(pdf).toString('base64') }),
      redirect: 'follow',
      cache: 'no-store',
    });
    const texto = await r.text();
    let j: { ok?: boolean; id?: string; url?: string; error?: string } = {};
    try {
      j = JSON.parse(texto);
    } catch {
      return { ok: false, error: r.ok ? 'El script de Drive no respondió bien: revisá que esté implementado como aplicación web con acceso "Cualquier persona"' : `Drive respondió ${r.status}` };
    }
    if (!j.ok || !j.id) return { ok: false, error: j.error ?? 'Drive no guardó el archivo' };
    return { ok: true, id: j.id, url: j.url ?? `https://drive.google.com/file/d/${j.id}/view` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function generarRemito(pedidoId: string, opciones: { quien?: string } = {}): Promise<{ ok: boolean; error?: string; nombre?: string; driveUrl?: string | null }> {
  const db = crearAdmin(opciones.quien ?? 'Remitos');
  const { data: p } = await db.from('pedidos_resumen').select('*').eq('id', pedidoId).maybeSingle();
  if (!p) return { ok: false, error: 'Pedido no encontrado' };
  const [{ data: c }, { data: items }, { data: previos }] = await Promise.all([
    db.from('clientes').select('nombre, dni, telefono, email').eq('id', p.cliente_id).single(),
    db.from('pedido_items').select('producto, modelo, color, puntas, tapa, material, medidas, cantidad').eq('pedido_id', pedidoId).order('orden'),
    db.from('remitos').select('version').eq('pedido_id', pedidoId).order('version', { ascending: false }).limit(1),
  ]);
  const version = ((previos ?? [])[0]?.version ?? 0) + 1;
  const pdf = await generarRemitoPdf({
    numero: p.numero,
    fecha: p.fecha_venta,
    cliente: c?.nombre ?? 'Cliente',
    dniCuit: c?.dni ?? null,
    telefono: c?.telefono ?? null,
    email: c?.email ?? null,
    items: (items ?? []) as ItemRemito[],
    formaPago: p.forma_pago,
    total: Number(p.total),
    envioPrecio: Number(p.precio_envio_cliente),
    envio: p.envio,
    pagado: Number(p.pagado),
  });
  const nombre = nombreRemito(p.numero, c?.nombre ?? 'Cliente', version);
  const ruta = `${pedidoId}/remito-${p.numero}-v${version}-${Date.now()}.pdf`;
  const { error: errSubida } = await db.storage.from('archivos').upload(ruta, pdf, { contentType: 'application/pdf' });
  if (errSubida) return { ok: false, error: `No se pudo guardar el PDF: ${errSubida.message}` };
  await db.from('archivos').insert({ pedido_id: pedidoId, nombre, ruta, tipo_mime: 'application/pdf', tamano: pdf.byteLength });
  const { data: fila, error } = await db.from('remitos').insert({ pedido_id: pedidoId, version, nombre, ruta }).select('id').single();
  if (error || !fila) return { ok: false, error: error?.message ?? 'No se pudo registrar el remito' };

  const cfg = await configDrive(db);
  if (!cfg?.url) {
    await db.from('remitos').update({ estado: 'pendiente', error: 'Falta conectar Google Drive' }).eq('id', fila.id);
    return { ok: true, nombre, driveUrl: null, error: 'El remito quedó en el pedido; falta conectar Google Drive para subirlo.' };
  }
  const r = await subirADrive(cfg, nombre, pdf);
  await db
    .from('remitos')
    .update(r.ok ? { estado: 'ok', drive_id: r.id, drive_url: r.url, error: null, intentos: 1 } : { estado: 'error', error: r.error, intentos: 1 })
    .eq('id', fila.id);
  return r.ok ? { ok: true, nombre, driveUrl: r.url } : { ok: true, nombre, driveUrl: null, error: `El remito quedó en el pedido, pero no se pudo subir a Drive: ${r.error}` };
}

/** Reintenta subir a Drive los remitos que quedaron pendientes o con error (hasta 6 intentos). */
export async function subirPendientes(): Promise<{ ok: number; error: number }> {
  const db = crearAdmin('Remitos');
  const cfg = await configDrive(db);
  if (!cfg?.url) return { ok: 0, error: 0 };
  const { data } = await db.from('remitos').select('id, nombre, ruta, intentos').in('estado', ['pendiente', 'error']).lt('intentos', 6).order('creado_en').limit(15);
  let ok = 0;
  let error = 0;
  for (const x of (data ?? []) as { id: string; nombre: string; ruta: string; intentos: number }[]) {
    const { data: archivo } = await db.storage.from('archivos').download(x.ruta);
    if (!archivo) {
      error++;
      continue;
    }
    const r = await subirADrive(cfg, x.nombre, new Uint8Array(await archivo.arrayBuffer()));
    await db
      .from('remitos')
      .update(r.ok ? { estado: 'ok', drive_id: r.id, drive_url: r.url, error: null, intentos: x.intentos + 1 } : { estado: 'error', error: r.error, intentos: x.intentos + 1 })
      .eq('id', x.id);
    if (r.ok) ok++;
    else error++;
  }
  return { ok, error };
}

/** Código del script de Google que guarda los remitos en la carpeta (lo pega el dueño en script.google.com). */
export function codigoScript(cfg: ConfigDrive): string {
  return `// Spazio Gestión: guarda en Drive los remitos que genera la app.
// Implementar → Nueva implementación → Aplicación web · Ejecutar como: Yo · Acceso: Cualquier persona.
const SECRETO = '${cfg.secreto}';
const CARPETA = '${cfg.carpeta}';

function doPost(e) {
  const responder = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.secreto !== SECRETO) return responder({ ok: false, error: 'Clave incorrecta' });
    const carpeta = DriveApp.getFolderById(CARPETA);
    const blob = Utilities.newBlob(Utilities.base64Decode(d.pdf), 'application/pdf', String(d.nombre || 'Remito.pdf'));
    const archivo = carpeta.createFile(blob);
    return responder({ ok: true, id: archivo.getId(), url: archivo.getUrl() });
  } catch (err) {
    return responder({ ok: false, error: String(err) });
  }
}

// Para autorizar el script la primera vez: elegí esta función y tocá "Ejecutar".
function autorizar() {
  DriveApp.getFolderById(CARPETA).getName();
}
`;
}

import type { Metadata } from 'next';
import { miembroActual } from '@/lib/sesion';
import { NotificacionesCelular } from './push';
import { fechaCorta } from '@/lib/fechas';
import { AsistenteIA, FormMiembro, MiContrasena, TraerDeOriginal, FormAvisos, FormParametros, ImportarTiendaNube, ProbarPlanilla, ProbarReportes, ProbarResumen } from './partes';

async function conexionTiendaNube() {
  try {
    const { crearAdmin } = await import('@/lib/supabase/admin');
    const { leerConexion } = await import('@/lib/tiendanube/api');
    return await leerConexion(crearAdmin());
  } catch {
    return null;
  }
}

export const metadata: Metadata = { title: 'Ajustes' };

export default async function AjustesPage({ searchParams }: { searchParams: Promise<{ tiendanube?: string }> }) {
  const { tiendanube: mensajeTN } = await searchParams;
  const { miembro, supabase } = await miembroActual();
  const admin = miembro.rol === 'admin';
  const [{ data: eq }, { data: params }, { data: sync }, { data: tnOrdenes }, tn, { data: clavesIA }] = await Promise.all([
    supabase.from('equipo').select('id, nombre, alias_planilla, email, telefono, rol, activo').order('activo', { ascending: false }).order('nombre'),
    supabase.from('parametros').select('clave, valor'),
    supabase.from('planilla_sync').select('estado, error, sincronizado_en').order('creado_en', { ascending: false }).limit(500),
    supabase.from('tiendanube_ordenes').select('numero, estado, detalle, recibido_en').order('recibido_en', { ascending: false }).limit(500),
    conexionTiendaNube(),
    supabase.from('claves_ia').select('id, nombre, ultimos, creada_en, ultimo_uso').is('revocada_en', null).order('creada_en'),
  ]);
  const ordenesTN = (tnOrdenes ?? []) as { numero: number | null; estado: string; detalle: string | null; recibido_en: string }[];
  const tnCreadas = ordenesTN.filter((o) => o.estado === 'creado').length;
  const tnVinculadas = ordenesTN.filter((o) => o.estado === 'vinculado').length;
  const tnError = ordenesTN.find((o) => o.estado === 'error');
  const tnConfig = Boolean(process.env.TIENDANUBE_APP_ID && process.env.TIENDANUBE_CLIENT_SECRET);
  const filasSync = (sync ?? []) as { estado: string; error: string | null; sincronizado_en: string | null }[];
  const syncOk = filasSync.filter((x) => x.estado === 'ok').length;
  const syncPend = filasSync.filter((x) => x.estado === 'pendiente').length;
  const syncErr = filasSync.filter((x) => x.estado === 'error');
  const planilla = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.PLANILLA_ID);
  const equipo = (eq ?? []) as { id: string; nombre: string; alias_planilla: string | null; email: string; telefono: string | null; rol: string; activo: boolean }[];
  const valores = Object.fromEntries(((params ?? []) as { clave: string; valor: string }[]).map((p) => [p.clave, p.valor]));
  const whatsapp = Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
  const email = Boolean(process.env.RESEND_API_KEY);
  const cron = Boolean(process.env.CRON_SECRET && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY));

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Ajustes</h1>
          {!admin && <p className="sub">Solo un administrador puede cambiar estos datos.</p>}
        </div>
      </div>
      <div className="grid-ficha">
        <div className="col">
          <section className="card">
            <div className="card-titulo">
              <h2>Mi contraseña</h2>
            </div>
            <div className="seccion form-bloque">
              <p className="small">Con una contraseña entrás directo con tu email, sin esperar el código. Sirve también en la app instalada en el celular.</p>
              <MiContrasena />
            </div>
          </section>
          <section className="card">
            <div className="card-titulo">
              <h2>Equipo</h2>
              <span className="quiet small">Solo estos emails pueden entrar</span>
            </div>
            <div className="seccion">
              {equipo.map((m) => (
                <FormMiembro key={m.id} m={m} editable={admin} />
              ))}
              <FormMiembro m={null} editable={admin} />
            </div>
          </section>
          <section className="card">
            <div className="card-titulo">
              <h2>Plazos</h2>
            </div>
            <div className="seccion">
              <FormParametros valores={valores} editable={admin} />
            </div>
          </section>
          <section className="card">
            <div className="card-titulo">
              <h2>Reportes y recordatorios</h2>
            </div>
            <div className="seccion form-bloque">
              <p className="small">
                Dentro de la app, cada persona recibe un reporte a la mañana (tareas, entregas y visitas del día) y otro a la tarde (qué se completó y
                qué sigue pendiente), y un recordatorio antes de cada entrega o visita con horario.
              </p>
              <FormAvisos valores={valores} editable={admin} />
              <ProbarReportes />
            </div>
          </section>
          <section className="card">
            <div className="card-titulo">
              <h2>Notificaciones en el celular</h2>
            </div>
            <div className="seccion form-bloque">
              <p className="small">
                Activalas en cada celular o compu donde quieras recibirlas. Cada persona activa las suyas; llegan aunque la app esté cerrada.
              </p>
              <NotificacionesCelular />
            </div>
          </section>
        </div>
        <div className="col">
          <section className="card">
            <div className="card-titulo">
              <h2>Resumen diario y avisos</h2>
            </div>
            <div className="seccion form-bloque">
              <p className="small">Todos los días de lunes a sábado a las 8, cada persona recibe su resumen y se crean los avisos del día.</p>
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                <li>Proceso diario: {cron ? '✓ configurado' : '✗ falta CRON_SECRET y la clave de servicio de Supabase'}</li>
                <li>Email: {email ? '✓ configurado' : '✗ falta RESEND_API_KEY'}</li>
                <li>
                  WhatsApp:{' '}
                  {!whatsapp ? '— todavía no (se conecta más adelante)' : valores.whatsapp_activo === 'si' ? '✓ configurado y activo' : '✓ configurado, apagado (se prende en Plazos)'}
                </li>
              </ul>
              <ProbarResumen />
            </div>
          </section>
          <section className="card">
            <div className="card-titulo">
              <h2>Planilla de ventas</h2>
            </div>
            <div className="seccion form-bloque">
              <p className="small">
                Cada venta nueva se agrega en <strong>VENTAS_2026</strong> (una fila por producto), y al cambiar la etapa se actualizan ESTADO y FECHA REAL DE ENTREGA.
              </p>
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                <li>Conexión: {planilla ? '✓ configurada' : '✗ falta GOOGLE_SERVICE_ACCOUNT_JSON y PLANILLA_ID'}</li>
                <li>
                  Pedidos escritos: {syncOk} · pendientes: {syncPend} · con error: {syncErr.length}
                </li>
                {syncErr[0]?.error && <li style={{ color: 'var(--danger)' }}>Último error: {syncErr[0].error}</li>}
              </ul>
              {admin && <ProbarPlanilla />}
              <p className="small" style={{ marginTop: 6 }}>
                <strong>Planilla original:</strong> cada 15 minutos la app revisa <em>Plantilla_Spazio_2026</em> y crea como pedidos las ventas nuevas que se cargaron ahí (sin duplicar las que ya están en la app).
              </p>
              {admin && <TraerDeOriginal />}
            </div>
          </section>
          <section className="card">
            <div className="card-titulo">
              <h2>Asistente de IA</h2>
            </div>
            <div className="seccion form-bloque">
              <p className="small">
                Conectá tu Claude (o ChatGPT) a la app para preguntarle por pedidos, entregas, tareas y ventas, o pedirle que agende, cree tareas o registre pagos. Cada persona crea su propia conexión y los cambios quedan en el historial a su nombre.
              </p>
              <AsistenteIA claves={(clavesIA ?? []) as { id: string; nombre: string; ultimos: string; creada_en: string; ultimo_uso: string | null }[]} />
            </div>
          </section>
          <section className="card">
            <div className="card-titulo">
              <h2>Tienda Nube</h2>
            </div>
            <div className="seccion form-bloque">
              <p className="small">Cada venta pagada en spaziodesign.net entra sola como pedido (y de ahí a la planilla). Si ya la habían cargado a mano, se une con ese pedido en vez de duplicarla.</p>
              {mensajeTN && (mensajeTN === 'ok' ? <p className="aviso aviso-ok">Tienda conectada. Desde ahora las ventas pagadas entran solas.</p> : <p className="error-form">{mensajeTN}</p>)}
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                <li>App de Tienda Nube: {tnConfig ? '✓ configurada' : '✗ falta TIENDANUBE_APP_ID y TIENDANUBE_CLIENT_SECRET'}</li>
                <li>Tienda: {tn ? `✓ conectada (n.º ${tn.store_id}) · ventas desde el ${fechaCorta(tn.desde.slice(0, 10))}` : '✗ sin conectar'}</li>
                {tn && (
                  <li>
                    Pedidos creados: {tnCreadas}
                    {tnVinculadas ? ` · unidos a pedidos cargados a mano: ${tnVinculadas}` : ''}
                  </li>
                )}
                {tnError?.detalle && (
                  <li style={{ color: 'var(--danger)' }}>
                    Último error{tnError.numero ? ` (#${tnError.numero})` : ''}: {tnError.detalle}
                  </li>
                )}
              </ul>
              {admin && tnConfig && (
                <div>
                  <a className="btn" href="/api/tiendanube/conectar">
                    {tn ? 'Volver a conectar' : 'Conectar con Tienda Nube'}
                  </a>
                </div>
              )}
              {admin && tn && <ImportarTiendaNube />}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

import type { Metadata } from 'next';
import { miembroActual } from '@/lib/sesion';
import { FormMiembro, FormParametros, ProbarPlanilla, ProbarResumen } from './partes';

export const metadata: Metadata = { title: 'Ajustes' };

export default async function AjustesPage() {
  const { miembro, supabase } = await miembroActual();
  const admin = miembro.rol === 'admin';
  const [{ data: eq }, { data: params }, { data: sync }] = await Promise.all([
    supabase.from('equipo').select('id, nombre, alias_planilla, email, telefono, rol, activo').order('activo', { ascending: false }).order('nombre'),
    supabase.from('parametros').select('clave, valor'),
    supabase.from('planilla_sync').select('estado, error, sincronizado_en').order('creado_en', { ascending: false }).limit(500),
  ]);
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
                <li>WhatsApp: {whatsapp ? '✓ configurado' : '— todavía no (se conecta más adelante)'}</li>
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
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

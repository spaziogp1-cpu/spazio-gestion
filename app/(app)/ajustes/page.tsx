import type { Metadata } from 'next';
import { miembroActual } from '@/lib/sesion';
import { FormMiembro, FormParametros, ProbarResumen } from './partes';

export const metadata: Metadata = { title: 'Ajustes' };

export default async function AjustesPage() {
  const { miembro, supabase } = await miembroActual();
  const admin = miembro.rol === 'admin';
  const [{ data: eq }, { data: params }] = await Promise.all([
    supabase.from('equipo').select('id, nombre, alias_planilla, email, telefono, rol, activo').order('activo', { ascending: false }).order('nombre'),
    supabase.from('parametros').select('clave, valor'),
  ]);
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
        </div>
      </div>
    </>
  );
}

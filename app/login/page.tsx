import { Marca } from '@/components/marca';
import type { Metadata } from 'next';
import FormLogin from './form-login';

export const metadata: Metadata = { title: 'Ingresar' };

const ERRORES: Record<string, string> = {
  'no-habilitado': 'Ese email no está habilitado. Pedile a Teo que te agregue al equipo.',
  link: 'El link venció o ya se usó. Pedí uno nuevo.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="login">
      <div className="card">
        <div className="marca">
          <Marca />
        </div>
        {error && ERRORES[error] && <p className="aviso aviso-mal" style={{ marginBottom: 14 }}>{ERRORES[error]}</p>}
        <FormLogin />
      </div>
    </main>
  );
}

import type { Avance } from '@/lib/objetivos';

export function BarraAvance({ a }: { a: Avance }) {
  const color = a.porcentaje >= 100 ? 'var(--ok)' : a.diasRestantes !== null && a.diasRestantes < 0 ? 'var(--danger)' : 'var(--accent)';
  return (
    <div className="avance">
      <div className="avance-pista">
        <div className="avance-relleno" style={{ width: `${Math.max(2, a.porcentaje)}%`, background: color }} />
      </div>
      <span className="num small" style={{ fontWeight: 600 }}>
        {a.porcentaje}%
      </span>
    </div>
  );
}

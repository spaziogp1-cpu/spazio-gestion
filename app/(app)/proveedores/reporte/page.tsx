import type { Metadata } from 'next';
import Link from 'next/link';
import { IconoVolver } from '@/components/iconos';
import { fechaCorta, hoyAR } from '@/lib/fechas';
import { plata } from '@/lib/formato';
import { miembroActual } from '@/lib/sesion';
import type { PedidoProveedor } from '@/lib/tipos';

export const metadata: Metadata = { title: 'Reporte de gastos' };

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// 'AAAA-MM' de n meses antes/después
function mover(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
const nombreMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  return `${MESES[m - 1]} ${a}`;
};

export default async function ReporteGastos({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes: mesParam } = await searchParams;
  const actual = hoyAR().slice(0, 7);
  const mes = mesParam && /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : actual;
  const desdeHistorial = mover(mes, -5);
  const { supabase } = await miembroActual();

  const { data } = await supabase
    .from('proveedor_pendientes')
    .select('*')
    .neq('estado', 'cancelado')
    .gte('fecha_pedido', `${desdeHistorial}-01`)
    .lt('fecha_pedido', `${mover(mes, 1)}-01`)
    .order('fecha_pedido', { ascending: true });
  const todos = (data ?? []) as PedidoProveedor[];
  const delMes = todos.filter((x) => x.fecha_pedido.startsWith(mes));

  const suma = (xs: PedidoProveedor[]) => xs.reduce((s, x) => s + Number(x.monto ?? 0), 0);
  const total = suma(delMes);
  const totalClientes = suma(delMes.filter((x) => !x.es_stock));
  const totalStock = suma(delMes.filter((x) => x.es_stock));
  const sinPrecio = delMes.filter((x) => x.monto == null).length;

  // Por proveedor
  const porProveedor = new Map<string, { clientes: number; stock: number; cantidad: number }>();
  for (const x of delMes) {
    const fila = porProveedor.get(x.proveedor_nombre) ?? { clientes: 0, stock: 0, cantidad: 0 };
    if (x.es_stock) fila.stock += Number(x.monto ?? 0);
    else fila.clientes += Number(x.monto ?? 0);
    fila.cantidad++;
    porProveedor.set(x.proveedor_nombre, fila);
  }
  const filas = [...porProveedor.entries()].sort((a, b) => b[1].clientes + b[1].stock - (a[1].clientes + a[1].stock));

  // Últimos 6 meses
  const historial = Array.from({ length: 6 }, (_, i) => mover(desdeHistorial, i)).map((m) => ({
    mes: m,
    total: suma(todos.filter((x) => x.fecha_pedido.startsWith(m))),
  }));
  const maximo = Math.max(1, ...historial.map((h) => h.total));

  return (
    <>
      <Link href="/proveedores" className="volver">
        <IconoVolver /> Proveedores
      </Link>
      <div className="cabecera">
        <div>
          <h1>Gastos en proveedores</h1>
          <p className="sub">Según la fecha de pedido. No incluye los pedidos cancelados.</p>
        </div>
        <div className="acciones" style={{ alignItems: 'center' }}>
          <Link href={`/proveedores/reporte?mes=${mover(mes, -1)}`} className="btn btn-chico" aria-label="Mes anterior">
            ←
          </Link>
          <strong style={{ minWidth: 130, textAlign: 'center', textTransform: 'capitalize' }}>{nombreMes(mes)}</strong>
          {mes < actual ? (
            <Link href={`/proveedores/reporte?mes=${mover(mes, 1)}`} className="btn btn-chico" aria-label="Mes siguiente">
              →
            </Link>
          ) : (
            <span className="btn btn-chico" style={{ visibility: 'hidden' }}>
              →
            </span>
          )}
        </div>
      </div>

      <div className="resumen-gastos">
        <div className="card card-pad">
          <div className="quiet small">Total del mes</div>
          <div className="saldo-grande num">{plata(total)}</div>
        </div>
        <div className="card card-pad">
          <div className="quiet small">Para pedidos de clientes</div>
          <div className="saldo-grande num">{plata(totalClientes)}</div>
        </div>
        <div className="card card-pad">
          <div className="quiet small">Para stock</div>
          <div className="saldo-grande num">{plata(totalStock)}</div>
        </div>
      </div>

      {sinPrecio > 0 && (
        <p className="aviso" style={{ background: 'var(--warn-soft)', color: 'var(--warn)', margin: '12px 0' }}>
          {sinPrecio} {sinPrecio === 1 ? 'pedido no tiene' : 'pedidos no tienen'} precio cargado este mes, así que el total puede ser mayor.
          Cargalos desde la lista de abajo con “+ precio”.
        </p>
      )}

      <div className="grid-ficha" style={{ marginTop: 12 }}>
        <div className="col">
          <section className="card">
            <div className="card-titulo">
              <h2>Por proveedor</h2>
            </div>
            <div className="seccion">
              {filas.length === 0 ? (
                <p className="quiet small">No hubo pedidos a proveedores este mes.</p>
              ) : (
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Proveedor</th>
                      <th className="der">Clientes</th>
                      <th className="der">Stock</th>
                      <th className="der">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map(([nombre, f]) => (
                      <tr key={nombre}>
                        <td>
                          {nombre} <span className="faint small">· {f.cantidad}</span>
                        </td>
                        <td className="der num">{plata(f.clientes)}</td>
                        <td className="der num">{plata(f.stock)}</td>
                        <td className="der num" style={{ fontWeight: 600 }}>
                          {plata(f.clientes + f.stock)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-titulo">
              <h2>Detalle</h2>
              <span className="quiet small">{delMes.length}</span>
            </div>
            <div className="seccion">
              {delMes.length === 0 && <p className="quiet small">Sin movimientos.</p>}
              <table className="tabla">
                <tbody>
                  {delMes.map((x) => (
                    <tr key={x.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {x.proveedor_nombre}{' '}
                          {x.es_stock ? (
                            <span className="chip">Stock</span>
                          ) : (
                            <a href={`/pedidos/${x.pedido_id}`} className="quiet small" style={{ fontWeight: 400 }}>
                              #{x.pedido_numero} {x.cliente_nombre}
                            </a>
                          )}
                        </div>
                        <div className="small quiet">
                          {fechaCorta(x.fecha_pedido)}
                          {[x.cantidad, x.detalle].filter(Boolean).length > 0 && ` · ${[x.cantidad, x.detalle].filter(Boolean).join(' · ')}`}
                        </div>
                      </td>
                      <td className="der num">{x.monto != null ? plata(x.monto) : <span className="faint">sin precio</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="col">
          <section className="card">
            <div className="card-titulo">
              <h2>Últimos 6 meses</h2>
            </div>
            <div className="seccion barras">
              {historial.map((h) => {
                const [, m] = h.mes.split('-').map(Number);
                return (
                  <Link key={h.mes} href={`/proveedores/reporte?mes=${h.mes}`} className={`barra${h.mes === mes ? ' barra-activa' : ''}`}>
                    <span className="barra-mes">{MESES_CORTOS[m - 1]}</span>
                    <span className="barra-pista">
                      <span className="barra-relleno" style={{ width: `${(h.total / maximo) * 100}%` }} />
                    </span>
                    <span className="barra-valor num">{plata(h.total)}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

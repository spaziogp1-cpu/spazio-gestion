import type { Metadata } from 'next';
import Link from 'next/link';
import { conPermisoCostos } from '@/lib/cotizador/permisos';
import { armarGrilla, claveCelda, etiquetaValor, PESTANAS, UNIDADES, type TarifaPanel, type ValorAtributo } from '@/lib/cotizador/grilla';
import { fechaCorta } from '@/lib/fechas';
import { AgregarOpcion, BotonBaja, CeldaPrecio, FilaColor, FormAjustes, FormAumento, FormNuevoInsumo } from './partes';

export const metadata: Metadata = { title: 'Precios del cotizador' };

type FilaInsumo = {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  unidad: string;
  atributos: string[];
  minimo: number | null;
  minimo_por: string | null;
  notas: string | null;
  orden: number;
  proveedor_id: string | null;
  proveedores: { nombre: string } | null;
};
type FilaValor = ValorAtributo & { id: string; atributo: string; grupos: string[]; muestra: string | null; activo: boolean };

const TIPOS_AUMENTO = [
  { valor: 'vidrio', nombre: 'Vidrios' },
  { valor: 'espejo', nombre: 'Espejos' },
  { valor: 'proceso', nombre: 'Procesos' },
  { valor: 'mano_obra', nombre: 'Mano de obra' },
  { valor: 'estructura', nombre: 'Estructuras' },
];

const fmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

export default async function PreciosCotizadorPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver } = await searchParams;
  const pestana = PESTANAS.find((p) => p.clave === ver) ?? PESTANAS[0];
  const { supabase } = await conPermisoCostos();

  const [{ data: ins }, { data: tar }, { data: val }, { data: aj }, { data: provs }] = await Promise.all([
    supabase
      .from('cot_insumos')
      .select('id, codigo, nombre, tipo, unidad, atributos, minimo, minimo_por, notas, orden, proveedor_id, proveedores(nombre)')
      .eq('activo', true)
      .in('tipo', [...pestana.tipos])
      .order('orden'),
    supabase
      .from('cot_tarifas')
      .select('id, insumo_id, variante, referencia, precio, minimo, incremento, nota, vigente_desde')
      .is('vigente_hasta', null)
      .limit(10000),
    supabase.from('cot_atributo_valores').select('id, atributo, valor, etiqueta, grupos, muestra, orden, activo').order('orden'),
    supabase.from('cot_ajustes').select('clave, nombre, valor, nota').order('clave'),
    supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
  ]);

  const insumos = (ins ?? []) as unknown as FilaInsumo[];
  const tarifas = ((tar ?? []) as (TarifaPanel & { insumo_id: string })[]).map((t) => ({
    ...t,
    precio: Number(t.precio),
    referencia: t.referencia == null ? null : Number(t.referencia),
    minimo: t.minimo == null ? null : Number(t.minimo),
    incremento: t.incremento == null ? null : Number(t.incremento),
  }));
  const filasValores = (val ?? []) as FilaValor[];
  const valores: Record<string, ValorAtributo[]> = {};
  for (const v of filasValores) (valores[v.atributo] ??= []).push(v);
  const colores = filasValores.filter((v) => v.atributo === 'color');
  const ajustes = ((aj ?? []) as { clave: string; nombre: string; valor: number | string; nota: string | null }[]).map((a) => ({ ...a, valor: Number(a.valor) }));

  const porInsumo = new Map<string, typeof tarifas>();
  for (const t of tarifas) porInsumo.set(t.insumo_id, [...(porInsumo.get(t.insumo_id) ?? []), t]);
  // Fecha de la última lista cargada por proveedor (Vidpro, STG...).
  const ultimaLista = new Map<string, string>();
  for (const i of insumos)
    for (const t of porInsumo.get(i.id) ?? []) {
      const p = i.proveedores?.nombre ?? '';
      if (!ultimaLista.has(p) || t.vigente_desde > ultimaLista.get(p)!) ultimaLista.set(p, t.vigente_desde);
    }

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Precios del cotizador</h1>
          <p className="sub">
            Costos de proveedores, con IVA incluido. Cambiar un precio no toca los presupuestos ya hechos.
            {ultimaLista.size > 0 && (
              <>
                {' '}
                Últimos cambios:{' '}
                {[...ultimaLista.entries()]
                  .filter(([p]) => p)
                  .map(([p, f]) => `${p} ${fechaCorta(f.slice(0, 10))}`)
                  .join(' · ')}
                .
              </>
            )}
          </p>
        </div>
        <Link href="/ajustes" className="btn">
          Volver a Ajustes
        </Link>
      </div>

      <div className="filtros" role="tablist" aria-label="Tipo de costo">
        {PESTANAS.map((p) => (
          <Link key={p.clave} href={`/cotizador/admin?ver=${p.clave}`} className="filtro" aria-current={p.clave === pestana.clave ? 'true' : undefined}>
            {p.nombre}
          </Link>
        ))}
      </div>

      <div className="grid-ficha">
        <div className="col">
          {insumos.length === 0 && (
            <section className="card">
              <p className="vacio">No hay costos cargados en {pestana.nombre.toLowerCase()} todavía.</p>
            </section>
          )}
          {insumos.map((i) => {
            const lista = porInsumo.get(i.id) ?? [];
            const g = armarGrilla(i.atributos, lista, valores);
            const unidad = UNIDADES[i.unidad] ?? i.unidad;
            const minimo =
              i.minimo != null ? ` · mínimo ${fmt.format(Number(i.minimo))} ${i.unidad === 'm2' ? 'm²' : i.unidad === 'ml' ? 'm' : ''} por ${i.minimo_por === 'item' ? 'mesa' : 'pieza'}` : '';
            return (
              <section className="card" key={i.id} id={i.codigo}>
                <div className="card-titulo">
                  <div>
                    <h2>{i.nombre}</h2>
                    <p className="small quiet">
                      {[i.proveedores?.nombre, `${unidad}${minimo}`].filter(Boolean).join(' · ')}
                      <span className="mono xs" style={{ marginLeft: 8 }}>
                        {i.codigo}
                      </span>
                    </p>
                  </div>
                  <span className="quiet small">{lista.length} precios</span>
                </div>
                <div className="seccion">
                  {i.notas && <p className="small quiet" style={{ marginBottom: 8 }}>{i.notas}</p>}
                  {g.tipo === 'matriz' ? (
                    <div className="grilla-precios">
                      <table className="tabla">
                        <thead>
                          <tr>
                            <th scope="col">{etiquetaAtributo(g.filaAtributo)}</th>
                            {g.columnas.map((c) => (
                              <th scope="col" key={c} className="der">
                                {etiquetaValor(g.colAtributo, c, valores)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {g.filas.map((f) => (
                            <tr key={f}>
                              <th scope="row">{etiquetaValor(g.filaAtributo, f, valores)}</th>
                              {g.columnas.map((c) => {
                                const t = g.celdas[claveCelda(f, c)];
                                const etq = `${etiquetaValor(g.filaAtributo, f, valores)} ${etiquetaValor(g.colAtributo, c, valores)}`;
                                return (
                                  <td key={c} className="der">
                                    <CeldaPrecio
                                      insumoId={i.id}
                                      variante={{ [g.filaAtributo]: f, [g.colAtributo]: c }}
                                      tarifaId={t?.id ?? null}
                                      precio={t?.precio ?? null}
                                      etiqueta={etq}
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <table className="tabla">
                      <tbody>
                        {g.filas.map((t) => {
                          const nombre = i.atributos.map((a) => etiquetaValor(a, t.variante[a] ?? '', valores)).join(' · ') || i.nombre;
                          return (
                            <tr key={t.id}>
                              <th scope="row">
                                {nombre}
                                {(t.nota || t.minimo != null) && (
                                  <div className="small quiet" style={{ fontWeight: 400 }}>
                                    {[t.nota, t.minimo != null && `mínimo ${fmt.format(t.minimo)} por pieza`].filter(Boolean).join(' · ')}
                                  </div>
                                )}
                              </th>
                              <td className="der">
                                <CeldaPrecio
                                  insumoId={i.id}
                                  variante={t.variante}
                                  referencia={t.referencia}
                                  tarifaId={t.id}
                                  precio={t.precio}
                                  etiqueta={nombre}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                  <div className="acciones" style={{ marginTop: 10, justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>{i.atributos.length === 1 && i.atributos[0].startsWith('v_') && <AgregarOpcion insumoId={i.id} />}</div>
                    <BotonBaja insumoId={i.id} nombre={i.nombre} />
                  </div>
                </div>
              </section>
            );
          })}
        </div>

        <div className="col">
          <section className="card">
            <div className="card-titulo">
              <h2>Nuevo costo</h2>
            </div>
            <div className="seccion">
              <p className="small quiet" style={{ marginBottom: 10 }}>
                Cualquier cosa que compres para armar un producto: madera, ruedas, herrajes, embalaje… De un proveedor que ya está o de uno nuevo.
              </p>
              <FormNuevoInsumo proveedores={(provs ?? []) as { id: string; nombre: string }[]} />
            </div>
          </section>

          <section className="card">
            <div className="card-titulo">
              <h2>Aumento por proveedor</h2>
            </div>
            <div className="seccion">
              <p className="small quiet" style={{ marginBottom: 10 }}>
                Sube todos los precios de un proveedor de una vez. Para bajar, usá un número negativo.
              </p>
              <FormAumento proveedores={(provs ?? []) as { id: string; nombre: string }[]} tipos={TIPOS_AUMENTO} />
            </div>
          </section>

          <section className="card">
            <div className="card-titulo">
              <h2>Colores</h2>
              <span className="quiet small">{colores.length}</span>
            </div>
            <div className="seccion">
              <p className="small quiet">
                Cada color apunta a una columna de la lista de Vidpro. Los colores de Spazio van en &quot;Color&quot;; incoloro, gris y bronce
                pueden ser float o laminados.
              </p>
              {colores.map((c) => (
                <FilaColor key={c.id} color={c} />
              ))}
              <FilaColor color={null} />
            </div>
          </section>

          <section className="card">
            <div className="card-titulo">
              <h2>Reglas generales</h2>
            </div>
            <div className="seccion">
              <FormAjustes ajustes={ajustes} />
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

const ATRIBUTOS: Record<string, string> = {
  espesor: 'Espesor',
  composicion: 'Composición',
  composicion_espejo: 'Composición',
  terminacion_espejo: 'Terminación',
  rango_fason: 'Espesores',
  diametro: 'Diámetro',
};
function etiquetaAtributo(clave: string) {
  return ATRIBUTOS[clave] ?? clave.replace(/_/g, ' ');
}

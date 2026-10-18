'use client';

import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { CANALES, ENVIOS, FORMAS_PAGO, MATERIALES_SUGERIDOS, PRODUCTOS_SUGERIDOS, TIPOS_VENTA } from '@/lib/constantes';
import { calcularFechaLimite, fechaCorta, type ReglaPlazo } from '@/lib/fechas';
import { leerMonto, plata } from '@/lib/formato';
import { createClient } from '@/lib/supabase/client';
import type { Cliente } from '@/lib/tipos';
import { crearPedido, type Estado } from '../actions';

type Props = {
  equipo: { id: string; nombre: string }[];
  yo: string;
  hoy: string;
  regla: ReglaPlazo;
  feriados: string[];
  inicial?: { nombre: string; telefono: string; canal: string };
};

type ItemForm = { key: number; precio: string; cantidad: string };

export default function FormPedido({ equipo, yo, hoy, regla, feriados, inicial }: Props) {
  const [estado, accion, guardando] = useActionState<Estado, FormData>(crearPedido, {});

  // ----- Cliente -----
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [busqueda, setBusqueda] = useState(inicial?.nombre ?? '');
  const [sugeridos, setSugeridos] = useState<Cliente[]>([]);
  const supabase = useMemo(() => createClient(), []);
  const pedidoBusqueda = useRef(0);

  useEffect(() => {
    const q = busqueda.trim();
    if (cliente || q.length < 2) {
      setSugeridos([]);
      return;
    }
    const id = ++pedidoBusqueda.current;
    const t = setTimeout(async () => {
      const seguro = q.replace(/[%,()]/g, ' ');
      const { data } = await supabase
        .from('clientes')
        .select('*')
        .or(`nombre.ilike.%${seguro}%,telefono.ilike.%${seguro}%`)
        .limit(5);
      if (id === pedidoBusqueda.current) setSugeridos((data ?? []) as Cliente[]);
    }, 250);
    return () => clearTimeout(t);
  }, [busqueda, cliente, supabase]);

  // ----- Productos -----
  const [items, setItems] = useState<ItemForm[]>([{ key: 1, precio: '', cantidad: '1' }]);
  const siguienteKey = useRef(2);
  const agregarItem = () => setItems((xs) => [...xs, { key: siguienteKey.current++, precio: '', cantidad: '1' }]);
  const quitarItem = (key: number) => setItems((xs) => (xs.length > 1 ? xs.filter((x) => x.key !== key) : xs));
  const cambiarItem = (key: number, campo: 'precio' | 'cantidad', valor: string) =>
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, [campo]: valor } : x)));

  // ----- Montos y fechas -----
  const [total, setTotal] = useState('');
  const [sena, setSena] = useState('');
  const [envioCliente, setEnvioCliente] = useState('');
  const [fechaVenta, setFechaVenta] = useState(hoy);
  const [fechaManual, setFechaManual] = useState('');
  const [canal, setCanal] = useState(inicial?.canal ?? '');

  const sumaItems = items.reduce((s, it) => s + leerMonto(it.precio) * (Number(it.cantidad) || 1), 0);
  const totalFinal = total ? leerMonto(total) : sumaItems;
  const saldo = totalFinal + leerMonto(envioCliente) - leerMonto(sena);
  const fechaSugerida = useMemo(
    () => calcularFechaLimite(fechaVenta || hoy, regla, new Set(feriados)),
    [fechaVenta, hoy, regla, feriados],
  );

  return (
    <form
      // Se envía a mano para que, si hay un error, el formulario no se borre.
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => accion(fd));
      }}
      className="form-bloque"
      style={{ maxWidth: 720 }}
    >
      {/* ================= Cliente ================= */}
      <section className="card card-pad form-bloque">
        <h2>Cliente</h2>
        {cliente ? (
          <div className="acciones" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <input type="hidden" name="cliente_id" value={cliente.id} />
            <div>
              <div style={{ fontWeight: 600 }}>{cliente.nombre}</div>
              <div className="quiet small">{[cliente.telefono, cliente.localidad].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</div>
            </div>
            <button type="button" className="btn btn-chico" onClick={() => setCliente(null)}>
              Cambiar
            </button>
          </div>
        ) : (
          <>
            <div className="campo" style={{ position: 'relative' }}>
              <label htmlFor="cliente_nombre">Nombre</label>
              <input
                id="cliente_nombre"
                name="cliente_nombre"
                type="text"
                autoComplete="off"
                required
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Escribí para buscar o cargar uno nuevo"
              />
              {sugeridos.length > 0 && (
                <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, marginTop: 4 }}>
                  <div className="xs faint" style={{ padding: '8px 12px 0' }}>
                    Clientes existentes
                  </div>
                  {sugeridos.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="btn btn-fantasma btn-bloque"
                      style={{ justifyContent: 'flex-start', textAlign: 'left', borderRadius: 0 }}
                      onClick={() => {
                        setCliente(c);
                        setSugeridos([]);
                      }}
                    >
                      <span>
                        <strong>{c.nombre}</strong>
                        <span className="quiet small"> {[c.telefono, c.localidad].filter(Boolean).join(' · ')}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="fila fila-2">
              <div className="campo">
                <label htmlFor="cliente_telefono">Teléfono</label>
                <input id="cliente_telefono" name="cliente_telefono" type="tel" inputMode="tel" autoComplete="off" defaultValue={inicial?.telefono} />
              </div>
              <div className="campo">
                <label htmlFor="cliente_localidad">Localidad</label>
                <input id="cliente_localidad" name="cliente_localidad" type="text" placeholder="CABA, La Plata…" />
              </div>
            </div>
            <details className="mas">
              <summary>Email, DNI y dirección</summary>
              <div className="form-bloque" style={{ marginTop: 8 }}>
                <div className="fila fila-2">
                  <div className="campo">
                    <label htmlFor="cliente_email">Email</label>
                    <input id="cliente_email" name="cliente_email" type="email" inputMode="email" />
                  </div>
                  <div className="campo">
                    <label htmlFor="cliente_dni">DNI</label>
                    <input id="cliente_dni" name="cliente_dni" type="text" inputMode="numeric" />
                  </div>
                </div>
                <div className="fila fila-2">
                  <div className="campo">
                    <label htmlFor="cliente_direccion">Dirección</label>
                    <input id="cliente_direccion" name="cliente_direccion" type="text" />
                  </div>
                  <div className="campo">
                    <label htmlFor="cliente_cp">Código postal</label>
                    <input id="cliente_cp" name="cliente_cp" type="text" inputMode="numeric" />
                  </div>
                </div>
              </div>
            </details>
          </>
        )}

        <div className="campo">
          <span className="etiqueta">Canal</span>
          <div className="segmentado" role="radiogroup" aria-label="Canal">
            {CANALES.map((c) => (
              <label key={c.id}>
                <input type="radio" name="canal" value={c.id} required checked={canal === c.id} onChange={() => setCanal(c.id)} />
                {c.nombre}
              </label>
            ))}
          </div>
        </div>
      </section>

      {/* ================= Productos ================= */}
      <section className="card card-pad form-bloque">
        <h2>Productos</h2>
        <datalist id="productos-sugeridos">
          {PRODUCTOS_SUGERIDOS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <datalist id="materiales-sugeridos">
          {MATERIALES_SUGERIDOS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        {items.map((it, i) => (
          <div key={it.key} className="form-bloque" style={i > 0 ? { borderTop: '1px solid var(--line)', paddingTop: 12 } : undefined}>
            {items.length > 1 && (
              <div className="acciones" style={{ justifyContent: 'space-between' }}>
                <span className="etiqueta">Producto {i + 1}</span>
                <button type="button" className="btn btn-fantasma btn-chico btn-peligro" onClick={() => quitarItem(it.key)}>
                  Quitar
                </button>
              </div>
            )}
            <div className="fila fila-2m">
              <div className="campo">
                <label>Producto</label>
                <input name="item_producto" type="text" list="productos-sugeridos" placeholder="mesa ratona" required />
              </div>
              <div className="campo">
                <label>Modelo</label>
                <input name="item_modelo" type="text" placeholder="lucero, eclipse…" />
              </div>
            </div>
            <div className="fila fila-2m">
              <div className="campo">
                <label>Medidas</label>
                <input name="item_medidas" type="text" placeholder="160x90x75" className="mono" />
              </div>
              <div className="campo">
                <label>Color</label>
                <input name="item_color" type="text" placeholder="bronce, rosa…" />
              </div>
            </div>
            <div className="fila fila-2m">
              <div className="campo">
                <label>Precio</label>
                <input
                  name="item_precio"
                  type="text"
                  inputMode="numeric"
                  placeholder="$"
                  className="num"
                  value={it.precio}
                  onChange={(e) => cambiarItem(it.key, 'precio', e.target.value)}
                />
              </div>
              <div className="campo">
                <label>Cantidad</label>
                <input
                  name="item_cantidad"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={it.cantidad}
                  onChange={(e) => cambiarItem(it.key, 'cantidad', e.target.value)}
                />
              </div>
            </div>
            <details className="mas">
              <summary>Material, puntas y tapa</summary>
              <div className="fila fila-3" style={{ marginTop: 8 }}>
                <div className="campo">
                  <label>Material</label>
                  <input name="item_material" type="text" list="materiales-sugeridos" placeholder="10mm, 5+5" />
                </div>
                <div className="campo">
                  <label>Puntas</label>
                  <input name="item_puntas" type="text" placeholder="rectas" />
                </div>
                <div className="campo">
                  <label>Tapa</label>
                  <input name="item_tapa" type="text" placeholder="c/ insertos" />
                </div>
              </div>
            </details>
          </div>
        ))}
        <button type="button" className="btn" onClick={agregarItem}>
          + Agregar otro producto
        </button>
      </section>

      {/* ================= Pago ================= */}
      <section className="card card-pad form-bloque">
        <h2>Pago</h2>
        <div className="fila fila-2m">
          <div className="campo">
            <label htmlFor="total">Total</label>
            <input
              id="total"
              name="total"
              type="text"
              inputMode="numeric"
              className="num"
              placeholder={sumaItems > 0 ? plata(sumaItems) : '$'}
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
            {sumaItems > 0 && !total && <span className="ayuda">Suma de los productos</span>}
          </div>
          <div className="campo">
            <label htmlFor="sena">Seña cobrada</label>
            <input id="sena" name="sena" type="text" inputMode="numeric" className="num" placeholder="$" value={sena} onChange={(e) => setSena(e.target.value)} />
          </div>
        </div>
        <div className="fila fila-2m">
          <div className="campo">
            <label htmlFor="forma_pago">Forma de pago</label>
            <select id="forma_pago" name="forma_pago" defaultValue={canal === 'tiendanube' ? 'pagonube' : 'transferencia'} key={canal}>
              {FORMAS_PAGO.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="tipo_venta">Tipo de venta</label>
            <select id="tipo_venta" name="tipo_venta" defaultValue="minorista">
              {TIPOS_VENTA.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* ================= Entrega ================= */}
      <section className="card card-pad form-bloque">
        <h2>Entrega</h2>
        <div className="campo">
          <span className="etiqueta">Modalidad</span>
          <div className="segmentado" role="radiogroup" aria-label="Modalidad de entrega">
            {ENVIOS.map((e) => (
              <label key={e.id}>
                <input type="radio" name="envio" value={e.id} defaultChecked={e.id === 'coordinar'} />
                {e.nombre}
              </label>
            ))}
          </div>
        </div>
        <div className="fila fila-2m">
          <div className="campo">
            <label htmlFor="precio_envio_cliente">Envío que paga el cliente</label>
            <input
              id="precio_envio_cliente"
              name="precio_envio_cliente"
              type="text"
              inputMode="numeric"
              className="num"
              placeholder="$ 0"
              value={envioCliente}
              onChange={(e) => setEnvioCliente(e.target.value)}
            />
          </div>
          <div className="campo">
            <label htmlFor="fecha_limite">Fecha límite</label>
            <input id="fecha_limite" name="fecha_limite" type="date" value={fechaManual || fechaSugerida} onChange={(e) => setFechaManual(e.target.value)} />
            <span className="ayuda">
              {fechaManual && fechaManual !== fechaSugerida
                ? 'Cambiada a mano'
                : `${regla.dias} días ${regla.tipo === 'habiles' ? 'hábiles' : 'corridos'} desde la venta`}
            </span>
          </div>
        </div>
        <details className="mas">
          <summary>Otra fecha de venta, responsable y dirección de entrega</summary>
          <div className="form-bloque" style={{ marginTop: 8 }}>
            <div className="fila fila-2m">
              <div className="campo">
                <label htmlFor="fecha_venta">Fecha de venta</label>
                <input id="fecha_venta" name="fecha_venta" type="date" value={fechaVenta} max={hoy} onChange={(e) => setFechaVenta(e.target.value)} />
              </div>
              <div className="campo">
                <label htmlFor="responsable_id">Vendedor</label>
                <select id="responsable_id" name="responsable_id" defaultValue={yo}>
                  {equipo.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="campo">
              <label htmlFor="direccion_entrega">Dirección de entrega (si no es la del cliente)</label>
              <input id="direccion_entrega" name="direccion_entrega" type="text" />
            </div>
          </div>
        </details>
      </section>

      {/* ================= Notas y marketing ================= */}
      <section className="card card-pad form-bloque">
        <div className="campo">
          <label htmlFor="observaciones">Observaciones</label>
          <textarea id="observaciones" name="observaciones" placeholder="Lo que haya que tener en cuenta para este pedido" />
        </div>
        <details className="mas">
          <summary>Marketing (pauta, campaña)</summary>
          <div className="form-bloque" style={{ marginTop: 8 }}>
            <div className="campo">
              <span className="etiqueta">¿Vino por pauta?</span>
              <div className="segmentado">
                <label>
                  <input type="radio" name="pauta" value="si" /> Sí
                </label>
                <label>
                  <input type="radio" name="pauta" value="no" /> No
                </label>
                <label>
                  <input type="radio" name="pauta" value="" defaultChecked /> No sé
                </label>
              </div>
            </div>
            <div className="fila fila-2m">
              <div className="campo">
                <label htmlFor="campana">Campaña</label>
                <input id="campana" name="campana" type="text" />
              </div>
              <div className="campo">
                <label htmlFor="dm_inbound">DM / Inbound</label>
                <input id="dm_inbound" name="dm_inbound" type="text" />
              </div>
            </div>
          </div>
        </details>
      </section>

      {estado.error && <p className="error-form" role="alert">{estado.error}</p>}

      <div className="form-pie">
        <button className="btn btn-primario btn-bloque" disabled={guardando}>
          {guardando ? 'Guardando…' : `Guardar pedido${totalFinal > 0 ? ` · saldo ${plata(saldo)}` : ''}`}
        </button>
      </div>
      <p className="faint xs" style={{ marginTop: -4 }}>
        Fecha límite: {fechaCorta(fechaManual || fechaSugerida)}
      </p>
    </form>
  );
}

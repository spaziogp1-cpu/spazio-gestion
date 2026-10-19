// Lee las ventas que se cargan a mano en la planilla original (VENTAS_2026, columnas A a AJ)
// y las agrupa en pedidos. Sin dependencias de servidor: se puede probar.

export type Celda = string | number | boolean | null | undefined;

export type VentaPlanilla = {
  clave: string; // identifica la venta en la planilla: número + cliente + fecha
  filas: number[]; // números de fila en la planilla (1 = encabezado)
  numero: number | null;
  fecha_venta: string; // AAAA-MM-DD
  tipo_venta: 'minorista' | 'mayorista' | 'profesional';
  etapa: 'senado' | 'en_fabricacion' | 'lista' | 'entregado' | 'cancelado';
  canal: 'whatsapp' | 'instagram' | 'tiendanube' | 'showroom' | 'propia';
  vendedor: string | null; // como figura en la planilla (Tete, Agui…)
  forma_pago: string | null;
  envio: 'retira' | 'flete' | 'expreso' | 'coordinar';
  total: number;
  sena: number;
  precio_envio_cliente: number;
  fecha_limite: string | null;
  fecha_entrega_real: string | null;
  observaciones: string | null;
  pauta: boolean | null;
  campana: string | null;
  dm_inbound: string | null;
  cliente: { nombre: string; telefono: string | null; email: string | null; dni: string | null; direccion: string | null; localidad: string | null; codigo_postal: string | null };
  items: { producto: string; modelo: string | null; color: string | null; puntas: string | null; tapa: string | null; material: string | null; medidas: string | null; cantidad: number; precio: number | null }[];
};

const txt = (v: Celda): string | null => {
  if (v == null || v === false) return null;
  const s = String(v).trim();
  return s === '' || s === '-' ? null : s;
};

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const normalizarNombre = (s: string) => sinAcentos(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Monto de la planilla: número, o texto como "$750,750.00" / "$ 1.350.000,50". Texto sin número = 0. */
export function monto(v: Celda): number {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
  const s0 = txt(v);
  if (!s0 || /[a-z]/i.test(s0.replace(/ars|\$/gi, ''))) return 0; // "TRANSF 12/10" no es un monto
  let s = s0.replace(/[^\d,.-]/g, '');
  if (!/\d/.test(s)) return 0;
  const ultComa = s.lastIndexOf(',');
  const ultPunto = s.lastIndexOf('.');
  if (ultComa >= 0 && ultPunto >= 0) {
    // El separador que aparece último es el decimal.
    s = ultComa > ultPunto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (ultComa >= 0) {
    // Solo comas: "750,750" son miles; "750,5" es decimal.
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(/,(?=[^,]*$)/, '.').replace(/,/g, '');
  } else if (ultPunto >= 0) {
    s = /^-?\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s.replace(/\.(?=[^.]*\.)/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** Fecha d/m/aaaa (o número de serie de Sheets) → AAAA-MM-DD. */
export function fecha(v: Celda): string | null {
  if (typeof v === 'number' && v > 30000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = txt(v);
  if (!s) return null;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const a = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    if (a < 2020 || a > 2100) return null;
    return `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function etapaDesdeEstado(v: Celda): VentaPlanilla['etapa'] {
  const s = sinAcentos(String(v ?? ''));
  if (s.startsWith('entregad')) return 'entregado';
  if (s.startsWith('list')) return 'lista';
  if (s.includes('produc') || s.includes('demorad') || s.includes('fabric')) return 'en_fabricacion';
  if (s.startsWith('cancel')) return 'cancelado';
  return 'senado';
}

function canal(v: Celda): VentaPlanilla['canal'] {
  const s = sinAcentos(String(v ?? ''));
  if (s.includes('tienda') || s.includes('nube') || s.includes('pagina')) return 'tiendanube';
  if (s.includes('insta')) return 'instagram';
  if (s.includes('show')) return 'showroom';
  if (s.includes('propia')) return 'propia';
  return 'whatsapp';
}

function envio(v: Celda): VentaPlanilla['envio'] {
  const s = sinAcentos(String(v ?? ''));
  if (s.startsWith('retir')) return 'retira';
  if (s.startsWith('flete')) return 'flete';
  if (s.startsWith('expres')) return 'expreso';
  return 'coordinar';
}

function tipo(v: Celda): VentaPlanilla['tipo_venta'] {
  const s = sinAcentos(String(v ?? ''));
  if (s.startsWith('mayor')) return 'mayorista';
  if (s.startsWith('profes')) return 'profesional';
  return 'minorista';
}

/**
 * Convierte las filas de VENTAS_2026 en ventas. `filas[0]` es la fila 1 (encabezados).
 * Una venta = filas seguidas con el mismo número y el mismo cliente (una fila por producto).
 * Se ignoran las filas sin cliente o sin fecha, y las anteriores a `desde`.
 */
export function ventasDesdeFilas(filas: Celda[][], desde: string): VentaPlanilla[] {
  const ventas: VentaPlanilla[] = [];
  let actual: VentaPlanilla | null = null;
  for (let i = 1; i < filas.length; i++) {
    const r = filas[i] ?? [];
    const cliente = txt(r[3]);
    const f = fecha(r[0]);
    if (!cliente || !f || f < desde) {
      actual = null;
      continue;
    }
    const numero = typeof r[1] === 'number' ? r[1] : Number(txt(r[1])) || null;
    const clave = `${numero ?? ''}|${normalizarNombre(cliente)}|${f}`;
    const cantidad = Math.max(1, Math.round(monto(r[18])) || 1);
    const totalFila = monto(r[20]);
    const item = {
      producto: txt(r[11]) ?? 'Personalizado',
      modelo: txt(r[12]),
      color: txt(r[13]),
      puntas: txt(r[14]),
      tapa: txt(r[15]),
      material: txt(r[16]),
      medidas: txt(r[17]),
      cantidad,
      precio: totalFila ? Math.round((totalFila / cantidad) * 100) / 100 : null,
    };

    if (actual && actual.clave === clave) {
      actual.filas.push(i + 1);
      actual.items.push(item);
      actual.total += totalFila;
      actual.sena += monto(r[21]);
      actual.precio_envio_cliente += monto(r[24]);
      continue;
    }

    const pauta = sinAcentos(String(r[31] ?? ''));
    actual = {
      clave,
      filas: [i + 1],
      numero,
      fecha_venta: f,
      tipo_venta: tipo(r[2]),
      etapa: etapaDesdeEstado(r[10]),
      canal: canal(r[26]),
      vendedor: txt(r[27]) && sinAcentos(String(r[27])) !== 'no aplica' ? txt(r[27]) : null,
      forma_pago: txt(r[19]),
      envio: envio(r[22]),
      total: totalFila,
      sena: monto(r[21]),
      precio_envio_cliente: monto(r[24]),
      fecha_limite: fecha(r[28]),
      fecha_entrega_real: fecha(r[29]),
      observaciones: [txt(r[30]), txt(r[35]) && `Cierre: ${txt(r[35])}`].filter(Boolean).join('\n') || null,
      pauta: pauta.startsWith('si') ? true : pauta.startsWith('no') ? false : null,
      campana: txt(r[32]),
      dm_inbound: txt(r[34]),
      cliente: {
        nombre: cliente,
        telefono: txt(r[4]),
        email: txt(r[5])?.toLowerCase() ?? null,
        dni: txt(r[6]),
        direccion: txt(r[7]),
        localidad: txt(r[8]),
        codigo_postal: txt(r[9]),
      },
      items: [item],
    };
    ventas.push(actual);
  }
  return ventas;
}

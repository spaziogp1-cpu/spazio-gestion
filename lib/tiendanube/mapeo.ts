// Convierte una orden de Tienda Nube en los datos de un pedido de la app.
// Sin dependencias de servidor: se puede probar.

export type OrdenTN = {
  id: number;
  number?: number;
  created_at?: string;
  paid_at?: string | null;
  payment_status?: string;
  status?: string;
  currency?: string;
  subtotal?: string | number;
  discount?: string | number;
  total?: string | number;
  shipping_cost_customer?: string | number | null;
  shipping_pickup_type?: string | null;
  shipping_option?: string | { name?: string } | null;
  gateway?: string | null;
  gateway_name?: string | null;
  payment_details?: { method?: string | null; installments?: string | number | null } | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  contact_identification?: string | null;
  billing_name?: string | null;
  billing_phone?: string | null;
  customer?: { name?: string | null; email?: string | null; phone?: string | null; identification?: string | null } | null;
  shipping_address?: {
    name?: string | null;
    address?: string | null;
    number?: string | null;
    floor?: string | null;
    locality?: string | null;
    city?: string | null;
    province?: string | null;
    zipcode?: string | null;
    phone?: string | null;
  } | null;
  note?: string | null;
  owner_note?: string | null;
  products?: {
    name?: string | Record<string, string> | null;
    variant_values?: (string | Record<string, string>)[] | null;
    quantity?: string | number | null;
    price?: string | number | null;
    sku?: string | null;
  }[];
};

export type ItemPedido = {
  producto: string;
  modelo: string | null;
  color: string | null;
  puntas: null;
  tapa: null;
  material: string | null;
  medidas: string | null;
  cantidad: number;
  precio: number | null;
};

export type DatosPedido = {
  tiendanube_id: string;
  numero_tn: number | null;
  canal: 'tiendanube';
  fecha_venta: string;
  cliente: { nombre: string; telefono: string | null; email: string | null; dni: string | null; direccion: string | null; localidad: string | null; codigo_postal: string | null };
  envio: 'retira' | 'coordinar';
  direccion_entrega: string | null;
  forma_pago: string;
  total: number;
  precio_envio_cliente: number;
  sena: number;
  observaciones: string | null;
  items: ItemPedido[];
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const txt = (v: unknown): string | null => {
  if (v == null) return null;
  if (typeof v === 'object') v = Object.values(v as Record<string, string>)[0];
  const s = String(v).trim();
  return s ? s : null;
};
const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Fecha 'YYYY-MM-DD' en hora de Buenos Aires. */
export function fechaAR(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(d);
}

// Tipos de producto como en la planilla (columna PRODUCTO).
const TIPOS: [RegExp, string][] = [
  [/\bsillas?\b/, 'sillas'],
  [/\btaburetes?\b/, 'taburete'],
  [/\bescritorio/, 'escritorio'],
  [/\bratona/, 'mesa ratona'],
  [/\bde luz\b/, 'mesa de luz'],
  [/\b(auxiliar|arrime)/, 'mesa auxiliar'],
  [/\b(comedor|alta)\b/, 'mesa alta'],
  [/\bespejo/, 'espejos'],
  [/\b(estanteria|biblioteca|estante)/, 'estanteria'],
  [/\bvinilero/, 'vinilero'],
  [/\bbases?\b/, 'bases'],
  [/\bvidrio/, 'vidrio'],
  [/\bmesa\b/, 'mesa alta'],
];

// Modelos de la planilla (columna DETALLE DE PRODUCTO), del más largo al más corto.
const MODELOS = [
  'helios c/ estante', 'tierra c/ estante', 'astra duo', 'galaxia ii', 'modulo ii', 'medio punto',
  'gravedad', 'vortice', 'palta', 'canoa', 'atlas', 'eclipse', 'venus', 'tierra', 'luna', 'aire', 'universo',
  'luz', 'sol', 'galaxia', 'cubo', 'nova', 'cosmico', 'nebula', 'orbita', 'cosmos', 'neptuno', 'mercurio',
  'orion', 'modulo', 'constelacion', 'plasma', 'zenit', 'aurora', 'binario', 'bar', 'lux', 'eco', 'kepler',
  'estelar', 'nucleo', 'cesca', 'helios', 'bote', 'tori', 'prisma', 'nexo', 'boreal', 'halo', 'totem',
  'tiempo', 'pua', 'arcos', 'lucero', 'circulo', 'capilla', 'duna', 'lyra', 'nube', 'saturno', 'jupiter', 'ceres',
];

const COLORES = [
  'incoloro biselado', 'acid white', 'gris claro', 'incoloro', 'amarillo', 'azul', 'gris', 'naranja', 'rosa',
  'verde', 'rojo', 'violeta', 'combinada', 'bronce', 'blanco', 'negro', 'insercion', 'mocca', 'seco', 'almendra', 'beige',
];

export function tipoProducto(nombre: string): string {
  const n = sinAcentos(nombre);
  for (const [re, tipo] of TIPOS) if (re.test(n)) return tipo;
  return 'Personalizado';
}

export function modeloProducto(nombre: string): string | null {
  const n = ` ${sinAcentos(nombre).replace(/[^a-z0-9/ ]+/g, ' ')} `;
  // "mesa de luz" es un tipo, no el modelo "luz".
  const sinTipo = n.replace(/ mesa de luz /g, ' ');
  return MODELOS.find((m) => sinTipo.includes(` ${m} `)) ?? null;
}

/** Reparte los valores de la variante (medidas, color, espesor) en las columnas de la planilla. */
export function leerVariante(valores: string[]): { medidas: string | null; color: string | null; material: string | null; resto: string[] } {
  let medidas: string | null = null;
  let color: string | null = null;
  let material: string | null = null;
  const resto: string[] = [];
  for (const v of valores) {
    const n = sinAcentos(v);
    if (!medidas && /\d+\s*(cm)?\s*[x×]\s*\d+/.test(n)) medidas = v.replace(/\s+/g, '');
    else if (!material && /(\d+\s*\+\s*\d+|\d+\s*mm)\b/.test(n)) material = n.replace(/\s+/g, '');
    else if (!color && COLORES.some((c) => n.includes(c))) color = COLORES.find((c) => n.includes(c)) ?? v;
    else resto.push(v);
  }
  return { medidas, color, material, resto };
}

export function formaPago(o: OrdenTN): string {
  const g = sinAcentos(`${o.gateway ?? ''} ${o.gateway_name ?? ''}`);
  const metodo = sinAcentos(String(o.payment_details?.method ?? ''));
  if (/transfer|deposito|wire/.test(`${g} ${metodo}`) || metodo === 'custom' || metodo === 'bank_transfer') return 'transferencia';
  if (/efectivo|cash/.test(`${g} ${metodo}`)) return 'efectivo';
  if (/pago.?nube|nuvem|tiendanube/.test(g)) return 'pagonube';
  if (/mercado.?pago/.test(g)) return 'cuotas/mp';
  return 'otro';
}

/**
 * En las compras por transferencia, Spazio deja la orden "sin pagar" en Tienda Nube (el cliente
 * solo deja una seña) y recién marca "pago recibido" cuando entrega. Ese aviso de pago llega días
 * o semanas después de la compra y la venta ya está cargada: no es una venta nueva.
 * Una tarjeta o Pago Nube se acreditan en el momento, así que la diferencia es de minutos u horas.
 */
export function pagoMarcadoDespues(o: OrdenTN, dias = 2): boolean {
  if (!o.created_at || !o.paid_at) return false;
  const creada = new Date(o.created_at).getTime();
  const pagada = new Date(o.paid_at).getTime();
  if (Number.isNaN(creada) || Number.isNaN(pagada)) return false;
  return pagada - creada > dias * 24 * 60 * 60 * 1000;
}

export function pedidoDesdeOrden(o: OrdenTN): DatosPedido {
  const dir = o.shipping_address ?? {};
  const retira = o.shipping_pickup_type === 'pickup';

  const subtotal = num(o.subtotal);
  const descuento = num(o.discount);
  const totalOrden = num(o.total);
  const envio =
    o.shipping_cost_customer != null && o.shipping_cost_customer !== ''
      ? num(o.shipping_cost_customer)
      : Math.max(0, num(totalOrden - subtotal + descuento));
  // En la app, "total" son los productos y el envío al cliente va aparte.
  const total = Math.max(0, num(totalOrden - envio));
  const pagado = o.payment_status === 'paid' ? totalOrden : 0;

  const notas: string[] = [];
  const items: ItemPedido[] = (o.products ?? []).map((pr) => {
    const nombre = txt(pr.name) ?? 'Producto';
    const valores = (pr.variant_values ?? []).map((v) => txt(v)).filter((v): v is string => Boolean(v));
    const v = leerVariante(valores);
    if (v.resto.length) notas.push(`${nombre}: ${v.resto.join(' · ')}`);
    return {
      producto: tipoProducto(nombre),
      modelo: modeloProducto(nombre) ?? nombre,
      color: v.color,
      puntas: null,
      tapa: null,
      material: v.material,
      medidas: v.medidas,
      cantidad: Math.max(1, Math.round(num(pr.quantity)) || 1),
      precio: pr.price != null ? num(pr.price) : null,
    };
  });

  const calle = [txt(dir.address), txt(dir.number)].filter(Boolean).join(' ');
  const direccion = [calle, txt(dir.floor)].filter(Boolean).join(', ') || null;
  const ciudad = txt(dir.city) ?? txt(dir.locality);
  const provincia = txt(dir.province);
  const localidad = ciudad && provincia && sinAcentos(ciudad) !== sinAcentos(provincia) ? `${ciudad}, ${provincia}` : ciudad ?? provincia;

  const envioNombre = typeof o.shipping_option === 'string' ? o.shipping_option : o.shipping_option?.name;
  if (o.number) notas.unshift(`Tienda Nube #${o.number}`);
  if (descuento > 0) notas.push(`Descuento aplicado: $${descuento.toLocaleString('es-AR')}`);
  if (txt(envioNombre)) notas.push(`Envío elegido: ${txt(envioNombre)}`);
  if (txt(o.note)) notas.push(`Nota del cliente: ${txt(o.note)}`);
  if (o.payment_details?.installments && num(o.payment_details.installments) > 1) notas.push(`${num(o.payment_details.installments)} cuotas`);

  return {
    tiendanube_id: String(o.id),
    numero_tn: o.number ?? null,
    canal: 'tiendanube',
    // La venta es el día en que el cliente compró, no el día en que se marcó el pago.
    fecha_venta: fechaAR(o.created_at || o.paid_at),
    cliente: {
      nombre: txt(o.customer?.name) ?? txt(o.contact_name) ?? txt(o.billing_name) ?? txt(dir.name) ?? 'Cliente Tienda Nube',
      telefono: txt(o.contact_phone) ?? txt(o.customer?.phone) ?? txt(dir.phone) ?? txt(o.billing_phone),
      email: txt(o.contact_email) ?? txt(o.customer?.email),
      dni: txt(o.contact_identification) ?? txt(o.customer?.identification),
      direccion,
      localidad,
      codigo_postal: txt(dir.zipcode),
    },
    envio: retira ? 'retira' : 'coordinar',
    direccion_entrega: retira ? null : direccion && localidad ? `${direccion}, ${localidad}` : direccion,
    forma_pago: formaPago(o),
    total,
    precio_envio_cliente: envio,
    sena: pagado,
    observaciones: notas.length ? notas.join('\n') : null,
    items,
  };
}

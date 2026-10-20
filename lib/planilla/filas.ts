// Arma las filas de VENTAS_2026 (columnas A a AJ) a partir de un pedido de la app.
// Una fila por producto, igual que la planilla. Sin dependencias de servidor: se puede probar.

export const HOJA_VENTAS = 'VENTAS_2026';

export type PedidoParaPlanilla = {
  numero: number;
  fecha_venta: string;
  tipo_venta: string;
  canal: string;
  etapa: string;
  envio: string;
  forma_pago: string | null;
  total: number;
  precio_envio_cliente: number;
  fecha_limite: string;
  fecha_entrega_real: string | null;
  observaciones: string | null;
  pauta: boolean | null;
  campana: string | null;
  dm_inbound: string | null;
  pagado: number;
  vendedor: string | null; // alias en la planilla
  cliente: { nombre: string; telefono: string | null; email: string | null; dni: string | null; direccion: string | null; localidad: string | null; codigo_postal: string | null };
  items: { producto: string; modelo: string | null; color: string | null; puntas: string | null; tapa: string | null; material: string | null; medidas: string | null; cantidad: number; precio: number | null }[];
};

export function fechaPlanilla(f: string | null | undefined): string {
  if (!f) return '';
  const [a, m, d] = f.slice(0, 10).split('-').map(Number);
  return `${d}/${m}/${a}`;
}

export function estadoPlanilla(etapa: string): string {
  switch (etapa) {
    case 'senado':
      return 'Tomar pedido';
    case 'pedido_fabrica':
    case 'en_fabricacion':
      return 'en producción';
    case 'lista':
    case 'embalada':
    case 'cliente_avisado':
    case 'envio_coordinado':
      return 'Listo';
    case 'entregado':
      return 'entregado';
    case 'cancelado':
      return 'cancelado';
    default:
      return etapa;
  }
}

const CANAL: Record<string, string> = { whatsapp: 'Whatsapp', instagram: 'Instagram', tiendanube: 'Tiendanube', showroom: 'Showroom', propia: 'Propia' };
const TIPO: Record<string, string> = { minorista: 'minorista', mayorista: 'mayorista', profesional: 'Profesional' };

export function filasPedido(p: PedidoParaPlanilla): (string | number)[][] {
  const items = p.items.length ? p.items : [{ producto: '', modelo: null, color: null, puntas: null, tapa: null, material: null, medidas: null, cantidad: 1, precio: null }];
  // Total por fila: el precio del producto; si no hay precios cargados, todo el total va en la primera fila.
  const conPrecio = items.some((i) => i.precio != null);
  return items.map((it, i) => {
    const primera = i === 0;
    const totalFila = conPrecio ? Number(it.precio ?? 0) * (it.cantidad || 1) : primera ? Number(p.total) : 0;
    const sena = primera ? Number(p.pagado) : 0;
    const envio = primera ? Number(p.precio_envio_cliente) : 0;
    const saldo = totalFila + envio - sena;
    return [
      fechaPlanilla(p.fecha_venta), // A FECHA DE CREACION
      p.numero, // B N DE COMPRA
      TIPO[p.tipo_venta] ?? p.tipo_venta, // C TIPO DE VENTA
      p.cliente.nombre, // D CLIENTE
      p.cliente.telefono ?? '', // E TELEFONO
      p.cliente.email ?? '', // F EMAIL
      p.cliente.dni ?? '', // G DNI
      p.cliente.direccion ?? '', // H DIRECCION
      p.cliente.localidad ?? '', // I PROVINCIA
      p.cliente.codigo_postal ?? '', // J CP
      estadoPlanilla(p.etapa), // K ESTADO
      it.producto, // L PRODUCTO
      it.modelo ?? '', // M DETALLE DE PRODUCTO
      it.color ?? '', // N COLOR
      it.puntas ?? '-', // O PUNTAS
      it.tapa ?? '-', // P TAPA
      it.material ?? '', // Q MATERIAL
      it.medidas ?? '', // R MEDIDAS
      it.cantidad || 1, // S CANTIDAD
      p.forma_pago ?? '', // T FORMA DE PAGO
      totalFila, // U TOTAL DE COMPRA
      sena || '', // V SENA
      p.envio, // W ENVIO
      '', // X Costo Envio (no se carga en la app)
      envio || '', // Y Precio Envio (cliente)
      saldo, // Z SALDO
      CANAL[p.canal] ?? p.canal, // AA CANAL
      p.vendedor ?? 'no aplica', // AB VENDEDOR
      fechaPlanilla(p.fecha_limite), // AC FECHA LIMITE DE ENTREGA
      fechaPlanilla(p.fecha_entrega_real), // AD FECHA REAL DE ENTREGA
      primera ? (p.observaciones ?? '') : '', // AE OBSERVACIONES
      p.pauta === true ? 'SI' : p.pauta === false ? 'NO' : '-', // AF PAUTA?
      p.campana ?? '-', // AG CAMPAÑA
      '-', // AH LINK/RESPUESTA
      p.dm_inbound ?? '-', // AI DM/INBOUND
      p.canal === 'showroom' ? 'SHOWROOM' : p.canal === 'tiendanube' ? 'PAGINA' : p.canal === 'instagram' ? 'INSTAGRAM' : 'WSP', // AJ CIERRE
    ];
  });
}

// Filas de la planilla que corresponden a un pedido: mismo N° de compra y mismo cliente.
export function filasDelPedido(columnaB: string[][], columnaD: string[][], numero: number, cliente: string, desdeFila = 1): number[] {
  const nombre = cliente.trim().toLowerCase();
  const filas: number[] = [];
  for (let i = 0; i < columnaB.length; i++) {
    if ((columnaB[i]?.[0] ?? '').trim() === String(numero) && (columnaD[i]?.[0] ?? '').trim().toLowerCase() === nombre) {
      filas.push(i + desdeFila);
    }
  }
  return filas;
}

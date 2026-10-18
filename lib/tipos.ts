export type Miembro = {
  id: string;
  nombre: string;
  alias_planilla: string | null;
  email: string;
  rol: 'admin' | 'equipo';
};

export type Cliente = {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  dni: string | null;
  direccion: string | null;
  localidad: string | null;
  codigo_postal: string | null;
  notas: string | null;
};

export type PedidoResumen = {
  id: string;
  numero: number;
  cliente_id: string;
  tipo_venta: string;
  canal: string;
  responsable_id: string | null;
  etapa: string;
  fecha_venta: string;
  fecha_limite: string;
  fecha_entrega_programada: string | null;
  fecha_entrega_real: string | null;
  envio: string;
  direccion_entrega: string | null;
  forma_pago: string | null;
  total: number;
  precio_envio_cliente: number;
  observaciones: string | null;
  pauta: boolean | null;
  campana: string | null;
  dm_inbound: string | null;
  creado_en: string;
  cliente_nombre: string;
  cliente_telefono: string | null;
  cliente_localidad: string | null;
  responsable_nombre: string | null;
  pagado: number;
  saldo: number;
  atrasado: boolean;
  dias_restantes: number;
  productos: string;
  prov_pendientes: number;
  prov_recibidos: number;
  prov_resumen: string;
};

export type Proveedor = { id: string; nombre: string; plazo_dias: number };

export type PedidoProveedor = {
  id: string;
  pedido_id: string | null;
  proveedor_id: string;
  detalle: string | null;
  estado: 'pedido' | 'recibido' | 'cancelado';
  fecha_pedido: string;
  fecha_esperada: string | null;
  fecha_recepcion: string | null;
  link_drive: string | null;
  nota: string | null;
  cantidad: string | null;
  proveedor_nombre: string;
  pedido_numero: number | null;
  pedido_etapa: string | null;
  pedido_fecha_limite: string | null;
  cliente_nombre: string | null;
  es_stock: boolean;
  demorado: boolean;
};

export type Item = {
  id: string;
  producto: string;
  modelo: string | null;
  color: string | null;
  puntas: string | null;
  tapa: string | null;
  material: string | null;
  medidas: string | null;
  cantidad: number;
  precio: number | null;
  apto_fotos: boolean;
};

export type Pago = {
  id: string;
  tipo: string;
  monto: number;
  medio: string | null;
  fecha: string;
  nota: string | null;
};

export type Comentario = {
  id: string;
  texto: string;
  creado_en: string;
  autor: { nombre: string } | null;
};

export type Archivo = {
  id: string;
  nombre: string;
  ruta: string;
  tipo_mime: string | null;
  tamano: number | null;
  creado_en: string;
};

export type Evento = {
  id: number;
  entidad: string;
  accion: string;
  campo: string | null;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  usuario_email: string | null;
  creado_en: string;
};

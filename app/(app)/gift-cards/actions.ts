'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { leerMonto, texto } from '@/lib/formato';
import { linkWhatsAppTexto, mensajeEntrega, normalizarCodigo } from '@/lib/giftcard';
import { enviarEmail } from '@/lib/notificar/email';
import { emailConfirmacionComprador, emailEntrega } from '@/lib/notificar/giftcard-email';
import { miembroActual } from '@/lib/sesion';

export type Emitida = {
  codigo: string;
  para: string;
  vence: string;
  monto: number;
  email: { enviado: boolean; a: string | null; error?: string };
  whatsapp: string | null;
  mensaje: string;
};
export type EstadoGC = { error?: string; ok?: string; emitida?: Emitida; saldo?: number };

function refrescar() {
  revalidatePath('/gift-cards');
  revalidatePath('/avisos');
}

async function baseUrl() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'spazio-gestion.vercel.app';
  return `${host.startsWith('localhost') ? 'http' : 'https'}://${host}`;
}

type DatosCard = { para_nombre: string; para_email: string | null; para_telefono: string | null; de_nombre: string; dedicatoria: string | null; ocasion: string };

// Arma el mensaje y manda el correo a quien recibe (y el aviso a quien compró).
async function entregar(card: DatosCard, codigo: string, monto: number, vence: string, comprador?: { nombre: string; email: string; referencia: string }) {
  const base = await baseUrl();
  const urlSaldo = `${base}/gift-card/saldo?codigo=${encodeURIComponent(codigo)}`;
  const { supabase } = await miembroActual();
  const { data: p } = await supabase.from('parametros').select('valor').eq('clave', 'gc_whatsapp').maybeSingle();
  const waSpazio = linkWhatsAppTexto(p?.valor ?? '', `¡Hola! Tengo una gift card (${codigo}) y quiero elegir mi pieza.`);
  const mensaje = mensajeEntrega({ codigo, monto, para: card.para_nombre, de: card.de_nombre, dedicatoria: card.dedicatoria, vence, urlSaldo });

  let email: Emitida['email'] = { enviado: false, a: card.para_email };
  if (card.para_email) {
    const e = emailEntrega({ para: card.para_nombre, de: card.de_nombre, monto, ocasion: card.ocasion, dedicatoria: card.dedicatoria, codigo, vence, urlSaldo, urlLogo: `${base}/logo-spazio-negro.png`, whatsapp: waSpazio });
    const r = await enviarEmail(card.para_email, e.asunto, e.html, e.texto);
    email = { enviado: r.ok, a: card.para_email, error: r.error };
  }
  if (comprador?.email) {
    const c = emailConfirmacionComprador({ comprador: comprador.nombre.split(' ')[0], para: card.para_nombre, monto, referencia: comprador.referencia, vence });
    await enviarEmail(comprador.email, c.asunto, c.html, c.texto);
  }
  return { email, whatsapp: linkWhatsAppTexto(card.para_telefono, mensaje), mensaje };
}

export async function emitirGiftCard(solicitudId: string, _prev: EstadoGC, fd: FormData): Promise<EstadoGC> {
  const { miembro, supabase } = await miembroActual();
  if (miembro.rol !== 'admin') return { error: 'Solo un admin puede confirmar pagos.' };
  if (fd.get('verificado') !== '1') return { error: 'Confirmá que viste la transferencia acreditada en el home banking.' };
  const fecha = texto(fd.get('acreditada'));
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'Poné la fecha en que se acreditó.' };

  const { data: s } = await supabase.from('gc_solicitudes').select('*').eq('id', solicitudId).maybeSingle();
  if (!s) return { error: 'No encontramos la solicitud.' };
  const { data, error } = await supabase.rpc('gc_emitir', { p_solicitud: solicitudId, p_acreditada: fecha });
  if (error) return { error: error.message };
  const r = data as { codigo: string; vence: string; monto: number };
  const monto = Number(r.monto);
  const ent = await entregar(s, r.codigo, monto, r.vence, { nombre: s.comprador_nombre, email: s.comprador_email, referencia: `GC-${s.numero}` });
  refrescar();
  return { ok: 'Gift card emitida', emitida: { codigo: r.codigo, para: s.para_nombre, vence: r.vence, monto, ...ent } };
}

export async function nuevoCodigo(cardId: string): Promise<EstadoGC> {
  const { miembro, supabase } = await miembroActual();
  if (miembro.rol !== 'admin') return { error: 'Solo un admin puede generar un código nuevo.' };
  const { data: g } = await supabase.from('gift_cards_saldo').select('*').eq('id', cardId).maybeSingle();
  if (!g) return { error: 'No encontramos la tarjeta.' };
  const { data, error } = await supabase.rpc('gc_nuevo_codigo', { p_card: cardId });
  if (error) return { error: error.message };
  const codigo = (data as { codigo: string }).codigo;
  const ent = await entregar(g, codigo, Number(g.saldo), g.vence);
  refrescar();
  return { ok: 'Código nuevo generado. El anterior ya no sirve.', emitida: { codigo, para: g.para_nombre, vence: g.vence, monto: Number(g.saldo), ...ent } };
}

export async function cancelarSolicitud(id: string, motivo: string): Promise<EstadoGC> {
  const { supabase } = await miembroActual();
  const { error } = await supabase.rpc('gc_cancelar_solicitud', { p_solicitud: id, p_motivo: motivo || null });
  if (error) return { error: error.message };
  refrescar();
  return { ok: 'Cancelada' };
}

export async function marcarRevisada(id: string): Promise<EstadoGC> {
  const { supabase } = await miembroActual();
  const { error } = await supabase.rpc('gc_actualizar_solicitud', { p_solicitud: id, p_estado: 'pendiente_pago', p_notas: null });
  if (error) return { error: error.message };
  refrescar();
  return { ok: 'Revisada' };
}

export async function canjear(_prev: EstadoGC, fd: FormData): Promise<EstadoGC> {
  const { supabase } = await miembroActual();
  const codigo = normalizarCodigo(String(fd.get('codigo') ?? ''));
  if (!codigo) return { error: 'El código no es válido (tiene la forma SPZ-XXXX-XXXX).' };
  const monto = leerMonto(fd.get('monto'));
  if (monto <= 0) return { error: 'Escribí cuánto se descuenta.' };
  let pedidoId: string | null = null;
  const numero = texto(fd.get('pedido'));
  if (numero) {
    const n = Number(numero.replace(/\D/g, ''));
    const { data: p } = await supabase.from('pedidos').select('id').eq('numero', n).maybeSingle();
    if (!p) return { error: `No encontramos el pedido ${numero}.` };
    pedidoId = p.id;
  }
  const { data, error } = await supabase.rpc('gc_canjear', {
    p_codigo: codigo,
    p_monto: monto,
    p_pedido: pedidoId,
    p_nota: texto(fd.get('nota')),
    p_clave: texto(fd.get('clave')),
  });
  if (error) return { error: error.message };
  const r = data as { saldo: number; repetido?: boolean };
  refrescar();
  return { ok: r.repetido ? 'Ese canje ya estaba registrado.' : 'Saldo descontado.', saldo: Number(r.saldo) };
}

export async function consultarSaldo(codigoTexto: string): Promise<EstadoGC & { datos?: Record<string, unknown> }> {
  const { supabase } = await miembroActual();
  const codigo = normalizarCodigo(codigoTexto);
  if (!codigo) return { error: 'El código no es válido.' };
  const { data } = await supabase.rpc('gc_saldo', { p_codigo: codigo });
  if (!data) return { error: 'No encontramos una gift card con ese código.' };
  return { datos: data as Record<string, unknown>, saldo: Number((data as { saldo: number }).saldo) };
}

export async function prorrogar(cardId: string): Promise<EstadoGC> {
  const { supabase } = await miembroActual();
  const { data, error } = await supabase.rpc('gc_prorrogar', { p_card: cardId });
  if (error) return { error: error.message };
  refrescar();
  return { ok: `Prorrogada hasta el ${String((data as { vence: string }).vence).split('-').reverse().join('/')}` };
}

const PARAMS_PAGO = ['gc_alias', 'gc_cbu', 'gc_titular', 'gc_whatsapp'] as const;

export async function guardarDatosPago(_prev: EstadoGC, fd: FormData): Promise<EstadoGC> {
  const { miembro, supabase } = await miembroActual();
  if (miembro.rol !== 'admin') return { error: 'Solo un admin puede cambiar los datos de pago.' };
  const filas = [
    ...PARAMS_PAGO.map((clave) => ({ clave, valor: String(fd.get(clave) ?? '').trim().slice(0, 120) })),
    { clave: 'gc_activa', valor: fd.get('gc_activa') === 'si' ? 'si' : 'no' },
  ];
  const { error } = await supabase.from('parametros').upsert(filas, { onConflict: 'clave' });
  if (error) return { error: `No se pudo guardar: ${error.message}` };
  refrescar();
  return { ok: 'Guardado' };
}

export async function reintegrar(cardId: string, _prev: EstadoGC, fd: FormData): Promise<EstadoGC> {
  const { miembro, supabase } = await miembroActual();
  if (miembro.rol !== 'admin') return { error: 'Solo un admin puede reintegrar saldo.' };
  const monto = leerMonto(fd.get('monto'));
  const { data, error } = await supabase.rpc('gc_reintegrar', { p_card: cardId, p_monto: monto, p_nota: texto(fd.get('nota')) });
  if (error) return { error: error.message };
  refrescar();
  return { ok: 'Saldo reintegrado', saldo: Number((data as { saldo: number }).saldo) };
}

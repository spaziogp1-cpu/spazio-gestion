import { redirect } from 'next/navigation';

// "Mi día" llega en la entrega 1d. Mientras tanto, la portada son los pedidos.
export default function Inicio() {
  redirect('/pedidos');
}

import type { Metadata } from 'next';
import MenuMas from './menu';

export const metadata: Metadata = { title: 'Más' };

export default function MasPage() {
  return <MenuMas />;
}

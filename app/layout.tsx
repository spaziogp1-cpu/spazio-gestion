import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { SCRIPT_TEMA } from '@/components/tema';

// Tipografía: Neulis Sans es la de la marca; el proyecto no tiene sus archivos,
// así que se usa Inter. Para pasar a Neulis, sumar los .woff2 en /public/fonts y
// declararlos con next/font/local usando la misma variable (--fuente-sans).
const sans = Inter({ subsets: ['latin'], variable: '--fuente-sans', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Spazio · Gestión', template: '%s · Spazio' },
  description: 'Gestión interna de Spazio Design',
  appleWebApp: { capable: true, title: 'Spazio', statusBarStyle: 'default' },
  icons: { icon: '/icon.svg', apple: '/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F6F4F0' },
    { media: '(prefers-color-scheme: dark)', color: '#141518' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={sans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

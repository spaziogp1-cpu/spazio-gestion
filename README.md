# Spazio · Gestión

App interna de Spazio Design: pedidos, producción, entregas, showroom, tareas y objetivos.
Stack: Next.js + Supabase + Vercel. La especificación completa está en el documento
"Plataforma de gestión Spazio Design — Especificación".

## Qué incluye la entrega 1a

- Ingreso con link o código por email, solo para los emails cargados en `equipo`.
- Pedidos: alta rápida desde el celular (cliente, canal, productos, seña, entrega),
  lista con filtros (activos, atrasados, míos, con saldo, por etapa) y búsqueda.
- Ficha del pedido: etapas, productos, pagos y saldo, notas, archivos (fotos,
  comprobantes) e historial automático de cambios.
- Tablero de producción por etapa y ficha de clientes.
- Fecha límite automática: 28 días corridos desde la venta, como la planilla
  (se cambia en la tabla `parametros`).
- La numeración de pedidos sigue la de la planilla (arranca en 542).

## Puesta en marcha (una sola vez)

### 1. Base de datos (Supabase)
1. En el proyecto `spazio-gestion` de Supabase, abrí **SQL Editor → New query**.
2. Pegá todo el contenido de `supabase/migrations/0001_inicial.sql` y tocá **Run**.
3. Abrí `supabase/seed_equipo.sql`, reemplazá los emails de ejemplo por los reales
   de Agui, Tete y Fede, pegalo en una nueva consulta y tocá **Run**.

### 2. Email de ingreso (Supabase)
En **Authentication → Emails → Templates → Magic Link**, reemplazá el contenido por:

```html
<h2>Ingresar a Spazio · Gestión</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Tocá acá para entrar</a></p>
<p>O escribí este código en la app: <strong>{{ .Token }}</strong></p>
```

Así el link funciona aunque se abra desde la app de Gmail, y el código sirve
cuando la app está instalada en la pantalla de inicio del celular.

**Envío de emails:** el correo que trae Supabase de fábrica solo manda emails a
los miembros de la organización de Supabase y unos pocos por hora. Para que les
llegue a los cuatro sin límite, conectá un servicio de email:
1. Creá una cuenta gratis en resend.com y verificá el dominio `spaziodesign.net`
   (te da unos registros DNS para cargar donde administran el dominio).
2. En Resend, creá una **API key**.
3. En Supabase → **Authentication → Emails → SMTP Settings**, activá *Custom SMTP*:
   host `smtp.resend.com`, puerto `465`, usuario `resend`, contraseña = la API key,
   remitente `gestion@spaziodesign.net`, nombre `Spazio Gestión`.

### 3. Publicar (Vercel)
1. En Vercel: **Add New → Project** → importá el repositorio `spazio-gestion`.
2. Antes de **Deploy**, en **Environment Variables** cargá
   `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (están en Supabase → **Project Settings → API**). También se pueden cargar
   solas con la integración de Supabase en Vercel.
3. Tocá **Deploy** y copiá la dirección que te da (por ejemplo `spazio-gestion.vercel.app`).

### 4. Dirección de la app (Supabase)
En **Authentication → URL Configuration**:
- **Site URL**: la dirección de Vercel.
- **Redirect URLs**: agregá `https://TU-DIRECCION/**`.

### 5. En el celular
Abrí la dirección en Safari o Chrome → **Compartir → Agregar a inicio**.
Queda como una app más.

## Para desarrollar

```bash
npm install
cp .env.example .env.local   # completar con los datos de Supabase
npm run dev
npm test                     # pruebas de fechas y montos
```

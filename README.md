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
- Fecha límite automática: 49 días corridos desde la venta, como la planilla
  (se cambia en la tabla `parametros`).
- La numeración de pedidos sigue la de la planilla (arranca en 542).

## Migraciones (ejecutar en orden en Supabase → SQL Editor)

1. `supabase/migrations/0001_inicial.sql` — base, pedidos, clientes, pagos, archivos
2. `supabase/migrations/0002_proveedores.sql` — proveedores y pedidos a proveedor
3. `supabase/migrations/0003_pedidos_stock.sql` — pedidos para stock
4. `supabase/migrations/0004_monto_proveedores.sql` — precio de los pedidos a proveedor
5. `supabase/migrations/0005_tareas_objetivos_visitas.sql` — tareas, objetivos, showroom
6. `supabase/migrations/0006_avisos_y_automatismos.sql` — avisos y tareas automáticas por etapa
7. `supabase/migrations/0007_planilla.sql` — registro de lo escrito en la planilla de ventas
8. `supabase/migrations/0008_tiendanube.sql` — ventas de Tienda Nube que entran solas
9. `supabase/migrations/0009_etapas_y_entregas.sql` — sin la etapa "Pedido a fábrica" y entregas con horario
10. `supabase/migrations/0010_asistente_ia.sql` — claves para conectar Claude o ChatGPT
11. `supabase/migrations/0011_planilla_original.sql` — trae cada 15 minutos las ventas cargadas en la planilla original
12. `supabase/migrations/0012_sin_cliente_avisado.sql` — sin la etapa "Cliente avisado"
13. `supabase/migrations/0013_cotizador_costos.sql` — cotizador: insumos, precios con historial, rol "vendedor"
14. `supabase/importaciones/2026-10_listas_cotizador.sql` — carga las listas de Vidpro (15/10) y STG (19/10)
15. `supabase/migrations/0014_cotizador_productos.sql` — cotizador: productos, recetas con versiones y márgenes
16. `supabase/migrations/0015_cotizador_presupuestos.sql` — cotizador: presupuestos con la foto del cálculo
17. `supabase/migrations/0016_etapa_embalada.sql` — etapa "Embalada"; "Lista" pasa a llamarse "Fabricada"
18. `supabase/migrations/0017_avisos_reportes_recordatorios.sql` — reportes de la mañana y de la tarde y recordatorios antes de entregas y visitas (pg_cron cada minuto)
19. `supabase/migrations/0018_notificaciones_celular.sql` — notificaciones en el celular (Web Push)
20. `supabase/migrations/0019_tareas_con_hora.sql` — tareas con hora: van al calendario y avisan 30 minutos antes
21. `supabase/migrations/0027_gift_cards.sql` — gift cards: página pública de compra, emisión con código, saldo y canjes

## Variables en Vercel (Settings → Environment Variables)

| Variable | Tipo | Para qué |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Config | Dirección de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Config | Clave pública de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | Proceso diario (lee los datos de todo el equipo) |
| `CRON_SECRET` | **Secret** | Protege el proceso diario |
| `RESEND_API_KEY` | **Secret** | Envío de emails |
| `EMAIL_REMITENTE` | Config | Opcional, p. ej. `Spazio Gestión <gestion@spaziodesign.net>` |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` | **Secret** | Más adelante, para avisos por WhatsApp |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | **Secret** | Contenido completo del .json de la cuenta de servicio de Google |
| `PLANILLA_DESTINO_ID` | Opcional | Solo si los pedidos se tienen que escribir en otra planilla. Sin esto se escriben en Plantilla_Spazio_2026 (la original). `PLANILLA_ID` ya no se usa |
| `TIENDANUBE_APP_ID` | Config | ID de la app creada en el portal de socios de Tienda Nube |
| `TIENDANUBE_CLIENT_SECRET` | **Secret** | Secreto de esa app (también firma los avisos de ventas) |
| `WHATSAPP_PLANTILLA_RESUMEN` | Config | Nombre de la plantilla aprobada (por defecto `resumen_diario`) |

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

## Ventas de Tienda Nube

1. En partners.tiendanube.com, creá una app (para uso propio) con:
   - URL de redirección: `https://spazio-gestion.vercel.app/api/tiendanube/callback`
   - Permisos: **Orders (lectura)** y **Customers (lectura)**
   - Las URLs obligatorias de datos personales pueden apuntar a `https://spazio-gestion.vercel.app/api/tiendanube/webhook`
2. Cargá `TIENDANUBE_APP_ID` y `TIENDANUBE_CLIENT_SECRET` en Vercel y hacé Redeploy.
3. Corré la migración 0008.
4. En la app: **Ajustes → Tienda Nube → Conectar con Tienda Nube** y aceptá en la tienda.

Desde ese momento, cada venta pagada crea un pedido (canal Tienda Nube, sin vendedor) y se
escribe en la planilla. Si la venta ya estaba cargada a mano (mismo email o teléfono, canal
Tienda Nube, ±4 días), se une a ese pedido. El proceso diario repasa los últimos 3 días por si
algún aviso no llegó. Si una venta se cancela en la tienda, avisa al equipo pero no cancela solo.

## Asistente de IA (Claude o ChatGPT)

La app funciona como conector MCP en `https://spazio-gestion.vercel.app/api/mcp/<clave>`.
Cada persona crea su clave en **Ajustes → Asistente de IA** y la agrega en Claude
(Configuración → Conectores → Agregar conector personalizado). Herramientas: resumen del día,
buscar y ver pedidos, calendario, tareas, reporte de ventas, crear y completar tareas, cambiar
etapa, agendar entrega, registrar pago y agregar notas. Los cambios quedan en el historial como
"Nombre (con IA)". Las claves se pueden revocar desde Ajustes.

## Cotizador (fase 1: costos)

El motor de cálculo está en `lib/cotizador/` y no depende de la base ni de las pantallas:
`motor.ts` recibe una receta, el catálogo de costos, las medidas y las opciones, y devuelve
piezas, costos y precio. Las fórmulas de las recetas (`H - espesor / 10`, `si(L > 160, 3, 2)`)
las evalúa `formula.ts`, un intérprete propio que nunca ejecuta código.

- **Precios del cotizador** (Ajustes → Cotizador, o `/cotizador/admin`): grilla de precios de
  Vidpro y STG editable, colores con su columna de precio, aumento por proveedor y reglas
  generales (recargo en cuotas, redondeo, ajuste de Vidpro, tope de descuento, validez).
- Cambiar un precio nunca lo pisa: cierra la tarifa vigente y abre una nueva (`cot_tarifas`).
- **Quién ve costos:** los admin y los roles con el permiso `cotizador.costos` (tabla `permisos`;
  hoy, "equipo"). Para que alguien cotice sin ver costos, ponele el rol **Vendedor** en Ajustes → Equipo.
- **Productos y recetas** (`/cotizador/admin/productos`): cada producto tiene un borrador que se
  edita con un probador en vivo, y versiones publicadas que no cambian. Solo se cotiza la publicada.
  El margen de cada producto se cambia en cualquier momento, sin publicar.
- **Presupuestos** (`/cotizador`): cliente → producto → medidas → opciones → precio en vivo →
  descuento → guardar. Texto para WhatsApp, estados, duplicar y editar (recalcula con los precios de
  hoy). El precio siempre lo calcula el servidor (`lib/cotizador/servicio.ts`, con la clave de
  servicio) y al vendedor solo le llega el precio de venta. Cada ítem guarda la foto del cálculo
  (`cot_presupuesto_calculos`), que solo ven quienes tienen permiso de costos. Un descuento por
  encima del tope necesita aprobación de un admin antes de enviarse. El proceso diario pasa a
  "Vencido" lo enviado cuya validez ya pasó.
- Para cargar una lista nueva de Vidpro desde su Excel: `python3 scripts/cotizador/generar_listas.py
  lista.xlsx salida.sql` genera el SQL (solo agrega lo que falta; los cambios de precio se hacen en el panel).

## Para desarrollar

```bash
npm install
cp .env.example .env.local   # completar con los datos de Supabase
npm run dev
npm test                     # pruebas de fechas y montos
```

## Gift cards

1. Corré la migración `0027_gift_cards.sql` en Supabase → SQL Editor.
2. En la app: **Gift cards → Datos de pago**, cargá alias, CBU, titular y el WhatsApp de Spazio.
3. La página pública es `https://spazio-gestion.vercel.app/gift-card` (el botón de Tienda Nube apunta ahí).
   El saldo se consulta en `/gift-card/saldo`.

Circuito: el cliente pide la tarjeta → aviso al equipo → desde **Gift cards** se le mandan los datos para
transferir por WhatsApp → cuando la transferencia está acreditada en el home banking, un admin la confirma y se
emite el código `SPZ-XXXX-XXXX` (se ve una sola vez; se guarda cifrado). Si hay `RESEND_API_KEY`, le llega
el correo a quien la recibe y el aviso a quien compró; por WhatsApp se manda con el botón (mensaje ya escrito).
Vence el mismo día 3 meses después (o el último día del mes) y se puede prorrogar 30 días una vez.
Para usarla, en **Gift cards → Usar saldo** se descuenta con el código y el número de pedido.

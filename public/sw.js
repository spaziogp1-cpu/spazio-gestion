// Service worker de Spazio Gestión: muestra las notificaciones y abre el aviso al tocarlas.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { titulo: e.data ? e.data.text() : '' };
  }
  const titulo = d.titulo || 'Spazio';
  e.waitUntil(
    self.registration.showNotification(titulo, {
      body: d.cuerpo || '',
      icon: '/icon-192.png',
      tag: d.tag || undefined,
      renotify: Boolean(d.tag),
      data: { url: d.url || '/avisos' },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/avisos', self.location.origin).href;
  e.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const v of ventanas) {
        if (new URL(v.url).origin === self.location.origin && 'focus' in v) {
          await v.focus();
          if ('navigate' in v) return v.navigate(url);
          return;
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});

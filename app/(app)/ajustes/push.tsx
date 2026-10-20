'use client';

import { useEffect, useState, useTransition } from 'react';
import { clavePublicaPush, guardarSuscripcion, mandarmePrueba, quitarSuscripcion } from './push-actions';

type Estado = 'cargando' | 'no-soportado' | 'instalar-ios' | 'bloqueado' | 'activo' | 'inactivo';

const deB64url = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const aB64url = (buf: ArrayBuffer | null) =>
  buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '';

function nombreDispositivo() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Navegador';
}

export function NotificacionesCelular() {
  const [estado, setEstado] = useState<Estado>('cargando');
  const [msj, setMsj] = useState<{ ok?: string; error?: string }>({});
  const [pendiente, iniciar] = useTransition();

  useEffect(() => {
    (async () => {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const instalada = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setEstado(ios && !instalada ? 'instalar-ios' : 'no-soportado');
        return;
      }
      if (Notification.permission === 'denied') return setEstado('bloqueado');
      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.getSubscription();
      setEstado(sub && Notification.permission === 'granted' ? 'activo' : 'inactivo');
    })().catch(() => setEstado('no-soportado'));
  }, []);

  const activar = () =>
    iniciar(async () => {
      setMsj({});
      try {
        const permiso = await Notification.requestPermission();
        if (permiso !== 'granted') {
          setEstado(permiso === 'denied' ? 'bloqueado' : 'inactivo');
          return;
        }
        const { clave, error } = await clavePublicaPush();
        if (!clave) return setMsj({ error: error ?? 'No se pudo obtener la clave.' });
        const reg = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        // Si estaba suscripto con otra clave, se renueva.
        if (sub && aB64url(sub.options.applicationServerKey) !== clave) {
          await sub.unsubscribe();
          sub = null;
        }
        sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deB64url(clave) });
        const r = await guardarSuscripcion({ endpoint: sub.endpoint, p256dh: aB64url(sub.getKey('p256dh')), auth: aB64url(sub.getKey('auth')) }, nombreDispositivo());
        setMsj(r);
        if (r.ok) setEstado('activo');
      } catch (e) {
        setMsj({ error: e instanceof Error ? e.message : String(e) });
      }
    });

  const desactivar = () =>
    iniciar(async () => {
      setMsj({});
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await quitarSuscripcion(sub.endpoint);
        await sub.unsubscribe();
      }
      setEstado('inactivo');
    });

  const probar = () =>
    iniciar(async () => {
      setMsj({});
      setMsj(await mandarmePrueba());
    });

  return (
    <div className="form-bloque">
      {estado === 'cargando' && <p className="small quiet">Revisando este dispositivo…</p>}
      {estado === 'instalar-ios' && (
        <p className="small">
          En iPhone primero hay que instalar la app: en Safari tocá <strong>Compartir</strong> → <strong>Agregar a inicio</strong>, abrila desde el ícono y volvé a esta
          pantalla.
        </p>
      )}
      {estado === 'no-soportado' && <p className="small">Este navegador no permite notificaciones. Probá con Chrome, o en iPhone con la app instalada en la pantalla de inicio.</p>}
      {estado === 'bloqueado' && (
        <p className="small">
          Las notificaciones están bloqueadas para Spazio en este dispositivo. Habilitalas en los ajustes del navegador (o del celular → Notificaciones → Spazio) y volvé
          a intentar.
        </p>
      )}
      {estado === 'inactivo' && (
        <div>
          <button type="button" className="btn btn-primario btn-chico" disabled={pendiente} onClick={activar}>
            {pendiente ? 'Activando…' : 'Activar notificaciones en este dispositivo'}
          </button>
        </div>
      )}
      {estado === 'activo' && (
        <>
          <p className="small">✓ Activadas en este dispositivo: te llegan los reportes, los recordatorios y los demás avisos aunque no tengas la app abierta.</p>
          <div className="acciones">
            <button type="button" className="btn btn-chico" disabled={pendiente} onClick={probar}>
              Mandarme una prueba
            </button>
            <button type="button" className="btn btn-fantasma btn-chico" disabled={pendiente} onClick={desactivar}>
              Desactivar
            </button>
          </div>
        </>
      )}
      {msj.ok && <p className="aviso aviso-ok">{msj.ok}</p>}
      {msj.error && <p className="error-form">{msj.error}</p>}
    </div>
  );
}

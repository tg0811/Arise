import { api, type AppState } from './api';

// Web Push on this device. Needs a secure context (HTTPS, or localhost for testing),
// a service worker, and the user's permission.

export type PushStatus = 'unsupported' | 'insecure' | 'blocked' | 'off' | 'on';

export async function pushStatus(): Promise<PushStatus> {
  if (!window.isSecureContext) return 'insecure';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

function base64UrlToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Ask permission, subscribe this device, and register it with the server. */
export async function enablePush(): Promise<AppState> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were not allowed');
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api<{ publicKey: string }>('GET', '/push/key');
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) }));
  return api('POST', '/push/subscribe', sub.toJSON());
}

export async function disablePush(): Promise<AppState> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return api('GET', '/state');
  await sub.unsubscribe();
  return api('POST', '/push/unsubscribe', { endpoint: sub.endpoint });
}

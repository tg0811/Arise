import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { api, type AppState } from './api';

// Passkeys (WebAuthn): the phone's fingerprint/face/screen lock proves it's you. The private key never leaves
// the device; the server only keeps the public key. See backend/src/lock.ts.

/** The id of *this* device's passkey, so the lock screen can prompt for it straight away. */
const DEVICE_KEY = 'arise-passkey';

export const passkeysSupported = () => browserSupportsWebAuthn();

export function devicePasskeyId(): string | null {
  try { return localStorage.getItem(DEVICE_KEY); } catch { return null; }
}
export const deviceHasPasskey = () => devicePasskeyId() !== null;
function markDevice(id: string | null) {
  try { id ? localStorage.setItem(DEVICE_KEY, id) : localStorage.removeItem(DEVICE_KEY); } catch { /* private mode */ }
}

/** A readable name for this device, shown in Settings next to its passkey. */
function deviceName(): string {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'Android phone';
  if (/iPhone|iPad/i.test(ua)) return 'iPhone / iPad';
  if (/Mac/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows PC';
  if (/Linux/i.test(ua)) return 'Linux computer';
  return 'This device';
}

/** Turn a WebAuthn error into something a person can act on. */
function friendly(e: unknown): Error {
  const err = e as Error;
  if (err?.name === 'NotAllowedError') return new Error('Cancelled or timed out');
  if (err?.name === 'InvalidStateError') return new Error('This device already has a passkey for Arise');
  return err instanceof Error ? err : new Error(String(e));
}

export async function setUpPasskey(): Promise<AppState> {
  const optionsJSON = await api<any>('POST', '/passkeys/options');
  let response;
  try { response = await startRegistration({ optionsJSON }); } catch (e) { throw friendly(e); }
  const state = await api<AppState>('POST', '/passkeys', { response, name: deviceName() });
  markDevice(response.id);
  return state;
}

/** Unlock the app (or, with purpose 'private', also reveal private items) with this device's passkey. */
export async function unlockWithPasskey(purpose: 'app' | 'private' = 'app') {
  const optionsJSON = await api<any>('POST', '/lock/passkey/options');
  let response;
  try { response = await startAuthentication({ optionsJSON }); } catch (e) { throw friendly(e); }
  await api('POST', '/lock/passkey/verify', { response, purpose });
  markDevice(response.id); // whichever passkey answered lives on this device
}

export const forgetDevicePasskey = () => markDevice(null);

import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { App as NativeApp } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { auth } from './firebase';

const endpoint = 'https://notify-api.nalaro.digital';
let deviceToken = '';
let installed = false;
let generation = 0;
const CHANNEL_ID = 'nalaro_alerts_v2';
const CHANNEL_SOUND = 'nalaro_signal.wav';
type Listener = { remove(): Promise<void> };
async function callNotify(path: string, method = 'GET', data?: object) {
  const user = auth.currentUser;
  if (!user) throw new Error('Login admin diperlukan.');
  let response: Response;
  try { response = await fetch(endpoint + path, {
    method, cache: 'no-store', signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: 'Bearer ' + await user.getIdToken(),
      ...(data ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  }); } catch (error) {
    const detail = error instanceof Error ? error.name + ': ' + error.message : 'unknown';
    throw new Error('Tidak bisa terhubung ke Notify API (' + new URL(endpoint).host + ') dari ' +
      window.location.origin + '. Periksa jaringan/CORS. ' + detail.slice(0,150));
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Notification API HTTP ' + response.status);
  return result;
}
export type NotificationTestResult = { ok:boolean; sent:number; attempted?:number; status:'accepted'|'cooldown'|'no_devices'|'rejected'|'duplicate'; retryAfterSeconds?:number; errors?:{http:number;code:string;message:string}[] };
export const getNotificationStatus = async () => callNotify('/status') as Promise<{devices:number;state?:{last_error?:string;last_poll?:string;last_push_error?:string}}>;
export const sendTestNotification = async () => callNotify('/test','POST') as Promise<NotificationTestResult>;
export const runNotificationScan = async () => callNotify('/scan','POST');
export async function enableNotifications() {
  if (!Capacitor.isNativePlatform()) throw new Error('Hanya tersedia di Android.');
  let p = await PushNotifications.checkPermissions();
  if (p.receive !== 'granted') p = await PushNotifications.requestPermissions();
  if (p.receive !== 'granted') throw new Error('Aktifkan izin notifikasi di pengaturan Android.');
  await PushNotifications.createChannel({
    id: CHANNEL_ID, name: 'Nalaro Alerts',
    description: 'Email dan order dari Nalaro Project Desk',
    importance: 5, visibility: 1, sound: CHANNEL_SOUND
  });
  await PushNotifications.register();
}
export async function revokeNotificationToken() {
  if (!deviceToken || !auth.currentUser) return;
  try { await callNotify('/unregister', 'POST', { token: deviceToken }); }
  catch (error) { console.warn('Notifikasi belum dicabut dari server', error); }
  deviceToken = '';
}
export async function attachNotifications(navigate: (path: string) => void) {
  if (!Capacitor.isNativePlatform() || installed) return () => {};
  installed = true;
  const handles: Listener[] = [];
  const scope = ++generation;
  const active = () => installed && generation === scope;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let retryCount = 0;
  let pendingToken = '';
  const registerToken = async (value: string): Promise<void> => {
    if (!active() || !value) return;
    pendingToken = value;
    try {
      await callNotify('/register', 'POST', { token: value });
      if (!active()) return;
      deviceToken = value;
      retryCount = 0;
      if (retry) clearTimeout(retry);
      window.dispatchEvent(new Event('nalaro-notification-registered'));
    } catch (error) {
      if (!active()) return;
      const wait = Math.min(60000, 1500 * 2 ** Math.min(retryCount++, 6));
      if (retry) clearTimeout(retry);
      retry = setTimeout(() => { if (active()) void registerToken(pendingToken); }, wait);
      window.dispatchEvent(new CustomEvent('nalaro-notification-failed', {
        detail: { stage: 'worker-register', message: error instanceof Error ? error.message : String(error) }
      }));
    }
  };
  try {
    handles.push(await PushNotifications.addListener('registration', ({ value }) => {
      void registerToken(value);
    }));
    handles.push(await PushNotifications.addListener('registrationError', error => {
      console.error('Android FCM error', error);
      window.dispatchEvent(new CustomEvent('nalaro-notification-failed', {
        detail: { stage: 'firebase-native', message: String(error.error || JSON.stringify(error)).slice(0,220) }
      }));
    }));
    handles.push(await PushNotifications.addListener('pushNotificationReceived', () => {
      window.dispatchEvent(new Event('nalaro-push-received'));
    }));
    handles.push(await PushNotifications.addListener('pushNotificationActionPerformed', action => {
      const kind = String(action.notification?.data?.type || '');
      navigate(kind === 'mail' ? '/email' : kind === 'order' ? '/projects' : '/');
    }));
    handles.push(await NativeApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      window.dispatchEvent(new Event('nalaro-push-received'));
      if (pendingToken && !deviceToken) void registerToken(pendingToken);
      void PushNotifications.checkPermissions().then(p => {
        if (p.receive === 'granted') void enableNotifications().catch(console.warn);
      });
    }));
    handles.push(await Network.addListener('networkStatusChange', ({ connected }) => {
      if (connected && pendingToken && !deviceToken) void registerToken(pendingToken);
    }));
    if ((await PushNotifications.checkPermissions()).receive === 'granted') await enableNotifications();
    return () => {
      installed = false;
      generation++;
      if (retry) clearTimeout(retry);
      void Promise.all(handles.map(h => h.remove()));
    };
  } catch (error) {
    installed = false;
    generation++;
    if (retry) clearTimeout(retry);
    await Promise.all(handles.map(h => h.remove()));
    console.warn('FCM inisialisasi ditunda', error);
    return () => {};
  }
}

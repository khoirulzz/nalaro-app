import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { auth } from './firebase';

const endpoint = 'https://notify-api.nalaro.digital';
let deviceToken = '';
let installed = false;
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
export const getNotificationStatus = async () => callNotify('/status') as Promise<{devices:number;state?:{last_error?:string;last_poll?:string}}>;
export const sendTestNotification = async () => callNotify('/test','POST') as Promise<{ok:boolean;sent:number}>;
export const runNotificationScan = async () => callNotify('/scan','POST');
export async function enableNotifications() {
  if (!Capacitor.isNativePlatform()) throw new Error('Hanya tersedia di Android.');
  let p = await PushNotifications.checkPermissions();
  if (p.receive !== 'granted') p = await PushNotifications.requestPermissions();
  if (p.receive !== 'granted') throw new Error('Aktifkan izin notifikasi di pengaturan Android.');
  await PushNotifications.createChannel({
    id: 'nalaro_updates', name: 'Nalaro Updates',
    description: 'Email, order dan aktivitas Nalaro',
    importance: 5, visibility: 1, sound: 'default'
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
  try {
    handles.push(await PushNotifications.addListener('registration', ({ value }) => {
      void callNotify('/register', 'POST', { token: value }).then(() => {
        deviceToken = value;
        window.dispatchEvent(new Event('nalaro-notification-registered'));
      }).catch(error => {
        console.error('Pendaftaran token FCM ke Cloudflare gagal', error);
        window.dispatchEvent(new CustomEvent('nalaro-notification-failed', {
          detail: { stage: 'worker-register', message: error instanceof Error ? error.message : String(error) }
        }));
      });
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
    if ((await PushNotifications.checkPermissions()).receive === 'granted') await enableNotifications();
    return () => { installed = false; void Promise.all(handles.map(h => h.remove())); };
  } catch (error) {
    installed = false;
    await Promise.all(handles.map(h => h.remove()));
    console.warn('FCM inisialisasi ditunda', error);
    return () => {};
  }
}

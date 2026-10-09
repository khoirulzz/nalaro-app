import React, { Suspense, lazy, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { auth } from '../../lib/firebase';
import { ADMIN_EMAIL } from '../../lib/admin';

const Login = lazy(() => import('./Login'));
const AdminApp = lazy(() => import('./AdminApp'));
type EntryState = 'checking' | 'login' | 'admin' | 'error';

/** Native loads one local document and swaps screens as Firebase Auth changes. */
export default function NativeEntry() {
  const [state, setState] = useState<EntryState>('checking');

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setState((previous) => previous === 'checking' ? 'error' : previous);
    }, 15000);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      window.clearTimeout(timeout);
      if (user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        setState('admin');
      } else if (user) {
        void signOut(auth).then(() => setState('login')).catch((error) => {
          console.error('Unable to clear unauthorized Firebase session', error);
          setState('error');
        });
      } else {
        setState('login');
      }
    }, (error) => {
      window.clearTimeout(timeout);
      console.error('Firebase auth-state initialization failed', error);
      setState('error');
    });
    return () => { window.clearTimeout(timeout); unsubscribe(); };
  }, []);

  useEffect(() => {
    if (state === 'checking') return;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void StatusBar.setBackgroundColor({ color: '#0d0e0c' }).catch(console.error);
        void StatusBar.setStyle({ style: Style.Dark }).catch(console.error);
        void SplashScreen.hide().catch(console.error);
        void CapacitorUpdater.notifyAppReady().catch(console.error);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [state]);

  return <Suspense fallback={<div className="admin-boot">Memuat Nalaro Project Desk…</div>}>
    {state === 'checking' ? (
      <div className="admin-boot">Memeriksa sesi Nalaro…</div>
    ) : state === 'error' ? (
      <main className="auth-shell">
        <section className="auth-panel" style={{justifyContent:'center', gap:'16px'}}>
          <h1>Verifikasi sesi belum berhasil</h1>
          <p>Periksa koneksi internet dan coba ulang. Data proyek tetap tersimpan di Firebase.</p>
          <button className="primary-button" onClick={() => window.location.reload()}>Coba lagi ↗</button>
        </section>
      </main>
    ) : state === 'admin' ? <AdminApp /> : <Login />}
  </Suspense>;
}

import React, { Suspense, lazy, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { auth } from '../../lib/firebase';
import { ADMIN_EMAIL } from '../../lib/admin';

const Login = lazy(() => import('./Login'));
const AdminApp = lazy(() => import('./AdminApp'));
type EntryState = 'checking' | 'login' | 'admin';

/** Native loads one document and switches views when Firebase Auth state changes. */
export default function NativeEntry() {
  const [state, setState] = useState<EntryState>('checking');
  useEffect(() => onAuthStateChanged(auth, user => {
    if (user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) setState('admin');
    else if (user) void signOut(auth).finally(() => setState('login'));
    else setState('login');
  }), []);
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
    {state === 'checking' ? <div className="admin-boot">Memeriksa sesi Nalaro…</div> :
      state === 'admin' ? <AdminApp /> : <Login />}
  </Suspense>;
}

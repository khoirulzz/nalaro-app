import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { ADMIN_EMAIL } from '../../lib/admin';

const isAdmin = (email?: string | null) => email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

function authErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '') : '';
  if (code === 'auth/network-request-failed') return 'Tidak dapat terhubung ke Firebase. Periksa internet dan coba lagi.';
  if (code === 'auth/too-many-requests') return 'Terlalu banyak percobaan masuk. Tunggu sebentar sebelum mencoba lagi.';
  if (code === 'auth/invalid-api-key' || code === 'auth/app-not-authorized') return 'Konfigurasi Firebase belum diizinkan untuk aplikasi ini.';
  if (code === 'auth/operation-not-allowed') return 'Metode login email dan password belum diaktifkan pada Firebase.';
  if (code === 'unauthorized') return 'Akun ini tidak memiliki akses admin Nalaro.';
  return 'Login gagal. Periksa email dan password, lalu coba lagi.';
}

export default function Login() {
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // The Android app has a single top-level auth subscriber in NativeEntry.
  // A nested "else" previously signed out VALID admins on Android.
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    return onAuthStateChanged(auth, (user) => {
      if (isAdmin(user?.email)) window.location.replace('/admin');
    });
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      if (!isAdmin(credential.user.email)) {
        await signOut(auth);
        throw new Error('unauthorized');
      }
      // NativeEntry switches to AdminApp on onAuthStateChanged.
      // Do not navigate or sign out an authorized user on Android.
      if (!Capacitor.isNativePlatform()) window.location.replace('/admin');
    } catch (error) {
      console.error('Firebase sign-in failed', error);
      setError(authErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="auth-brand-row">
          <a href="https://nalaro.digital" target="_blank" rel="noopener noreferrer" className="admin-brand"><img src="/brand/nalaro.png" alt="" /><span>nalaro</span></a>
          <span className="auth-tag"><i /> INTERNAL</span>
        </div>
        <div className="auth-copy">
          <p>PROJECT DESK / 2026</p>
          <h1>Kelola proyek.<br/><span>Tanpa berantakan.</span></h1>
          <p className="auth-description">Area internal untuk proyek, invoice, pembayaran, receipt, dan arsip Nalaro.</p>
        </div>
        <form onSubmit={submit} className="auth-form">
          <label><span>Email admin</span><input autoComplete="username" type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label>
          <label><span>Password</span><input autoComplete="current-password" type="password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="••••••••••••" /></label>
          {error && <p className="auth-error" role="alert"><i />{error}</p>}
          <button className="primary-button auth-submit" disabled={loading} type="submit">{loading ? 'Memverifikasi…' : 'Masuk ke Project Desk'} <span>↗</span></button>
        </form>
        <footer><span>order.nalaro.digital</span><a href="https://nalaro.digital" target="_blank" rel="noopener noreferrer">Kembali ke Nalaro ↗</a></footer>
      </section>
      <aside className="auth-aside" aria-hidden="true"><span>01</span><div><small>NALARO SYSTEM</small><strong>CLIENT<br/>PROJECT<br/><em>INVOICE</em><br/>RECEIPT.</strong></div><p>Useful systems for useful work.</p></aside>
    </main>
  );
}

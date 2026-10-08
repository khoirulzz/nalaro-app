import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';

import { ADMIN_EMAIL } from '../../lib/admin';

export default function Login() {
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      if (user.email === ADMIN_EMAIL) if (!Capacitor.isNativePlatform()) window.location.replace('/admin');
      else await signOut(auth);
    });
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      if (credential.user.email !== ADMIN_EMAIL) {
        await signOut(auth);
        throw new Error('unauthorized');
      }
      if (!Capacitor.isNativePlatform()) window.location.replace('/admin');
    } catch {
      setError('Akses ditolak. Periksa email dan password admin.');
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="auth-brand-row">
          <a href="https://nalaro.digital" className="admin-brand"><img src="/brand/nalaro.png" alt="" /><span>nalaro</span></a>
          <span className="auth-tag"><i /> INTERNAL</span>
        </div>
        <div className="auth-copy">
          <p>PROJECT DESK / 2026</p>
          <h1>Kelola proyek.<br/><span>Tanpa berantakan.</span></h1>
          <p className="auth-description">Area internal untuk proyek, invoice, pembayaran, receipt, dan arsip Nalaro.</p>
        </div>
        <form onSubmit={submit} className="auth-form">
          <label><span>Email admin</span><input autoComplete="username" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required /></label>
          <label><span>Password</span><input autoComplete="current-password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required placeholder="••••••••••••" /></label>
          {error && <p className="auth-error"><i />{error}</p>}
          <button className="primary-button auth-submit" disabled={loading}>{loading ? 'Memverifikasi…' : 'Masuk ke Project Desk'} <span>↗</span></button>
        </form>
        <footer><span>order.nalaro.digital</span><a href="https://nalaro.digital">Kembali ke Nalaro ↗</a></footer>
      </section>
      <aside className="auth-aside" aria-hidden="true"><span>01</span><div><small>NALARO SYSTEM</small><strong>CLIENT<br/>PROJECT<br/><em>INVOICE</em><br/>RECEIPT.</strong></div><p>Useful systems for useful work.</p></aside>
    </main>
  );
}

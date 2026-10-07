import React, { useRef, useState } from 'react';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { EMPTY_ORDER, SERVICE_TYPES, localDate, orderRecords } from '../../lib/order';

export default function OrderForm() {
  const [form, setForm] = useState({ ...EMPTY_ORDER });
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');
  const [reference, setReference] = useState('');
  const sending = useRef(false);
  const honeypot = useRef<HTMLInputElement>(null);
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending.current || honeypot.current?.value) return;
    sending.current = true;
    setState('sending');
    setError('');
    try {
      if (!navigator.onLine) throw new Error('Kamu sedang offline. Hubungkan internet untuk mengirim order.');
      const id = crypto.randomUUID().replaceAll('-', '');
      const records = orderRecords(form, id, serverTimestamp(), localDate());
      const batch = writeBatch(db);
      batch.set(doc(db, 'clients', id), records.client);
      batch.set(doc(db, 'projects', id), records.project);
      await batch.commit();
      setReference(records.project.projectNumber);
      setState('sent');
      setForm({ ...EMPTY_ORDER });
    } catch (cause) {
      const code = (cause as { code?: string })?.code;
      setError(code === 'permission-denied'
        ? 'Form belum dapat menerima order. Hubungi Nalaro atau coba lagi nanti.'
        : code ? 'Order belum berhasil dikirim. Periksa koneksi lalu coba kembali.'
        : cause instanceof Error ? cause.message : 'Order belum berhasil dikirim. Silakan coba kembali.');
      setState('error');
    } finally { sending.current = false; }
  };

  return (
    <section className="order-shell">
      <div className="order-kicker"><span><i className="signal" /> NALARO / PROJECT REQUEST</span><span>01 — MULAI PROYEK</span></div>
      <div className="order-layout">
        <header className="order-intro">
          <h1>Proyek baru,<br /><em>mulai di sini.</em></h1>
          <p>Kenalkan diri dan proyekmu. Kami akan menghubungi kamu untuk membahas kebutuhan dan langkah berikutnya.</p>
          <div className="order-note"><span>↳</span><p>Cukup isi informasi klien dan proyek. Rincian pekerjaan serta biaya dibahas bersama setelahnya.</p></div>
        </header>
        {state === 'sent' ? (
          <div className="order-success" role="status" aria-live="polite">
            <span className="order-section-number">✓ / ORDER DITERIMA</span>
            <h2>Terima kasih.<br />Kita lanjut ngobrol.</h2>
            <p>Informasi klien dan proyekmu sudah tersimpan. Tim Nalaro akan menghubungi melalui kontak yang kamu isi.</p>
            <div className="order-reference"><small>Nomor proyek</small><strong>{reference}</strong></div>
            <button className="button button-primary" onClick={() => setState('idle')}>Kirim proyek lain <span>↗</span></button>
          </div>
        ) : (
          <form className="order-form" onSubmit={submit} aria-busy={state === 'sending'}>
            <fieldset disabled={state === 'sending'}>
              <legend><span>01</span> Informasi klien</legend>
              <div className="order-fields">
                <label className="wide"><span>Nama klien / usaha / instansi *</span><input required maxLength={120} autoComplete="organization" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Nama kamu atau organisasi" /></label>
                <label className="wide"><span>Nama penanggung jawab *</span><input required maxLength={120} autoComplete="name" value={form.picName} onChange={(e) => update('picName', e.target.value)} placeholder="Orang yang bisa kami hubungi" /></label>
                <label><span>Email *</span><input required type="email" maxLength={254} autoComplete="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="nama@contoh.com" /></label>
                <label><span>WhatsApp *</span><input required type="tel" pattern={'[+0-9 \\(\\)\\-]{8,24}'} minLength={8} maxLength={24} autoComplete="tel" value={form.whatsapp} onChange={(e) => update('whatsapp', e.target.value)} placeholder="08… atau +62…" /></label>
                <label className="wide"><span>Alamat <small>opsional</small></span><textarea rows={2} maxLength={500} autoComplete="street-address" value={form.address} onChange={(e) => update('address', e.target.value)} placeholder="Alamat klien atau instansi" /></label>
              </div>
            </fieldset>
            <fieldset disabled={state === 'sending'}>
              <legend><span>02</span> Informasi proyek</legend>
              <div className="order-fields">
                <label className="wide"><span>Nama proyek *</span><input required maxLength={160} value={form.projectName} onChange={(e) => update('projectName', e.target.value)} placeholder="Contoh: Website profil usaha" /></label>
                <label><span>Jenis layanan *</span><select required value={form.serviceType} onChange={(e) => update('serviceType', e.target.value)}>{SERVICE_TYPES.map((service) => <option key={service}>{service}</option>)}</select></label>
                <label><span>Target selesai <small>opsional</small></span><input type="date" min={localDate()} value={form.deadline} onChange={(e) => update('deadline', e.target.value)} /></label>
              </div>
            </fieldset>
            <div className="order-trap" aria-hidden="true"><label>Website pribadi<input ref={honeypot} tabIndex={-1} autoComplete="off" name="personal_website" /></label></div>
            {error && <p className="order-error" role="alert">{error}</p>}
            <div className="order-submit"><p>Kontak yang kamu isi digunakan untuk membahas proyek ini.</p><button className="button button-primary" disabled={state === 'sending'}>{state === 'sending' ? 'Mengirim order…' : 'Kirim order'} <span>↗</span></button></div>
          </form>
        )}
      </div>
    </section>
  );
}

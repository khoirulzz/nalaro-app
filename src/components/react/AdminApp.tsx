import React, { useEffect, useState } from 'react';
import { BrowserRouter, HashRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { PAYMENT_METHODS, paymentInformation } from '../../lib/payment';
import { verificationBaseUrl } from '../../lib/verification';
import { brandContact, NALARO_EMAIL, NALARO_WEBSITE } from '../../lib/brand';

import { ADMIN_EMAIL } from '../../lib/admin';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { PushNotifications } from '@capacitor/push-notifications';
import { Network } from '@capacitor/network';
import { Haptics, NotificationType } from '@capacitor/haptics';
import BottomNav from './mobile/BottomNav';
import MobileFinance, { MobileMore, MobileVerify } from './mobile/MobileViews';
const Mailbox = React.lazy(() => import('./Mailbox'));

function money(value: any = 0) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function showDate(value: any) {
  if (!value) return '—';
  const date = value?.seconds ? new Date(value.seconds * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function documentNumber(type: 'PRJ' | 'INV' | 'RCPT', id: string, dateValue = '') {
  const year = /^\d{4}-/.test(dateValue) ? dateValue.slice(0, 4) : today().slice(0, 4);
  return 'NAL/' + type + '/' + year + '/' + id.slice(0, 12).toUpperCase();
}

function recordCode(prefix: string, id: string) {
  return prefix + '-' + id.slice(0, 12).toUpperCase();
}

function statusClass(status = '') {
  return 'status-pill status-' + status.toLowerCase().replaceAll(' ', '-').replaceAll('_', '-');
}

/** Prevent queued offline writes for money-critical workflows. */
async function requireFinancialNetwork() {
  if (Capacitor.isNativePlatform()) {
    const status = await Network.getStatus();
    if (!status.connected) throw new Error('Koneksi internet diperlukan untuk menerbitkan dokumen atau mencatat pembayaran.');
  } else if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Tidak dapat menyimpan transaksi saat offline.');
  }
}

async function readCollection(name: string): Promise<any[]> {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}

function usePdfDownload() {
  const [downloading, setDownloading] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const downloadPDF = async (id: string, kind: 'invoice' | 'receipt', record: any, client: any, project: any, settings: any) => {
    if (downloading) return;
    setDownloading(id);
    setDownloadError('');
    try {
      const pdf = await import('../../lib/pdf');
      await (kind === 'invoice' ? pdf.generateInvoicePDF : pdf.generateReceiptPDF)(record, client, project, settings);
    } catch (error) {
      console.error('PDF download failed', error);
      setDownloadError('PDF belum berhasil dibuat. ' + (error instanceof Error ? error.message : 'Coba unduh kembali.'));
    } finally { setDownloading(''); }
  };
  const emailPDF = async (id: string, kind: 'invoice' | 'receipt', record: any, client: any, project: any, settings: any) => {
    if (downloading) return;
    setDownloading(id); setDownloadError('');
    try {
      const mail = await import('../../lib/mailbox');
      const config = await mail.mailboxService.config();
      const mailbox = config.mailboxes.find((address) => address === 'billing@nalaro.digital');
      if (!mailbox) throw new Error('Aktifkan billing@nalaro.digital untuk mengirim dokumen pembayaran.');
      const pdf = await import('../../lib/pdf');
      const document = await (kind === 'invoice' ? pdf.buildInvoicePDF : pdf.buildReceiptPDF)(record, client, project, settings);
      const number = String(record.invoiceNumber || record.receiptNumber || 'Nalaro');
      const label = kind === 'invoice' ? 'Invoice' : 'Payment receipt';
      const attachment = await mail.outgoingFile(document.output('blob'), number.replace(/[\\/:*?"<>|]/g, '-') + '.pdf');
      const draft = await mail.mailboxService.save(mailbox, {
        to: client?.email ? [client.email] : [], subject: `Nalaro ${label} — ${number}`,
        text: `Hello ${client?.picName || client?.name || 'there'},\n\nPlease find attached your ${label.toLowerCase()} for ${project?.name || record.projectName || 'your project'}.\n\n${kind === 'invoice' ? 'Payment information is included in the attached invoice.' : 'Thank you for your payment.'}`,
        attachments: [attachment],
        billing: {
          kind, number, project: String(project?.name || record.projectName || ''),
          amount: Number(kind === 'invoice' ? record.grandTotal : record.amount) || 0,
          outstanding: kind === 'invoice' ? Math.max(0, Number(record.outstandingAmount ?? (Number(record.grandTotal || 0) - Number(record.paidAmount || 0)))) : 0,
          status: kind === 'receipt' ? 'paid' : (['paid', 'partial', 'cancelled'].includes(record.status) ? record.status : 'unpaid'),
          date: String((kind === 'invoice' ? record.dueDate : record.paymentDate) || ''),
          ...(record.relatedInvoice ? { relatedInvoice: String(record.relatedInvoice) } : {}),
          ...(record.publicToken ? { verificationToken: String(record.publicToken) } : {}),
        },
      });
      const query = 'mailbox=' + encodeURIComponent(mailbox) + '&draft=' + encodeURIComponent(draft.id);
      if (Capacitor.isNativePlatform()) window.location.hash = '/email?' + query;
      else window.location.assign('/admin/email?' + query);
    } catch (error) { setDownloadError('Draft email belum berhasil dibuat. ' + (error instanceof Error ? error.message : 'Coba lagi.')); }
    finally { setDownloading(''); }
  };
  return { downloading, downloadError, downloadPDF, emailPDF };
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'loading' | 'allowed' | 'denied'>('loading');

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      if (!user || user.email !== ADMIN_EMAIL) setState('denied');
      else setState('allowed');
    });
  }, []);

  useEffect(() => {
    if (state === 'denied' && !Capacitor.isNativePlatform()) window.location.replace('/login');
  }, [state]);

  if (state === 'loading') {
    return <div className="admin-boot"><span className="signal-dot" />Memuat Project Desk…</div>;
  }

  return state === 'allowed' ? <>{children}</> : null;
}

function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <p className="page-eyebrow"><span>{eyebrow}</span></p>
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action && <div className="page-action">{action}</div>}
    </header>
  );
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="empty-state">
      <span className="empty-mark">+</span>
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  );
}

function Dashboard() {
  const [projects, setProjects] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      readCollection('projects'),
      readCollection('invoices'),
      readCollection('receipts'),
    ]).then(([p, i, r]) => {
      setProjects(p);
      setInvoices(i);
      setReceipts(r);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const active = projects.filter((item) => !['completed', 'cancelled'].includes(String(item.status).toLowerCase()));
  const openInvoices = invoices.filter((item) => !['paid', 'cancelled'].includes(String(item.status).toLowerCase()));
  const outstanding = openInvoices.reduce((sum, item) => {
    return sum + Math.max(0, Number(item.grandTotal || 0) - Number(item.paidAmount || 0));
  }, 0);
  const completed = projects.filter((item) => String(item.status).toLowerCase() === 'completed').length;
  const recent = [...projects]
    .sort((a, b) => String(b.receivedDate || '').localeCompare(String(a.receivedDate || '')))
    .slice(0, 5);
  const dueSoon = active
    .filter((item) => item.deadline)
    .sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)))
    .slice(0, 4);

  return (
    <section className="admin-page">
      <PageHeader
        eyebrow="01 / Overview"
        title="Project Desk"
        description="Satu tempat untuk memantau proyek, invoice, pembayaran, dan arsip Nalaro."
      />

      <div className="metric-grid">
        <article className="metric-card">
          <span>Proyek aktif</span>
          <strong>{loading ? '—' : String(active.length).padStart(2, '0')}</strong>
          <small>sedang berjalan</small>
        </article>
        <article className="metric-card">
          <span>Menunggu pembayaran</span>
          <strong>{loading ? '—' : money(outstanding)}</strong>
          <small>{openInvoices.length} invoice terbuka</small>
        </article>
        <article className="metric-card">
          <span>Proyek selesai</span>
          <strong>{loading ? '—' : String(completed).padStart(2, '0')}</strong>
          <small>seluruh waktu</small>
        </article>
        <article className="metric-card">
          <span>Receipt</span>
          <strong>{loading ? '—' : String(receipts.length).padStart(2, '0')}</strong>
          <small>sudah diterbitkan</small>
        </article>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading"><span>Proyek terbaru</span><NavLink to="/projects">Lihat semua ↗</NavLink></div>
          {recent.length === 0 ? (
            <EmptyState title="Belum ada proyek" copy="Buat proyek pertama untuk mulai mencatat pekerjaan Nalaro." />
          ) : (
            <div className="record-list">
              {recent.map((item) => (
                <div className="record-row" key={item.id}>
                  <div>
                    <small>{item.projectNumber || 'PROJECT'}</small>
                    <strong>{item.name}</strong>
                    <span>{item.clientName || 'Tanpa klien'}</span>
                  </div>
                  <div className="record-meta">
                    <span className={statusClass(item.status)}>{String(item.status || 'Planning').replaceAll('_', ' ')}</span>
                    <small>{showDate(item.deadline)}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-heading"><span>Perlu perhatian</span><small>{dueSoon.length} item</small></div>
          {dueSoon.length === 0 ? (
            <EmptyState title="Semua terkendali" copy="Belum ada deadline proyek yang perlu ditampilkan." />
          ) : (
            <div className="timeline-list">
              {dueSoon.map((item) => (
                <div className="timeline-item" key={item.id}>
                  <span className="signal-dot" />
                  <div><strong>{item.name}</strong><p>{item.clientName || 'Tanpa klien'}</p></div>
                  <time>{showDate(item.deadline)}</time>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function Clients() {
  const blank = { name: '', picName: '', email: '', whatsapp: '', address: '', status: 'active', notes: '' };
  const [clients, setClients] = useState<any[]>([]);
  const [form, setForm] = useState(blank);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewing, setViewing] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');

  const load = () => readCollection('clients').then(setClients);
  useEffect(() => { load().catch(console.error); }, []);

  const openCreate = () => {
    setEditing(null);
    setViewing(null);
    setForm(blank);
    setShowForm(true);
  };

  const openEdit = (item: any) => {
    setEditing(item);
    setViewing(null);
    setForm({
      name: item.name || '',
      picName: item.picName || '',
      email: item.email || '',
      whatsapp: item.whatsapp || '',
      address: item.address || '',
      status: item.status || 'active',
      notes: item.notes || '',
    });
    setShowForm(true);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(editing?.id || 'create');
    try {
      const payload = {
        ...form,
        updatedAt: serverTimestamp(),
      };
      if (editing) {
        await updateDoc(doc(db, 'clients', editing.id), payload);
      } else {
        const clientRef = doc(collection(db, 'clients'));
        await setDoc(clientRef, {
          ...payload,
          clientCode: recordCode('CLI', clientRef.id),
          createdAt: serverTimestamp(),
        });
      }
      setForm(blank);
      setEditing(null);
      setShowForm(false);
      await load();
    } finally {
      setBusy('');
    }
  };

  const remove = async (item: any) => {
    const [projectRows, invoiceRows] = await Promise.all([readCollection('projects'), readCollection('invoices')]);
    const projectCount = projectRows.filter((row) => row.clientId === item.id).length;
    const invoiceCount = invoiceRows.filter((row) => row.clientId === item.id).length;
    if (projectCount || invoiceCount) {
      window.alert('Klien belum dapat dihapus karena masih terhubung ke ' + projectCount + ' proyek dan ' + invoiceCount + ' invoice. Hapus atau pindahkan data terkait terlebih dahulu.');
      return;
    }
    if (!window.confirm('Hapus klien "' + item.name + '"? Tindakan ini tidak dapat dibatalkan.')) return;
    setBusy(item.id);
    try {
      await deleteDoc(doc(db, 'clients', item.id));
      if (viewing?.id === item.id) setViewing(null);
      await load();
    } finally {
      setBusy('');
    }
  };

  const rows = clients.filter((item) => {
    return (String(item.name) + ' ' + String(item.picName) + ' ' + String(item.email) + ' ' + String(item.status))
      .toLowerCase()
      .includes(search.toLowerCase());
  });

  return (
    <section className="admin-page">
      <PageHeader
        eyebrow="03 / Clients"
        title="Klien"
        description="Kontak dan identitas pihak yang bekerja bersama Nalaro."
        action={<button className="primary-button" onClick={openCreate}>+ Klien baru</button>}
      />

      {viewing && (
        <section className="detail-panel">
          <div className="editor-title">
            <div><small>{viewing.clientCode || viewing.id.slice(0, 8)}</small><strong>{viewing.name}</strong></div>
            <button type="button" onClick={() => setViewing(null)}>Tutup ×</button>
          </div>
          <div className="detail-grid">
            <div><span>Status</span><strong>{String(viewing.status || 'active').replaceAll('_', ' ')}</strong></div>
            <div><span>PIC</span><strong>{viewing.picName || '—'}</strong></div>
            <div><span>Email</span><strong>{viewing.email || '—'}</strong></div>
            <div><span>WhatsApp</span><strong>{viewing.whatsapp || '—'}</strong></div>
            <div className="wide"><span>Alamat</span><p>{viewing.address || '—'}</p></div>
            <div className="wide"><span>Catatan</span><p>{viewing.notes || '—'}</p></div>
          </div>
          <div className="detail-actions">
            <button onClick={() => openEdit(viewing)}>Edit klien</button>
            <button className="danger-action" disabled={busy === viewing.id} onClick={() => remove(viewing)}>{busy === viewing.id ? 'Menghapus…' : 'Hapus'}</button>
          </div>
        </section>
      )}

      {showForm && (
        <form className="editor-panel" onSubmit={submit}>
          <div className="editor-title"><strong>{editing ? 'Edit klien' : 'Klien baru'}</strong><button type="button" onClick={() => { setShowForm(false); setEditing(null); setForm(blank); }}>Tutup ×</button></div>
          <div className="form-grid">
            <label><span>Nama klien / perusahaan *</span><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label><span>Nama PIC *</span><input required value={form.picName} onChange={(e) => setForm({ ...form, picName: e.target.value })} /></label>
            <label><span>Email</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label><span>WhatsApp</span><input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></label>
            <label><span>Status</span><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option><option value="lead">Lead</option></select></label>
            <label className="wide"><span>Alamat</span><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
            <label className="wide"><span>Catatan</span><textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          </div>
          <div className="form-actions"><button disabled={!!busy} className="primary-button" type="submit">{busy ? 'Menyimpan…' : editing ? 'Simpan perubahan' : 'Simpan klien'}</button></div>
        </form>
      )}

      <div className="toolbar">
        <input className="search-field" placeholder="Cari nama, PIC, email, atau status…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span>{rows.length} record</span>
      </div>

      <div className="data-table-wrap">
        <table className="data-table">
          <thead><tr><th>Kode</th><th>Klien</th><th>PIC</th><th>Kontak</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td><code>{item.clientCode || item.id.slice(0, 8)}</code></td>
                <td><strong>{item.name}</strong></td>
                <td>{item.picName || '—'}</td>
                <td><span>{item.email || item.whatsapp || '—'}</span></td>
                <td><span className={statusClass(item.status || 'active')}>{item.status || 'active'}</span></td>
                <td><div className="row-actions"><button onClick={() => { setViewing(item); setShowForm(false); }}>View</button><button onClick={() => openEdit(item)}>Edit</button><button className="danger-action" disabled={busy === item.id} onClick={() => remove(item)}>Delete</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <EmptyState title="Belum ada klien" copy="Tambahkan klien untuk menghubungkannya ke proyek dan invoice." />}
      </div>
    </section>
  );
}

function Projects() {
  const blank = {
    name: '',
    clientId: '',
    serviceType: 'Website Development',
    receivedDate: today(),
    deadline: '',
    status: 'planning',
    value: '',
    description: '',
  };
  const [projects, setProjects] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [form, setForm] = useState(blank);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewing, setViewing] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');

  const load = async () => {
    const [projectRows, clientRows] = await Promise.all([readCollection('projects'), readCollection('clients')]);
    setProjects(projectRows);
    setClients(clientRows);
  };
  useEffect(() => { load().catch(console.error); }, []);

  const openCreate = () => {
    setEditing(null);
    setViewing(null);
    setForm(blank);
    setShowForm(true);
  };

  const openEdit = (item: any) => {
    setEditing(item);
    setViewing(null);
    setForm({
      name: item.name || '',
      clientId: item.clientId || '',
      serviceType: item.serviceType || 'Website Development',
      receivedDate: item.receivedDate || today(),
      deadline: item.deadline || '',
      status: item.status || 'planning',
      value: String(item.value ?? ''),
      description: item.description || '',
    });
    setShowForm(true);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const client = clients.find((item) => item.id === form.clientId);
    if (!client) return;
    setBusy(editing?.id || 'create');
    try {
      const payload = {
        name: form.name,
        clientId: form.clientId,
        clientName: client.name || '',
        serviceType: form.serviceType,
        receivedDate: form.receivedDate,
        deadline: form.deadline,
        status: form.status,
        value: Number(form.value || 0),
        description: form.description,
        updatedAt: serverTimestamp(),
      };
      if (editing) {
        await updateDoc(doc(db, 'projects', editing.id), payload);
      } else {
        const projectRef = doc(collection(db, 'projects'));
        await setDoc(projectRef, {
          ...payload,
          projectNumber: documentNumber('PRJ', projectRef.id, form.receivedDate),
          createdAt: serverTimestamp(),
        });
      }
      setForm(blank);
      setEditing(null);
      setShowForm(false);
      await load();
    } finally {
      setBusy('');
    }
  };

  const remove = async (item: any) => {
    const invoiceRows = await readCollection('invoices');
    const linked = invoiceRows.filter((row) => row.projectId === item.id);
    if (linked.length) {
      window.alert('Proyek belum dapat dihapus karena masih memiliki ' + linked.length + ' invoice. Hapus invoice terkait terlebih dahulu.');
      return;
    }
    if (!window.confirm('Hapus proyek "' + item.name + '"? Tindakan ini tidak dapat dibatalkan.')) return;
    setBusy(item.id);
    try {
      await deleteDoc(doc(db, 'projects', item.id));
      if (viewing?.id === item.id) setViewing(null);
      await load();
    } finally {
      setBusy('');
    }
  };

  const rows = projects.filter((item) => {
    return (String(item.name) + ' ' + String(item.clientName) + ' ' + String(item.projectNumber) + ' ' + String(item.status))
      .toLowerCase()
      .includes(search.toLowerCase());
  });

  return (
    <section className="admin-page">
      <PageHeader
        eyebrow="02 / Projects"
        title="Proyek"
        description="Catat pekerjaan dari tanggal masuk sampai selesai."
        action={<button className="primary-button" onClick={openCreate}>+ Proyek baru</button>}
      />

      {viewing && (
        <section className="detail-panel">
          <div className="editor-title">
            <div><small>{viewing.projectNumber || viewing.id.slice(0, 8)}</small><strong>{viewing.name}</strong></div>
            <button type="button" onClick={() => setViewing(null)}>Tutup ×</button>
          </div>
          <div className="detail-grid">
            <div><span>Klien</span><strong>{viewing.clientName || '—'}</strong></div>
            <div><span>Status</span><strong>{String(viewing.status || 'planning').replaceAll('_', ' ')}</strong></div>
            <div><span>Layanan</span><strong>{viewing.serviceType || '—'}</strong></div>
            <div><span>Nilai</span><strong>{money(viewing.value)}</strong></div>
            <div><span>Tanggal masuk</span><strong>{showDate(viewing.receivedDate)}</strong></div>
            <div><span>Deadline</span><strong>{showDate(viewing.deadline)}</strong></div>
            <div className="wide"><span>Keterangan / deskripsi</span><p>{viewing.description || '—'}</p></div>
          </div>
          <div className="detail-actions">
            <button onClick={() => openEdit(viewing)}>Edit proyek</button>
            <button className="danger-action" disabled={busy === viewing.id} onClick={() => remove(viewing)}>{busy === viewing.id ? 'Menghapus…' : 'Hapus'}</button>
          </div>
        </section>
      )}

      {showForm && (
        <form className="editor-panel" onSubmit={submit}>
          <div className="editor-title"><strong>{editing ? 'Edit proyek' : 'Proyek baru'}</strong><button type="button" onClick={() => { setShowForm(false); setEditing(null); setForm(blank); }}>Tutup ×</button></div>
          <div className="form-grid">
            <label><span>Nama proyek *</span><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label><span>Klien *</span><select required value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}><option value="">Pilih klien</option>{clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label><span>Jenis layanan</span><select value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })}><option>Website Development</option><option>Landing Page</option><option>Custom Information System</option><option>Maintenance</option><option>Hosting</option><option>Domain</option><option>Nalaro Product</option><option>Other</option></select></label>
            <label><span>Nilai proyek</span><input type="number" min="0" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></label>
            <label><span>Tanggal masuk</span><input type="date" value={form.receivedDate} onChange={(e) => setForm({ ...form, receivedDate: e.target.value })} /></label>
            <label><span>Deadline</span><input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></label>
            <label><span>Status</span><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="planning">Planning</option><option value="in_progress">In Progress</option><option value="review">Review</option><option value="on_hold">On Hold</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
            <label className="wide"><span>Keterangan / deskripsi</span><textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          </div>
          <div className="form-actions"><button disabled={!!busy} className="primary-button" type="submit">{busy ? 'Menyimpan…' : editing ? 'Simpan perubahan' : 'Simpan proyek'}</button></div>
        </form>
      )}

      <div className="toolbar">
        <input className="search-field" placeholder="Cari proyek, klien, nomor, atau status…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span>{rows.length} project</span>
      </div>

      <div className="data-table-wrap">
        <table className="data-table">
          <thead><tr><th>Proyek</th><th>Klien</th><th>Layanan</th><th>Deadline</th><th>Nilai</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td><small>{item.projectNumber}</small><strong>{item.name}</strong></td>
                <td>{item.clientName || '—'}</td>
                <td>{item.serviceType || '—'}</td>
                <td>{showDate(item.deadline)}</td>
                <td>{money(item.value)}</td>
                <td><span className={statusClass(item.status)}>{String(item.status || '').replaceAll('_', ' ')}</span></td>
                <td><div className="row-actions"><button onClick={() => { setViewing(item); setShowForm(false); }}>View</button><button onClick={() => openEdit(item)}>Edit</button><button className="danger-action" disabled={busy === item.id} onClick={() => remove(item)}>Delete</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <EmptyState title="Belum ada proyek" copy="Buat proyek setelah data klien tersedia." />}
      </div>
    </section>
  );
}

function Invoices() {
  const blank = {
    projectId: '',
    issueDate: today(),
    dueDate: '',
    description: 'Website Development',
    amount: '',
    discount: '0',
    notes: '',
    paymentMethod: 'Bank Transfer',
  };
  const [invoices, setInvoices] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const { downloading, downloadError, downloadPDF, emailPDF } = usePdfDownload();
  const [form, setForm] = useState(blank);
  const [showForm, setShowForm] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [paying, setPaying] = useState<any>(null);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentDate: today(),
    paymentMethod: 'Bank Transfer',
    reference: '',
  });

  const load = async () => {
    const [invoiceRows, projectRows, clientRows, paymentRows, receiptRows] = await Promise.all([
      readCollection('invoices'),
      readCollection('projects'),
      readCollection('clients'),
      readCollection('payments'),
      readCollection('receipts'),
    ]);
    setInvoices(invoiceRows);
    setProjects(projectRows);
    setClients(clientRows);
    setPayments(paymentRows);
    setReceipts(receiptRows);
    const settingsSnap = await getDoc(doc(db, 'settings', 'general'));
    if (settingsSnap.exists()) setSettings(settingsSnap.data());
  };
  useEffect(() => { load().catch(console.error); }, []);

  const selectProject = (projectId: string) => {
    const project = projects.find((item) => item.id === projectId);
    setForm((current) => ({
      ...current,
      projectId,
      description: project?.serviceType || current.description,
      amount: project ? String(project.value || '') : current.amount,
    }));
  };

  const createInvoice = async (event: React.FormEvent) => {
    event.preventDefault();
    if (invoiceBusy) return;
    const project = projects.find((item) => item.id === form.projectId);
    const client = clients.find((item) => item.id === project?.clientId);
    if (!project || !client) return;

    setInvoiceBusy(true);
    try {
    await requireFinancialNetwork();
    const subtotal = Number(form.amount || 0);
    const discount = Number(form.discount || 0);
    const grandTotal = Math.max(0, subtotal - discount);
    const invoiceRef = doc(collection(db, 'invoices'));
    const registryRef = doc(collection(db, 'public_documents'));
    const token = registryRef.id;
    const number = documentNumber('INV', invoiceRef.id, form.issueDate);
    const batch = writeBatch(db);

    batch.set(invoiceRef, {
      invoiceNumber: number,
      projectId: project.id,
      projectName: project.name,
      clientId: client.id,
      clientName: client.name,
      issueDate: form.issueDate,
      dueDate: form.dueDate,
      status: 'unpaid',
      items: [{
        description: form.description,
        details: project.description || '',
        quantity: 1,
        unitPrice: subtotal,
        total: subtotal,
      }],
      subtotal,
      discount,
      taxType: 'none',
      taxAmount: 0,
      grandTotal,
      paidAmount: 0,
      outstandingAmount: grandTotal,
      notes: form.notes,
      paymentMethod: form.paymentMethod,
      paymentDetails: paymentInformation(form.paymentMethod, settings || {}),
      publicToken: token,
      clientSnapshot: {
        name: client.name,
        picName: client.picName || '',
        email: client.email || '',
        address: client.address || '',
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(registryRef, {
      type: 'invoice',
      documentNumber: number,
      clientName: client.name,
      projectName: project.name,
      issueDate: form.issueDate,
      dueDate: form.dueDate,
      amount: grandTotal,
      status: 'unpaid',
      valid: true,
    });

    await batch.commit();

    setForm(blank);
    setShowForm(false);
    await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Invoice gagal diterbitkan. Muat ulang lalu coba lagi.');
    } finally {
      setInvoiceBusy(false);
    }
  };

  const downloadInvoice = async (invoice: any, email = false) => {
    const client = clients.find((item) => item.id === invoice.clientId) || invoice.clientSnapshot || { name: invoice.clientName };
    const project = projects.find((item) => item.id === invoice.projectId) || { name: invoice.projectName };
    await (email ? emailPDF : downloadPDF)(invoice.id, 'invoice', invoice, client, project, settings);
  };

  const deleteInvoice = async (invoice: any) => {
    const relatedPayments = payments.filter((item) => item.invoiceId === invoice.id);
    const paymentIds = new Set(relatedPayments.map((item) => item.id));
    const relatedReceipts = receipts.filter((item) => item.invoiceId === invoice.id || paymentIds.has(item.paymentId));
    const warning = relatedPayments.length || relatedReceipts.length
      ? ' Invoice ini memiliki ' + relatedPayments.length + ' pembayaran dan ' + relatedReceipts.length + ' receipt terkait. Data terkait juga akan dihapus.'
      : '';
    if (!window.confirm('Hapus invoice "' + invoice.invoiceNumber + '"?' + warning + ' Tindakan ini tidak dapat dibatalkan.')) return;

    const batch = writeBatch(db);
    batch.delete(doc(db, 'invoices', invoice.id));
    if (invoice.publicToken) batch.delete(doc(db, 'public_documents', invoice.publicToken));
    relatedPayments.forEach((payment) => batch.delete(doc(db, 'payments', payment.id)));
    relatedReceipts.forEach((receipt) => {
      batch.delete(doc(db, 'receipts', receipt.id));
      if (receipt.publicToken) batch.delete(doc(db, 'public_documents', receipt.publicToken));
    });
    await batch.commit();
    await load();
  };

  const recordPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!paying || paymentBusy) return;

    const amount = Math.max(0, Number(paymentForm.amount || 0));
    if (!amount) return;

    const paymentRef = doc(collection(db, 'payments'));
    setPaymentBusy(true);

    try {
      await requireFinancialNetwork();
      await runTransaction(db, async (transaction) => {
        const invoiceRef = doc(db, 'invoices', paying.id);
        const invoiceSnap = await transaction.get(invoiceRef);
        if (!invoiceSnap.exists()) throw new Error('Invoice tidak ditemukan. Muat ulang halaman lalu coba lagi.');

        const invoice = invoiceSnap.data();
        const currentStatus = String(invoice.status || '').toLowerCase();
        if (currentStatus === 'cancelled') throw new Error('Invoice sudah dibatalkan dan tidak dapat menerima pembayaran.');
        if (currentStatus === 'paid') throw new Error('Invoice sudah lunas.');

        const total = Math.max(0, Number(invoice.grandTotal || 0));
        const currentPaid = Math.max(0, Number(invoice.paidAmount || 0));
        const outstandingBefore = Math.max(0, Number(invoice.outstandingAmount ?? (total - currentPaid)));
        if (outstandingBefore <= 0) throw new Error('Invoice sudah tidak memiliki sisa tagihan.');
        if (amount > outstandingBefore) {
          throw new Error('Pembayaran melebihi sisa tagihan saat ini (' + money(outstandingBefore) + '). Data mungkin telah berubah di perangkat lain.');
        }

        const newPaid = currentPaid + amount;
        const outstanding = Math.max(0, total - newPaid);
        const nextStatus = outstanding === 0 ? 'paid' : 'partial';

        transaction.set(paymentRef, {
          invoiceId: paying.id,
          invoiceNumber: invoice.invoiceNumber || paying.invoiceNumber,
          clientId: invoice.clientId || paying.clientId,
          paymentDate: paymentForm.paymentDate,
          amount,
          paymentMethod: paymentForm.paymentMethod,
          reference: paymentForm.reference,
          paymentDetails: paymentInformation(paymentForm.paymentMethod, settings || {}),
          createdAt: serverTimestamp(),
        });

        transaction.update(invoiceRef, {
          paidAmount: newPaid,
          outstandingAmount: outstanding,
          status: nextStatus,
          updatedAt: serverTimestamp(),
        });

        if (invoice.publicToken) {
          transaction.update(doc(db, 'public_documents', invoice.publicToken), { status: nextStatus });
        }
      });

      setPaying(null);
      setPaymentForm({ amount: '', paymentDate: today(), paymentMethod: 'Bank Transfer', reference: '' });
      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Pembayaran gagal disimpan. Muat ulang lalu coba lagi.');
    } finally {
      setPaymentBusy(false);
    }
  };

  const issueReceipt = async (invoice: any) => {
    const invoicePayments = payments
      .filter((item) => item.invoiceId === invoice.id)
      .sort((a, b) => String(b.paymentDate).localeCompare(String(a.paymentDate)));
    const payment = invoicePayments.find((item) => !receipts.some((receipt) => receipt.paymentId === item.id));
    if (!payment) return;

    // One receipt per payment across web/mobile. The deterministic receipt id also
    // makes transaction retries idempotent.
    const receiptRef = doc(db, 'receipts', payment.id);
    const registryRef = doc(collection(db, 'public_documents'));
    const token = registryRef.id;
    const number = documentNumber('RCPT', receiptRef.id, payment.paymentDate);

    try {
      await requireFinancialNetwork();
      await runTransaction(db, async (transaction) => {
        const paymentRef = doc(db, 'payments', payment.id);
        const invoiceRef = doc(db, 'invoices', invoice.id);
        const paymentSnap = await transaction.get(paymentRef);
        const invoiceSnap = await transaction.get(invoiceRef);
        const existingReceipt = await transaction.get(receiptRef);

        if (!paymentSnap.exists()) throw new Error('Data pembayaran tidak ditemukan. Muat ulang halaman lalu coba lagi.');
        if (!invoiceSnap.exists()) throw new Error('Invoice tidak ditemukan. Muat ulang halaman lalu coba lagi.');
        if (existingReceipt.exists()) return;

        const freshPayment = paymentSnap.data();
        const freshInvoice = invoiceSnap.data();

        transaction.set(receiptRef, {
          receiptNumber: number,
          invoiceId: invoice.id,
          relatedInvoice: freshInvoice.invoiceNumber || invoice.invoiceNumber,
          paymentId: payment.id,
          clientId: freshInvoice.clientId || invoice.clientId,
          clientName: freshInvoice.clientName || invoice.clientName,
          projectName: freshInvoice.projectName || invoice.projectName || '',
          projectId: freshInvoice.projectId || invoice.projectId || '',
          clientSnapshot: freshInvoice.clientSnapshot || invoice.clientSnapshot || { name: invoice.clientName || '' },
          amount: freshPayment.amount,
          paymentDate: freshPayment.paymentDate,
          paymentMethod: freshPayment.paymentMethod,
          paymentReference: freshPayment.reference || '',
          paymentDetails: freshPayment.paymentDetails || paymentInformation(freshPayment.paymentMethod, settings || {}),
          publicToken: token,
          createdAt: serverTimestamp(),
        });

        transaction.set(registryRef, {
          type: 'receipt',
          documentNumber: number,
          relatedInvoice: freshInvoice.invoiceNumber || invoice.invoiceNumber,
          clientName: freshInvoice.clientName || invoice.clientName,
          projectName: freshInvoice.projectName || invoice.projectName || '',
          amount: freshPayment.amount,
          paymentDate: freshPayment.paymentDate,
          paymentMethod: freshPayment.paymentMethod,
          status: 'paid',
          valid: true,
        });
      });

      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Receipt gagal diterbitkan. Muat ulang lalu coba lagi.');
    }
  };

  return (
    <section className="admin-page">
      <PageHeader
        eyebrow="04 / Invoices"
        title="Invoice"
        description="Buat tagihan, catat pembayaran manual, lalu terbitkan receipt."
        action={<button className="primary-button" onClick={() => setShowForm((value) => !value)}>+ Invoice baru</button>}
      />

      {downloadError && <p className="document-error" role="alert">{downloadError}</p>}

      {showForm && (
        <form className="editor-panel" onSubmit={createInvoice}>
          <div className="editor-title"><strong>Invoice baru</strong><button type="button" onClick={() => setShowForm(false)}>Tutup ×</button></div>
          <div className="form-grid">
            <label className="wide"><span>Proyek *</span><select required value={form.projectId} onChange={(e) => selectProject(e.target.value)}><option value="">Pilih proyek</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.clientName}</option>)}</select></label>
            <label><span>Tanggal terbit</span><input type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} /></label>
            <label><span>Jatuh tempo *</span><input required type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label>
            <label><span>Deskripsi item</span><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            <label><span>Nilai</span><input required type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
            <label><span>Diskon</span><input type="number" min="0" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} /></label>
            <label><span>Metode pembayaran</span><select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>{PAYMENT_METHODS.map((method) => <option key={method}>{method}</option>)}</select></label>
            <label className="wide"><span>Catatan</span><textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          </div>
          <div className="form-actions"><span>PPN tidak dipungut</span><button disabled={invoiceBusy} className="primary-button" type="submit">{invoiceBusy ? 'Menerbitkan…' : 'Terbitkan invoice'}</button></div>
        </form>
      )}

      {paying && (
        <form className="editor-panel" onSubmit={recordPayment}>
          <div className="editor-title">
            <div><small>{paying.invoiceNumber}</small><strong>Catat pembayaran</strong></div>
            <button type="button" onClick={() => setPaying(null)}>Tutup ×</button>
          </div>
          <div className="payment-summary"><span>Sisa tagihan</span><strong>{money(paying.outstandingAmount ?? paying.grandTotal)}</strong></div>
          <div className="form-grid">
            <label><span>Jumlah dibayar</span><input required type="number" min="1" max={paying.outstandingAmount ?? paying.grandTotal} value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} /></label>
            <label><span>Tanggal pembayaran</span><input type="date" value={paymentForm.paymentDate} onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })} /></label>
            <label><span>Metode</span><select value={paymentForm.paymentMethod} onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}>{PAYMENT_METHODS.map((method) => <option key={method}>{method}</option>)}</select></label>
            <label><span>Referensi</span><input value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })} /></label>
          </div>
          <div className="form-actions"><button disabled={paymentBusy} className="primary-button" type="submit">{paymentBusy ? 'Menyimpan…' : 'Simpan pembayaran'}</button></div>
        </form>
      )}

      <div className="data-table-wrap">
        <table className="data-table">
          <thead><tr><th>Invoice</th><th>Klien / proyek</th><th>Total</th><th>Dibayar</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>
            {invoices.map((invoice) => {
              const invoicePayments = payments
                .filter((item) => item.invoiceId === invoice.id)
                .sort((a, b) => String(b.paymentDate).localeCompare(String(a.paymentDate)));
              const pendingReceiptPayment = invoicePayments.find((payment) => !receipts.some((receipt) => receipt.paymentId === payment.id));
              const allPaymentsReceipted = invoicePayments.length > 0 && !pendingReceiptPayment;

              return (
                <tr key={invoice.id}>
                  <td><small>{showDate(invoice.issueDate)}</small><strong>{invoice.invoiceNumber}</strong></td>
                  <td><strong>{invoice.clientName}</strong><span>{invoice.projectName}</span></td>
                  <td>{money(invoice.grandTotal)}</td>
                  <td>{money(invoice.paidAmount || 0)}</td>
                  <td><span className={statusClass(invoice.status)}>{invoice.status}</span></td>
                  <td>
                    <div className="row-actions">
                      <button disabled={!!downloading} onClick={() => downloadInvoice(invoice)}>{downloading === invoice.id ? 'Membuat…' : 'PDF'}</button>
                      <button disabled={!!downloading} onClick={() => downloadInvoice(invoice, true)}>Email</button>
                      {!['paid', 'cancelled'].includes(String(invoice.status)) && (
                        <button onClick={() => {
                          setPaying(invoice);
                          setPaymentForm((current) => ({
                            ...current,
                            amount: String(invoice.outstandingAmount ?? invoice.grandTotal),
                            paymentMethod: invoice.paymentMethod || 'Bank Transfer',
                          }));
                        }}>Bayar</button>
                      )}
                      {pendingReceiptPayment && <button onClick={() => issueReceipt(invoice)}>Receipt</button>}
                      {allPaymentsReceipted && <span>Receipt ✓</span>}
                      <button className="danger-action" onClick={() => deleteInvoice(invoice)}>Hapus</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {invoices.length === 0 && <EmptyState title="Belum ada invoice" copy="Terbitkan invoice dari proyek yang sudah tercatat." />}
      </div>
    </section>
  );
}

function Receipts() {
  const [receipts, setReceipts] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [deleting, setDeleting] = useState('');
  const { downloading, downloadError, downloadPDF, emailPDF } = usePdfDownload();

  const load = async () => {
    const [receiptRows, clientRows, projectRows, invoiceRows, settingSnap] = await Promise.all([
      readCollection('receipts'),
      readCollection('clients'),
      readCollection('projects'),
      readCollection('invoices'),
      getDoc(doc(db, 'settings', 'general')),
    ]);
    setReceipts(receiptRows as any[]);
    setClients(clientRows as any[]);
    setProjects(projectRows as any[]);
    setInvoices(invoiceRows as any[]);
    if ((settingSnap as any).exists()) setSettings((settingSnap as any).data());
  };

  useEffect(() => { load().catch(console.error); }, []);

  const download = async (receipt: any, email = false) => {
    const invoice = invoices.find((item) => item.id === receipt.invoiceId);
    const client = clients.find((item) => item.id === receipt.clientId) || receipt.clientSnapshot || invoice?.clientSnapshot || { name: receipt.clientName };
    const project = projects.find((item) => item.id === (receipt.projectId || invoice?.projectId)) || { name: receipt.projectName };
    await (email ? emailPDF : downloadPDF)(receipt.id, 'receipt', receipt, client, project, settings);
  };

  const remove = async (receipt: any) => {
    if (!window.confirm('Hapus receipt "' + receipt.receiptNumber + '"? Pembayaran asli tidak dihapus dan receipt dapat diterbitkan kembali dari invoice.')) return;
    setDeleting(receipt.id);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'receipts', receipt.id));
      if (receipt.publicToken) batch.delete(doc(db, 'public_documents', receipt.publicToken));
      await batch.commit();
      await load();
    } finally {
      setDeleting('');
    }
  };

  return (
    <section className="admin-page">
      <PageHeader eyebrow="05 / Receipts" title="Receipt" description="Bukti pembayaran yang telah diterbitkan oleh Nalaro." />
      {downloadError && <p className="document-error" role="alert">{downloadError}</p>}
      <div className="data-table-wrap">
        <table className="data-table">
          <thead><tr><th>Receipt</th><th>Klien</th><th>Invoice</th><th>Pembayaran</th><th>Metode</th><th>Aksi</th></tr></thead>
          <tbody>
            {receipts.map((receipt) => (
              <tr key={receipt.id}>
                <td><small>{showDate(receipt.paymentDate)}</small><strong>{receipt.receiptNumber}</strong></td>
                <td>{receipt.clientName || '—'}</td>
                <td>{receipt.relatedInvoice || '—'}</td>
                <td>{money(receipt.amount)}</td>
                <td>{receipt.paymentMethod || '—'}</td>
                <td><div className="row-actions"><button disabled={!!downloading} onClick={() => download(receipt)}>{downloading === receipt.id ? 'Membuat…' : 'PDF'}</button><button disabled={!!downloading} onClick={() => download(receipt, true)}>Email</button><button className="danger-action" disabled={deleting === receipt.id} onClick={() => remove(receipt)}>{deleting === receipt.id ? 'Menghapus…' : 'Hapus'}</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {receipts.length === 0 && <EmptyState title="Belum ada receipt" copy="Receipt muncul setelah pembayaran dicatat dan diterbitkan dari menu invoice." />}
      </div>
    </section>
  );
}

function Archive() {
  const [projects, setProjects] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([readCollection('projects'), readCollection('invoices'), readCollection('receipts')])
      .then(([p, i, r]) => {
        setProjects(p);
        setInvoices(i);
        setReceipts(r);
      }).catch(console.error);
  }, []);

  const closedProjects = projects.filter((item) => ['completed', 'cancelled'].includes(String(item.status).toLowerCase()));
  const closedInvoices = invoices.filter((item) => ['paid', 'cancelled'].includes(String(item.status).toLowerCase()));

  return (
    <section className="admin-page">
      <PageHeader eyebrow="06 / Archive" title="Arsip" description="Dokumen selesai tetap tersimpan dan mudah ditelusuri." />
      <div className="archive-grid">
        <article className="panel">
          <div className="panel-heading"><span>Proyek selesai</span><small>{closedProjects.length}</small></div>
          {closedProjects.length ? (
            <div className="record-list">
              {closedProjects.map((item) => (
                <div className="record-row" key={item.id}>
                  <div><small>{item.projectNumber}</small><strong>{item.name}</strong><span>{item.clientName}</span></div>
                  <span className={statusClass(item.status)}>{item.status}</span>
                </div>
              ))}
            </div>
          ) : <EmptyState title="Arsip proyek kosong" copy="Proyek Completed atau Cancelled akan muncul di sini." />}
        </article>

        <article className="panel">
          <div className="panel-heading"><span>Dokumen finansial</span><small>{closedInvoices.length + receipts.length}</small></div>
          <div className="archive-counts">
            <div><strong>{closedInvoices.length}</strong><span>invoice selesai</span></div>
            <div><strong>{receipts.length}</strong><span>receipt</span></div>
          </div>
        </article>
      </div>
    </section>
  );
}

function Settings() {
  const defaults = {
    businessName: 'Nalaro',
    ownerName: 'Muhamad Khoirul Ulum',
    email: NALARO_EMAIL,
    website: NALARO_WEBSITE,
    address: '',
    bankName: '',
    accountNumber: '',
    accountHolder: '',
    verificationBaseUrl: '',
    qrisMerchantName: '',
    qrisImage: '',
    walletName: '',
    walletNumber: '',
    walletHolder: '',
    otherPaymentInfo: '',
  };
  const [form, setForm] = useState(defaults);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'settings', 'general')).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.verificationBaseUrl === 'https://e-invoice.nalaro.digital/verif/' && window.location.hostname !== 'e-invoice.nalaro.digital') data.verificationBaseUrl = '';
        setForm((current) => ({ ...current, ...data, ...brandContact(data) }));
      }
    }).catch(console.error);
  }, []);

  const uploadQris = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Error('Unggah QRIS berupa PNG atau JPG.');
      if (file.size > 300 * 1024) throw new Error('Ukuran QRIS maksimal 300 KB. Gunakan gambar QRIS yang jelas.');
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('QRIS tidak dapat dibaca.'));
        reader.readAsDataURL(file);
      });
      const preview = new Image();
      preview.src = image;
      await preview.decode();
      if (preview.naturalWidth < 128 || preview.naturalHeight < 128) throw new Error('Resolusi gambar QRIS terlalu kecil. Minimal 128 × 128 piksel.');
      setForm((current) => ({ ...current, qrisImage: image }));
    } catch (error) { setError(error instanceof Error ? error.message : 'Gambar QRIS tidak valid.'); }
    event.target.value = '';
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(''); setSaved(false); setSaving(true);
    try {
      verificationBaseUrl(form);
      await setDoc(doc(db, 'settings', 'general'), {
        ...form,
        ...brandContact(form),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (error) { setError(error instanceof Error ? error.message : 'Pengaturan belum tersimpan.'); }
    finally { setSaving(false); }
  };

  return (
    <section className="admin-page">
      <PageHeader eyebrow="07 / Settings" title="Pengaturan" description="Identitas dan informasi pembayaran yang dipakai di dokumen Nalaro." />
      {error && <p className="document-error" role="alert">{error}</p>}
      <form className="editor-panel settings-panel" onSubmit={save}>
        <div className="editor-title"><strong>Identitas Nalaro</strong>{saved && <span className="saved-note">Tersimpan ✓</span>}</div>
        <div className="form-grid">
          <label><span>Business name</span><input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} /></label>
          <label><span>Owner</span><input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} /></label>
          <label><span>Email</span><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label><span>Website</span><input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></label>
          <label className="wide"><span>Alamat</span><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
        </div>
        <div className="editor-title subsection"><strong>Rekening pembayaran</strong></div>
        <div className="form-grid">
          <label><span>Bank</span><input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} /></label>
          <label><span>Atas nama</span><input value={form.accountHolder} onChange={(e) => setForm({ ...form, accountHolder: e.target.value })} /></label>
          <label className="wide"><span>Nomor rekening</span><input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} /></label>
        </div>
        <div className="editor-title subsection"><strong>QRIS statis</strong></div>
        <div className="form-grid">
          <label><span>Nama merchant</span><input value={form.qrisMerchantName} onChange={(e) => setForm({ ...form, qrisMerchantName: e.target.value })} /></label>
          <label><span>Gambar QRIS (PNG/JPG, maks. 300 KB)</span><input type="file" accept="image/png,image/jpeg" onChange={uploadQris} /></label>
          {form.qrisImage && <div className="payment-image-preview"><img src={form.qrisImage} alt="QRIS pembayaran Nalaro" /><button type="button" className="text-link" onClick={() => setForm({ ...form, qrisImage: '' })}>Hapus gambar ×</button></div>}
        </div>
        <div className="editor-title subsection"><strong>E-wallet / metode lainnya</strong></div>
        <div className="form-grid">
          <label><span>E-wallet</span><input value={form.walletName} onChange={(e) => setForm({ ...form, walletName: e.target.value })} /></label>
          <label><span>Nomor e-wallet</span><input value={form.walletNumber} onChange={(e) => setForm({ ...form, walletNumber: e.target.value })} /></label>
          <label><span>Atas nama e-wallet</span><input value={form.walletHolder} onChange={(e) => setForm({ ...form, walletHolder: e.target.value })} /></label>
          <label><span>Informasi metode lainnya</span><textarea rows={2} value={form.otherPaymentInfo} onChange={(e) => setForm({ ...form, otherPaymentInfo: e.target.value })} /></label>
        </div>
        <div className="editor-title subsection"><strong>Verifikasi dokumen</strong></div>
        <div className="form-grid">
          <label className="wide"><span>URL dasar verifikasi</span><input type="url" placeholder={typeof window !== 'undefined' ? window.location.origin + '/verifi/' : 'https://alamat-aplikasi/verifi/'} value={form.verificationBaseUrl} onChange={(e) => setForm({ ...form, verificationBaseUrl: e.target.value })} /><small>Kosongkan untuk memakai alamat aplikasi ini. Jika diisi, gunakan halaman verifikasi yang aktif, misalnya https://alamat-aplikasi/verifi/.</small></label>
        </div>
        <div className="form-actions"><button disabled={saving} className="primary-button" type="submit">{saving ? 'Menyimpan…' : 'Simpan pengaturan'}</button></div>
      </form>
    </section>
  );
}

function AdminLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const isMobileApp = typeof window !== 'undefined' && Capacitor.isNativePlatform();
  const navigation = [
    ['01', 'Overview', '/'],
    ['02', 'Projects', '/projects'],
    ['03', 'Clients', '/clients'],
    ['04', 'Invoices', '/invoices'],
    ['05', 'Receipts', '/receipts'],
    ['06', 'Archive', '/archive'],
    ['07', 'Email', '/email'],
  ];

  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    if (!isMobileApp) return;
    let disposed = false;
    let listener: { remove: () => Promise<void> } | undefined;
    void NativeApp.addListener('backButton', () => {
      if (menuOpen) setMenuOpen(false);
      else if (location.pathname !== '/') navigate(-1);
      else void NativeApp.minimizeApp().catch(console.error);
    }).then(handle => {
      if (disposed) void handle.remove();
      else listener = handle;
    }).catch(console.error);
    return () => { disposed = true; if (listener) void listener.remove(); };
  }, [isMobileApp, location.pathname, menuOpen, navigate]);

  const logout = async () => {
    await signOut(auth);
    if (!isMobileApp) window.location.replace('/login');
  };

  return (
    <div className={`admin-shell ${isMobileApp ? 'mobile-app' : ''}`}>
      {!isMobileApp && (
        <header className="admin-mobilebar">
          <a href="https://nalaro.digital" className="admin-brand"><img src="/brand/nalaro.png" alt="" /><span>nalaro</span></a>
          <button onClick={() => setMenuOpen((value) => !value)}>{menuOpen ? 'Tutup' : 'Menu'} <span>+</span></button>
        </header>
      )}

      {menuOpen && !isMobileApp && <button className="sidebar-scrim" aria-label="Tutup menu" onClick={() => setMenuOpen(false)} />}

      {!isMobileApp && (
        <aside className={'admin-sidebar ' + (menuOpen ? 'is-open' : '')}>
        <div className="sidebar-head">
          <a href="https://nalaro.digital" className="admin-brand"><img src="/brand/nalaro.png" alt="" /><span>nalaro</span></a>
          <p>PROJECT DESK / INTERNAL</p>
        </div>

        <nav aria-label="Navigasi Project Desk">
          {navigation.map(([number, label, path]) => (
            <NavLink key={path} to={path} end={path === '/'} className={({ isActive }) => isActive ? 'active' : ''}>
              <span>{number}</span><strong>{label}</strong><i>↗</i>
            </NavLink>
          ))}
          <a className="order-form-link" href="/form/order" target="_blank" rel="noopener noreferrer">
            <span aria-hidden="true">↗</span><strong>Form</strong>
          </a>
        </nav>

        <div className="sidebar-foot">
          <NavLink to="/settings" className={({ isActive }) => isActive ? 'active settings-link' : 'settings-link'}>
            <span>08</span><strong>Settings</strong><i>↗</i>
          </NavLink>
          <button onClick={logout}><span>×</span><strong>Keluar</strong></button>
          <small>order.nalaro.digital</small>
        </div>
      </aside>
      )}

      <main className="admin-main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/receipts" element={<Receipts />} />
          <Route path="/archive" element={<Archive />} />
          <Route path="/email" element={<React.Suspense fallback={<div className="admin-boot">Memuat Mail Desk…</div>}><Mailbox /></React.Suspense>} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/finance" element={<MobileFinance />} />
          <Route path="/more" element={<MobileMore logout={logout} />} />
          <Route path="/verify/:token" element={<MobileVerify />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      
      {isMobileApp && <BottomNav />}
    </div>
  );
}

export default function AdminApp() {
  useEffect(() => {
    if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
      CapacitorUpdater.notifyAppReady().catch(console.error);
      
      PushNotifications.requestPermissions().then(result => {
        if (result.receive === 'granted') {
          PushNotifications.register().catch(console.error);
        }
      }).catch(console.error);

      let disposed = false;
      let networkListener: { remove: () => Promise<void> } | undefined;
      void Network.addListener('networkStatusChange', status => {
        console.log('Network status changed', status);
        if (!status.connected) {
          Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
        }
      }).then(listener => {
        if (disposed) void listener.remove();
        else networkListener = listener;
      }).catch(console.error);
      return () => { disposed = true; if (networkListener) void networkListener.remove(); };
    }
  }, []);

  const content = <ProtectedRoute><AdminLayout /></ProtectedRoute>;
  return Capacitor.isNativePlatform()
    ? <HashRouter>{content}</HashRouter>
    : <BrowserRouter basename="/admin">{content}</BrowserRouter>;
}

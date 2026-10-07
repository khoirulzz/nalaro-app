import React, { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { verificationToken } from '../../lib/verification';

function formatCurrency(value = 0) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function formatDate(value: any) {
  if (!value) return '—';
  const date = value?.seconds ? new Date(value.seconds * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }).format(date);
}

function tokenFromPath() {
  if (typeof window === 'undefined') return '';
  return verificationToken(window.location);
}

export default function VerificationApp({ token: providedToken }: { token?: string }) {
  const token = useMemo(() => providedToken || tokenFromPath(), [providedToken]);
  const [state, setState] = useState<'loading' | 'found' | 'missing' | 'error'>('loading');
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!token) {
      setState('missing');
      return;
    }
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'public_documents', token));
        if (!snap.exists()) {
          setState('missing');
          return;
        }
        setData(snap.data());
        setState('found');
      } catch (error) {
        console.error(error);
        setState('error');
      }
    })();
  }, [token]);

  if (state === 'loading') {
    return <section className="verification-shell"><div className="verification-loading"><span className="signal" />Mengecek registry Nalaro…</div></section>;
  }

  if (state === 'missing' || state === 'error' || !data) {
    return (
      <section className="verification-shell">
        <div className="verification-kicker"><span>06 / DOCUMENT REGISTRY</span><span className="registry-code">NOT FOUND</span></div>
        <div className="verification-error">
          <span className="verification-state invalid"><i /> TIDAK DITEMUKAN</span>
          <h1>Dokumen tidak dapat<br/>diverifikasi.</h1>
          <p>Token tidak valid, dokumen belum diterbitkan, atau registry sedang tidak dapat diakses.</p>
          <a className="text-link" href="https://nalaro.digital">Kembali ke Nalaro <span>↗</span></a>
        </div>
      </section>
    );
  }

  const valid = data.valid === true;
  const status = String(data.status || 'unknown').toLowerCase();
  const voided = !valid || ['cancelled', 'void'].includes(status);
  const type = String(data.type || 'document').toUpperCase();
  const datePrimary = data.type === 'receipt' ? data.paymentDate : data.issueDate;

  return (
    <section className="verification-shell">
      <div className="verification-kicker"><span>06 / DOCUMENT REGISTRY</span><span className="registry-code">TOKEN {token.slice(0, 6).toUpperCase()}</span></div>
      <article className={'registry-record ' + (voided ? 'is-void' : '')}>
        <header className="registry-head">
          <div>
            <span className={'verification-state ' + (voided ? 'invalid' : 'valid')}><i /> {voided ? 'DOCUMENT VOID' : 'DOCUMENT VERIFIED'}</span>
            <h1>{type === 'RECEIPT' ? 'Payment receipt' : type === 'INVOICE' ? 'Invoice registry' : 'Document registry'}</h1>
          </div>
          <div className="registry-status"><small>Status</small><strong>{status.replaceAll('_', ' ').toUpperCase()}</strong></div>
        </header>

        <div className="registry-number"><small>Document number</small><strong>{data.documentNumber || '—'}</strong></div>

        <div className="registry-grid">
          <div><small>Client</small><strong>{data.clientName || '—'}</strong></div>
          <div><small>{type === 'RECEIPT' ? 'Payment date' : 'Issued'}</small><strong>{formatDate(datePrimary)}</strong></div>
          {data.projectName && <div><small>Project</small><strong>{data.projectName}</strong></div>}
          {type === 'INVOICE' && <div><small>Due date</small><strong>{formatDate(data.dueDate)}</strong></div>}
          {type === 'RECEIPT' && data.relatedInvoice && <div><small>Related invoice</small><strong>{data.relatedInvoice}</strong></div>}
          {type === 'RECEIPT' && data.paymentMethod && <div><small>Payment method</small><strong>{data.paymentMethod}</strong></div>}
        </div>

        <div className="registry-total"><small>{type === 'RECEIPT' ? 'Amount received' : 'Document value'}</small><strong>{formatCurrency(data.amount)}</strong></div>

        <footer className="registry-foot">
          <p>{voided ? 'Dokumen ditemukan di registry, tetapi sudah dibatalkan atau dinyatakan tidak berlaku.' : 'Dokumen ini tercatat pada registry publik Nalaro. Informasi sensitif tidak ditampilkan pada halaman verifikasi.'}</p>
          <span>{typeof window !== 'undefined' ? window.location.host : 'Nalaro'}</span>
        </footer>
      </article>
      <div className="verification-note"><span>↳</span> Verifikasi dilakukan langsung dari registry publik Nalaro.</div>
    </section>
  );
}

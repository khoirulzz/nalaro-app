import { Capacitor } from '@capacitor/core';
import React, { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { useLocation, useNavigate } from 'react-router-dom';
import { EMAIL_ASSET_ORIGIN, isBrandedMailbox, renderOutgoingEmail } from '../../lib/email-template';
import { MAILBOX_CONFIGURED, mailboxService, outgoingFile, downloadMailFile, type MailboxService, type MailConfig, type MailDraft, type MailFolder, type MailMessage, type MailSummary } from '../../lib/mailbox';
import '../../styles/mailbox.css';

const folders: [MailFolder, string, string][] = [['inbox', 'Inbox', '↓'], ['starred', 'Starred', '☆'], ['sent', 'Sent', '↗'], ['drafts', 'Drafts', '≡'], ['trash', 'Trash', '×']];
const blank = (): MailDraft => ({ to: [], subject: '', text: '', attachments: [] });
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Permintaan gagal. Coba lagi.';
const dateText = (date: string) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
const statusText = (status: string) => ({ accepted: 'Diterima Resend', sending: 'Diproses', uncertain: 'Perlu diperiksa', failed: 'Gagal dikirim', received: 'Email masuk', draft: 'Draft' }[status] || status);
const bytesText = (size: number) => size >= 1048576 ? (size / 1048576).toFixed(1) + ' MB' : Math.ceil(size / 1024) + ' KB';
const mailboxAvatarTone = (address: string) => {
  const value = address.trim().toLowerCase();
  if (value === 'khoirululum@nalaro.digital') return null;
  if (!value.endsWith('@nalaro.digital')) return null;
  return value === 'hello@nalaro.digital' ? 'orange' : 'white';
};
function MailboxAvatar({ address, size = 'md' }: { address: string; size?: 'sm' | 'md' | 'lg' }) {
  const tone = mailboxAvatarTone(address);
  if (!tone) return null;
  return <span className={`mailbox-avatar is-${tone} is-${size}`} aria-hidden="true"><span /></span>;
}

DOMPurify.addHook('uponSanitizeAttribute', (_node, attribute) => {
  if (['src', 'srcset', 'poster', 'background'].includes(attribute.attrName)) {
    attribute.keepAttr = attribute.attrName === 'src' && /^data:image\/(png|jpeg|gif|webp);base64,/i.test(attribute.attrValue);
  }
  if (attribute.attrName === 'style' && /url\s*\(|@import/i.test(attribute.attrValue)) attribute.keepAttr = false;
});

function htmlDocument(html: string) {
  const cleaned = DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS: ['form', 'input', 'button', 'iframe', 'object', 'embed', 'meta', 'link', 'style'] });
  // Native reader gets a refined, accessible document view. Do not load external
  // media, stylesheets or scripts from potentially untrusted incoming messages.
  if (Capacitor.isNativePlatform()) {
    const css = `
      :root { color-scheme: light; }
      *, *::before, *::after { box-sizing: border-box; }
      html { background: #f5f4f1; -webkit-text-size-adjust: 100%; }
      body { max-width: 700px; min-height: 100vh; margin: 0 auto; padding: clamp(20px, 5vw, 42px);
        background: #fff; color: #252922; font: 15px/1.75 -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
        overflow-wrap: anywhere; }
      h1,h2,h3 { color:#1d211d; line-height:1.3; letter-spacing:-.025em; }
      h1 { font-size:clamp(22px,6vw,30px); } h2 { font-size:clamp(19px,5vw,25px); }
      p,ul,ol { max-width:100%; } p { margin:.9em 0; } li { margin:.3em 0; }
      blockquote { padding: 12px 16px; margin:18px 0; border-left:3px solid #ff5b2e; background:#fff6f1; color:#414942; }
      img, video, svg { max-width:100% !important; height:auto !important; }
      table { width:100% !important; max-width:100% !important; border-collapse:collapse; }
      td,th { padding:8px !important; max-width:100%; overflow-wrap:anywhere; }
      a { color:#cc461d; text-decoration:underline; text-underline-offset:3px; }
      pre { white-space:pre-wrap; overflow-wrap:anywhere; }
      hr { border:0; border-top:1px solid #e8e8e2; margin:24px 0; }
      @media (max-width:540px) { body { padding:20px 16px; } table[width],td[width] { width:auto !important; } }
    `;
    return '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; font-src \'none\'; form-action \'none\'; base-uri \'none\'"><style>'+css+'</style></head><body>'+cleaned+'</body></html>';
  }
  return '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; font-src \'none\'; form-action \'none\'; base-uri \'none\'"><style>body{font:14px/1.6 Arial,sans-serif;padding:16px;color:#232420;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}</style></head><body>' + cleaned + '</body></html>';
}

export default function Mailbox({ service = mailboxService, configured = MAILBOX_CONFIGURED }: { service?: MailboxService; configured?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [config, setConfig] = useState<MailConfig>();
  const [preview, setPreview] = useState(false);
  const [mailbox, setMailbox] = useState('');
  const [folder, setFolder] = useState<MailFolder>('inbox');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<MailSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(configured);
  const [selected, setSelected] = useState<MailMessage>();
  const [reading, setReading] = useState(false);
  const [html, setHtml] = useState(false);
  const [compose, setCompose] = useState(false);
  const [draft, setDraft] = useState<MailDraft>(blank);
  const [draftId, setDraftId] = useState<string>();
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const generation = useRef(0);
  const selectionGeneration = useRef(0);
  const dirty = useRef(false);
  const composeRef = useRef<HTMLDialogElement>(null);
  const deepLink = useRef(false);

  const connect = async () => {
    setConfigLoading(true); setError('');
    try { const value = await service.config(); setConfig(value); setMailbox(value.mailboxes[0]); }
    catch (problem) { setError(errorText(problem)); }
    finally { setConfigLoading(false); }
  };
  useEffect(() => { if (configured) void connect(); }, [configured, service]);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300); return () => clearTimeout(timer);
  }, [search]);
  const load = async (more = false) => {
    if (!mailbox) return;
    const version = ++generation.current; setLoading(true); setError('');
    try {
      const result = await service.list(mailbox, folder, query, more ? cursor || undefined : undefined);
      if (version !== generation.current) return;
      setItems((current) => more ? [...current, ...result.items.filter((item) => !current.some((row) => row.id === item.id))] : result.items);
      setCursor(result.cursor);
    } catch (problem) { if (version === generation.current) setError(errorText(problem)); }
    finally { if (version === generation.current) setLoading(false); }
  };
  useEffect(() => {
    selectionGeneration.current++; setReading(false); setSelected(undefined); setItems([]); setCursor(null); void load();
    return () => { generation.current++; selectionGeneration.current++; };
  }, [mailbox, folder, query, service]);
  useEffect(() => {
    if (compose && !composeRef.current?.open) composeRef.current?.showModal();
  }, [compose]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, []);
  // Navigation to another React route also prompts before leaving an unsaved message.
  useEffect(() => {
    const guard = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest('a[href]');
      if (dirty.current && link && !window.confirm('Pesan belum disimpan. Tinggalkan halaman?')) { event.preventDefault(); event.stopPropagation(); }
    };
    document.addEventListener('click', guard, true); return () => document.removeEventListener('click', guard, true);
  }, []);
  const begin = (value = blank(), id?: string) => {
    setPreview(false); setDraft(value); setDraftId(id); setTo(value.to.join(', ')); dirty.current = false; setCompose(true); setError(''); setNotice('');
  };
  const editDraft = async (message: MailMessage) => {
    setBusy('draft'); setError('');
    try {
      const attachments = [];
      for (const file of message.attachments) attachments.push(await outgoingFile(await service.file(message.mailbox, message.id, file.id), file.filename));
      begin({ to: message.to, subject: message.subject, text: message.text, attachments, inReplyTo: message.inReplyTo, references: message.references, billing: message.billing }, message.id);
    } catch (problem) { setError(errorText(problem)); } finally { setBusy(''); }
  };
  useEffect(() => {
    if (!mailbox || deepLink.current) return;
    const params = new URLSearchParams(location.search); const id = params.get('draft'); const address = params.get('mailbox');
    deepLink.current = true;
    if (id && (!address || config?.mailboxes.includes(address))) {
      service.get(address || mailbox, id).then(async (message) => { setMailbox(message.mailbox); setFolder('drafts'); await editDraft(message); }).catch((problem) => setError(errorText(problem)));
      if (Capacitor.isNativePlatform()) navigate('/email', { replace: true });
      else window.history.replaceState(null, '', window.location.pathname);
    }
  }, [mailbox, location.search, navigate]);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const refresh = () => { if (mailbox) void load(); };
    window.addEventListener('nalaro-push-received', refresh);
    return () => window.removeEventListener('nalaro-push-received', refresh);
  }, [mailbox, folder, query]);
  const closeCompose = () => {
    if (busy) return;
    if (dirty.current && !window.confirm('Perubahan belum disimpan. Tutup pesan ini?')) return;
    dirty.current = false; setCompose(false); composeRef.current?.close();
  };
  const run = async (label: string, action: () => Promise<void>) => {
    if (busy) return; setBusy(label); setError(''); setNotice('');
    try { await action(); } catch (problem) { setError(errorText(problem)); } finally { setBusy(''); }
  };
  const openMessage = async (item: MailSummary) => {
    if (busy) return;
    const version = ++selectionGeneration.current; setReading(true); setError(''); setSelected(undefined); setHtml(false);
    try {
      let message = await service.get(mailbox, item.id);
      if (!message.read && !['sending', 'uncertain'].includes(message.status)) message = await service.patch(mailbox, item.id, { read: true });
      if (version !== selectionGeneration.current) return;
      setHtml(Capacitor.isNativePlatform() && Boolean(message.html));
      setSelected(message); setItems((current) => current.map((row) => row.id === item.id ? { ...row, read: true } : row));
    } catch (problem) { if (version === selectionGeneration.current) setError(errorText(problem)); }
    finally { if (version === selectionGeneration.current) setReading(false); }
  };
  const change = (patch: { read?: boolean; starred?: boolean; folder?: string }) => selected && run('update', async () => {
    const result = await service.patch(mailbox, selected.id, patch); setSelected(result); await load(); if (patch.folder) setSelected(undefined);
  });
  const save = async (send: boolean) => {
    const recipients = to.split(/[,;\s]+/).map((item) => item.trim()).filter(Boolean);
    if (recipients.length > 10 || recipients.some((item) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))) throw new Error('Isi alamat penerima yang valid, maksimal 10. Pisahkan dengan koma.');
    if (send && (!recipients.length || !draft.subject.trim() || !draft.text.trim())) throw new Error('Isi penerima, subjek, dan pesan.');
    const saved = await service.save(mailbox, { ...draft, to: recipients }, draftId); setDraftId(saved.id); dirty.current = false;
    if (send) {
      const result = await service.send(mailbox, saved.id);
      setNotice(result.status === 'accepted' ? 'Email diterima Resend untuk dikirim.' : result.sendError || 'Pengiriman perlu diperiksa.');
      setFolder(result.folder); setSelected(result); setCompose(false); composeRef.current?.close();
    } else { setNotice('Draft tersimpan.'); setFolder('drafts'); setCompose(false); composeRef.current?.close(); }
    await load();
  };
  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    await run('attachments', async () => {
      const incoming = Array.from(files);
      const existingSize = draft.attachments.reduce((sum, file) => sum + file.content.length * 0.75, 0);
      if (draft.attachments.length + incoming.length > 10 || existingSize + incoming.reduce((sum, file) => sum + file.size, 0) > (config?.maxAttachmentBytes || 8 * 1048576)) throw new Error('Maksimal 10 lampiran dengan total 8 MB.');
      const attachments = await Promise.all(incoming.map((file) => outgoingFile(file, file.name)));
      dirty.current = true; setDraft((value) => ({ ...value, attachments: [...value.attachments, ...attachments] }));
    });
  };
  const updateDraft = (field: 'subject' | 'text', value: string) => { dirty.current = true; setDraft((current) => ({ ...current, [field]: value })); };
  const branded = isBrandedMailbox(mailbox);
  // Only escaped, locally generated template HTML can load our brand assets.
  // Received HTML keeps the separate sanitizer and external-image block.
  const previewHTML = preview && branded ? renderOutgoingEmail({ ...draft, from: mailbox }).html?.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src ${EMAIL_ASSET_ORIGIN}; form-action 'none'; base-uri 'none'">`) : '';

  return <section className="admin-page mailbox-page">
    <header className="page-header"><div><p className="page-eyebrow"><span>07 / Correspondence</span></p><h1>Mail Desk</h1><p className="page-description">Percakapan, penawaran, dan kabar baik. Dari alamat Nalaro.</p></div><div className="page-action"><button className="primary-button" disabled={!config || !!busy} onClick={() => begin()}>Tulis email <span>↗</span></button></div></header>
    {error && !compose && <p className="document-error" role="alert">{error}</p>}
    {notice && !compose && <p className="mail-notice" role="status">{notice}</p>}
    {!config ? <div className="mail-setup panel"><span className="mail-empty-icon">@</span><h2>{configLoading ? 'Menghubungkan mailbox…' : 'Mailbox belum terhubung'}</h2><p>Email Nalaro akan tampil di sini setelah layanan email diaktifkan.</p>{configured && !configLoading && <button className="mail-button" onClick={connect}>Hubungkan ulang</button>}</div> : <>
      <div className="mail-account"><div className="mail-account-identity"><MailboxAvatar address={mailbox} /><label><span>Mailbox</span><select aria-label="Pilih mailbox" value={mailbox} disabled={!!busy || compose} onChange={(event) => setMailbox(event.target.value)}>{config.mailboxes.map((item) => <option key={item}>{item}</option>)}</select></label></div><span className="mail-connection"><i className="signal-dot" />{config.sendingConfigured ? 'Siap menerima & mengirim' : 'Menerima · pengiriman belum aktif'}</span></div>
      <nav className="mail-folders" aria-label="Folder email">{folders.map(([key, label, icon]) => <button key={key} aria-current={folder === key ? 'page' : undefined} className={folder === key ? 'is-active' : ''} disabled={!!busy} onClick={() => { setFolder(key); setNotice(''); }}><span aria-hidden="true">{icon}</span>{label}</button>)}</nav>
      <div className="mail-workspace">
        <section className={'mail-list-panel ' + (selected || reading ? 'has-reader' : '')} aria-label="Daftar email">
          <div className="mail-search"><label><span className="sr-only">Cari email</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari subjek, alamat, pesan…" /></label><button aria-label="Muat ulang email" disabled={loading || !!busy} onClick={() => load()}>↻</button></div>
          <div className="mail-list-heading"><strong>{folders.find(([key]) => key === folder)?.[1]}</strong><span>{items.length} dimuat</span></div>
          <div className="mail-message-list">
            {loading && !items.length ? <p className="mail-empty" role="status">Memuat email…</p> : !items.length && <div className="mail-empty"><span>{query ? 'Tidak ada hasil pada bagian ini.' : 'Belum ada email di bagian ini.'}</span>{cursor && <small>Muat lebih banyak untuk melanjutkan pencarian.</small>}</div>}
            {items.map((item) => <button key={item.id} className={'mail-row ' + (!item.read ? 'is-unread ' : '') + (selected?.id === item.id ? 'is-selected' : '')} onClick={() => openMessage(item)}><span className="mail-row-top"><strong>{folder === 'sent' || folder === 'drafts' ? item.to.join(', ') || 'Tanpa penerima' : item.from}</strong><time>{dateText(item.createdAt)}</time></span><span className="mail-row-subject">{item.starred && <i>★</i>}{item.subject || '(Tanpa subjek)'}</span><span className="mail-row-preview">{item.preview || '—'}</span><span className="mail-row-bottom">{['accepted', 'sending', 'uncertain', 'failed', 'draft'].includes(item.status) && <small>{statusText(item.status)}</small>}{item.attachmentCount > 0 && <small>{item.attachmentCount} lampiran</small>}{!item.read && <i className="mail-unread-dot" aria-label="Belum dibaca" />}</span></button>)}
          </div>
          {cursor && <button className="mail-load-more" disabled={loading} onClick={() => load(true)}>{loading ? 'Memuat…' : 'Muat lebih banyak'}</button>}
        </section>
        <article className="mail-reader" aria-label="Isi email">
          {reading ? <div className="mail-reader-empty" role="status">Membuka email…</div> : !selected ? <div className="mail-reader-empty"><span className="mail-empty-icon">↗</span><h2>Ruang untuk percakapan.</h2><p>Pilih email untuk membaca, membalas, atau mengelola pesan.</p><small>{mailbox}</small></div> : <>
            <div className="mail-reader-actions"><button className="mail-back mail-button" onClick={() => { selectionGeneration.current++; setSelected(undefined); }}>← Kembali</button><button className="mail-button" disabled={!!busy || ['sending', 'uncertain'].includes(selected.status)} onClick={() => change({ starred: !selected.starred })}>{selected.starred ? '★ Starred' : '☆ Star'}</button><button className="mail-button" disabled={!!busy || ['sending', 'uncertain'].includes(selected.status)} onClick={() => change({ read: !selected.read })}>{selected.read ? 'Tandai belum dibaca' : 'Tandai dibaca'}</button>{selected.folder !== 'trash' ? <button className="mail-button" disabled={!!busy || ['sending', 'uncertain'].includes(selected.status)} onClick={() => change({ folder: 'trash' })}>Trash</button> : <><button className="mail-button" disabled={!!busy} onClick={() => change({ folder: selected.originalFolder || 'inbox' })}>Pulihkan</button><button className="mail-button mail-danger" disabled={!!busy} onClick={() => { if (window.confirm('Hapus permanen email dan lampirannya?')) void run('delete', async () => { await service.remove(mailbox, selected.id); setSelected(undefined); await load(); }); }}>Hapus permanen</button></>}</div>
            <header className="mail-reader-header"><span className="mail-status">{statusText(selected.status)}</span><h2>{selected.subject || '(Tanpa subjek)'}</h2><dl><div><dt>From</dt><dd className="mail-address-with-avatar"><MailboxAvatar address={selected.from} size="sm" /><span>{selected.fromName && selected.fromName + ' · '}{selected.from}</span></dd></div><div><dt>To</dt><dd>{selected.to.join(', ') || '—'}</dd></div><div><dt>Date</dt><dd>{dateText(selected.sentAt || selected.createdAt)}</dd></div></dl></header>
            {selected.sendError && <p className="document-error">{selected.sendError}</p>}
            {selected.html && <div className="mail-body-toggle"><button aria-pressed={!html} onClick={() => setHtml(false)}>Teks</button><button aria-pressed={html} onClick={() => setHtml(true)}>{Capacitor.isNativePlatform() ? 'Lihat Desain' : 'Tampilan HTML'}</button><small>Gambar eksternal diblokir.</small></div>}
            {html && selected.html ? <iframe className={'mail-html'+(Capacitor.isNativePlatform() ? ' mail-html-native' : '')} title="Konten HTML email" sandbox="" referrerPolicy="no-referrer" srcDoc={htmlDocument(selected.html)} /> : <div className="mail-text">{selected.text || (selected.html ? 'Email ini hanya berisi HTML. Pilih Tampilan HTML untuk membacanya.' : '(Pesan kosong)')}</div>}
            {!!selected.attachments.length && <div className="mail-attachments"><h3>Attachments</h3>{selected.attachments.map((file) => <button key={file.id} disabled={!!busy} onClick={() => run('download', async () => downloadMailFile(await service.file(mailbox, selected.id, file.id), file.filename))}><span>↓</span><strong>{file.filename}</strong><small>{bytesText(file.size)}</small></button>)}</div>}
            <footer className="mail-reader-footer">{selected.folder === 'drafts' ? <button className="primary-button" disabled={!!busy} onClick={() => editDraft(selected)}>Lanjutkan draft ↗</button> : selected.folder !== 'trash' && selected.status === 'received' ? <button className="primary-button" disabled={!!busy} onClick={() => begin({ ...blank(), to: [selected.replyTo?.[0] || selected.from], subject: /^re:/i.test(selected.subject) ? selected.subject : 'Re: ' + selected.subject, text: '\n\n—\n' + selected.from + ' wrote:\n' + selected.text.split('\n').map((line) => '> ' + line).join('\n'), inReplyTo: selected.messageId, references: [selected.references, selected.messageId].filter(Boolean).join(' ').slice(-2000) })}>Balas email ↗</button> : null}{['sending', 'uncertain'].includes(selected.status) && <button className="mail-button" disabled={!!busy || !config.sendingConfigured} onClick={() => run('retry', async () => { const result = await service.send(mailbox, selected.id); setSelected(result); setNotice(result.status === 'accepted' ? 'Email diterima Resend.' : result.sendError || 'Periksa status pengiriman.'); await load(); })}>Periksa / coba ulang</button>}{selected.hasRaw && <button className="mail-button" disabled={!!busy} onClick={() => run('raw', async () => downloadMailFile(await service.file(mailbox, selected.id), 'email.eml'))}>Unduh email asli</button>}</footer>
          </>}
        </article>
      </div>
    </>}
    {compose && <dialog ref={composeRef} className="mail-compose" aria-labelledby="mail-compose-title" onCancel={(event) => { event.preventDefault(); closeCompose(); }}><form onSubmit={(event) => { event.preventDefault(); void run('send', () => save(true)); }}><header><div className="mail-compose-identity"><MailboxAvatar address={mailbox} size="lg" /><div><small>{mailbox}</small><h2 id="mail-compose-title">{draft.inReplyTo ? 'Balas email' : 'Pesan baru'}</h2></div></div><button type="button" aria-label="Tutup editor email" disabled={!!busy} onClick={closeCompose}>×</button></header>{error && <p className="document-error" role="alert">{error}</p>}<div className="mail-branding-note"><span>{branded ? (draft.billing ? 'Template billing · Ringkasan dokumen dan footer Nalaro otomatis.' : 'Template Nalaro · Branding dan footer otomatis.' + (draft.inReplyTo ? ' Banner disertakan pada balasan.' : ' Banner disertakan.')) : 'Email pribadi · Tanpa template branding.'}</span>{branded && <button type="button" className="mail-button" aria-expanded={preview} onClick={() => setPreview((value) => !value)}>{preview ? 'Tutup pratinjau' : 'Pratinjau email'}</button>}</div>{previewHTML && <iframe className="mail-template-preview" title="Pratinjau template email Nalaro" sandbox="" referrerPolicy="no-referrer" srcDoc={previewHTML} />}<fieldset disabled={!!busy}><label><span>To</span><input type="text" aria-label="Penerima email" value={to} onChange={(event) => { dirty.current = true; setTo(event.target.value); }} placeholder="client@example.com" autoFocus /><small>Pisahkan beberapa alamat dengan koma.</small></label><label><span>Subject</span><input aria-label="Subjek email" maxLength={300} value={draft.subject} onChange={(event) => updateDraft('subject', event.target.value)} placeholder="Tentang pekerjaan berikutnya…" /></label><label className="mail-compose-body"><span>Message</span><textarea aria-label="Isi pesan" maxLength={200000} rows={12} value={draft.text} onChange={(event) => updateDraft('text', event.target.value)} placeholder="Halo," /></label><div className="mail-compose-files">{draft.attachments.map((file, index) => <span key={index}><strong>{file.filename}</strong><button type="button" aria-label={'Hapus lampiran ' + file.filename} onClick={() => { dirty.current = true; setDraft((value) => ({ ...value, attachments: value.attachments.filter((_, position) => index !== position) })); }}>×</button></span>)}<label><span>+ Lampiran</span><input aria-label="Tambah lampiran" type="file" multiple onChange={(event) => { void addFiles(event.target.files); event.target.value = ''; }} /></label><small>Total maksimal 8 MB.</small></div></fieldset><footer><button type="button" className="mail-button" disabled={!!busy} onClick={() => run('save', () => save(false))}>{busy === 'save' ? 'Menyimpan…' : 'Simpan draft'}</button><button className="primary-button" disabled={!!busy || !config?.sendingConfigured}>{busy === 'send' ? 'Mengirim…' : 'Kirim email ↗'}</button></footer></form></dialog>}
  </section>;
}

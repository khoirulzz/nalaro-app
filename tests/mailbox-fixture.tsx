import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import Mailbox from '../src/components/react/Mailbox';
import '../src/styles/tokens.css';
import '../src/styles/admin.css';
import type { MailMessage, MailboxService } from '../src/lib/mailbox';

const messages: MailMessage[] = [
  { id: '8999999999999-' + 'a'.repeat(32), mailbox: 'hello@nalaro.digital', folder: 'inbox', from: 'client@example.com', fromName: 'Client Nalaro', to: ['hello@nalaro.digital'], subject: 'Penawaran website untuk proyek Nalaro dengan judul yang cukup panjang', text: 'Halo Nalaro,\n\nMohon informasi penawaran website. Terima kasih.', preview: 'Halo Nalaro, mohon informasi penawaran website.', createdAt: '2026-10-07T10:00:00Z', updatedAt: '2026-10-07T10:00:00Z', status: 'received', read: false, starred: false, attachmentCount: 2,
    attachments: [{ id: 'file1', filename: 'Kebutuhan-proyek-Nalaro-dokumen-lampiran.pdf', contentType: 'application/pdf', size: 12000 }, { id: 'image1', filename: 'logo.png', contentType: 'image/png', contentId: 'logo.platform@example.com', size: 70 }], messageId: '<client@example.com>', hasRaw: true, replyTo: ['reply@example.com'],
    html: '<h1>Proposal Nalaro</h1><script>window.parent.pwned=true</script><img src="https://tracker.invalid/pixel"><img src="cid:logo.platform@example.com" alt="Logo inline"><p onclick="window.parent.pwned=true">Isi email HTML aman</p><iframe src="https://tracker.invalid/frame"></iframe>' },
  { id: '8999999999998-' + 'b'.repeat(32), mailbox: 'hello@nalaro.digital', folder: 'drafts', from: 'hello@nalaro.digital', to: ['client@example.com'], subject: 'Draft penawaran', text: 'Halo, berikut penawaran kami.', preview: 'Halo, berikut penawaran kami.', createdAt: '2026-10-07T09:00:00Z', updatedAt: '2026-10-07T09:00:00Z', status: 'draft', read: true, starred: false, attachments: [], attachmentCount: 0 },
];
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const find = (mailbox: string, id: string) => { const result = messages.find((message) => message.id === id && message.mailbox === mailbox); if (!result) throw new Error('Email tidak ditemukan.'); return result; };
const service: MailboxService = {
  config: async () => ({ mailboxes: ['hello@nalaro.digital', 'billing@nalaro.digital'], sendingConfigured: true, senderName: 'Nalaro', maxAttachmentBytes: 8 * 1048576 }),
  list: async (mailbox, folder, search) => ({ items: copy(messages.filter((message) => message.mailbox === mailbox && (folder === 'starred' ? message.starred && message.folder !== 'trash' : message.folder === folder) && message.subject.toLowerCase().includes(search.toLowerCase()))), cursor: null }),
  get: async (mailbox, id) => copy(find(mailbox, id)),
  save: async (mailbox, draft, id) => {
    let value: MailMessage;
    if (id) value = find(mailbox, id);
    else { value = { ...copy(messages[1]), id: '8999999999997-' + crypto.randomUUID().replaceAll('-', ''), mailbox, folder: 'drafts', status: 'draft', attachments: [] }; messages.push(value); }
    Object.assign(value, { ...draft, attachments: draft.attachments.map((file, index) => ({ id: 'draft-file-' + index, filename: file.filename, contentType: file.contentType, size: file.content.length * 0.75 })), attachmentCount: draft.attachments.length, preview: draft.text.slice(0, 80) });
    return copy(value);
  },
  send: async (mailbox, id) => { const value = find(mailbox, id); value.folder = 'sent'; value.status = 'accepted'; return copy(value); },
  patch: async (mailbox, id, fields) => { const value = find(mailbox, id); if (fields.folder === 'trash') value.originalFolder = value.folder; Object.assign(value, fields); return copy(value); },
  remove: async (mailbox, id) => { messages.splice(messages.indexOf(find(mailbox, id)), 1); },
  file: async (_mailbox, _id, attachmentId) => attachmentId === 'image1'
    ? new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))], { type: 'image/png' })
    : new Blob(['%PDF-test-fixture'], { type: 'application/pdf' }),
};
createRoot(document.getElementById('root')!).render(<BrowserRouter><Mailbox service={service} configured={!window.location.search.includes('unconfigured')} /></BrowserRouter>);

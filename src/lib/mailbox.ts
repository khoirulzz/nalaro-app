import { Capacitor } from '@capacitor/core';
import { saveDocument } from '../platform/files';
import { auth } from './firebase';
import type { BillingEmailDetails } from './email-template';

export type MailFolder = 'inbox' | 'sent' | 'drafts' | 'trash' | 'starred';
export interface MailAttachment { id: string; filename: string; contentType: string; size: number; }
export interface OutgoingAttachment { filename: string; contentType: string; content: string; }
export interface MailSummary {
  id: string; mailbox: string; folder: Exclude<MailFolder, 'starred'>; originalFolder?: Exclude<MailFolder, 'starred'>;
  from: string; to: string[]; subject: string; preview: string; createdAt: string; updatedAt: string;
  read: boolean; starred: boolean; status: 'draft' | 'received' | 'accepted' | 'sending' | 'uncertain' | 'failed'; attachmentCount: number;
}
export interface MailMessage extends MailSummary {
  billing?: BillingEmailDetails;
  text: string; html?: string; fromName?: string; replyTo?: string[]; messageId?: string; references?: string;
  inReplyTo?: string; attachments: MailAttachment[]; hasRaw?: boolean; sendError?: string; sentAt?: string; resendId?: string;
}
export interface MailDraft { to: string[]; subject: string; text: string; attachments: OutgoingAttachment[]; inReplyTo?: string; references?: string; billing?: BillingEmailDetails; }
export interface MailConfig { mailboxes: string[]; senderName: string; sendingConfigured: boolean; maxAttachmentBytes: number; }
export interface MailboxService {
  config(): Promise<MailConfig>;
  list(mailbox: string, folder: MailFolder, search: string, cursor?: string): Promise<{ items: MailSummary[]; cursor: string | null }>;
  get(mailbox: string, id: string): Promise<MailMessage>;
  save(mailbox: string, draft: MailDraft, id?: string): Promise<MailMessage>;
  send(mailbox: string, id: string): Promise<MailMessage>;
  patch(mailbox: string, id: string, value: { read?: boolean; starred?: boolean; folder?: string }): Promise<MailMessage>;
  remove(mailbox: string, id: string): Promise<void>;
  file(mailbox: string, id: string, attachmentId?: string): Promise<Blob>;
}

const DEFAULT_MAILBOX_API_URL = Capacitor.isNativePlatform() ? 'https://mail-api.nalaro.digital' : 'https://nalaro-mailbox.uniquefactuhl.workers.dev';
const mailboxApiRoot = () => import.meta.env.PUBLIC_MAILBOX_API_URL?.trim() || DEFAULT_MAILBOX_API_URL;

export const MAILBOX_CONFIGURED = !!mailboxApiRoot();
function apiUrl(path: string, values: Record<string, string> = {}) {
  const root = new URL(mailboxApiRoot());
  if (root.protocol !== 'https:' && !(root.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(root.hostname))) throw new Error('Alamat layanan mailbox harus memakai HTTPS.');
  const url = new URL('/api/mail' + path, root.origin);
  Object.entries(values).forEach(([key, value]) => { if (value) url.searchParams.set(key, value); });
  return url;
}
async function request(path: string, values: Record<string, string> = {}, method = 'GET', body?: unknown): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error('Login admin diperlukan.');
  const perform = async (refresh: boolean) => fetch(apiUrl(path, values), {
    method, cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(20000), headers: {
      Authorization: 'Bearer ' + await user.getIdToken(refresh), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let response: Response;
  try { response = await perform(false); if (response.status === 401) response = await perform(true); }
  catch (error) {
    if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error('Mail Desk tidak merespons dalam 20 detik. Periksa koneksi internet.');
    }
    const detail = error instanceof Error ? (error.name + ': ' + error.message).slice(0,160) : 'Tidak diketahui';
    const origin = typeof window === 'undefined' ? 'unknown' : window.location.origin;
    throw new Error('Mail Desk tidak dapat diakses dari ' + origin + ' ke ' + apiUrl(path, values).hostname +
      '. Kemungkinan gangguan jaringan atau CORS. Detail: ' + detail);
  }
  if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.error || 'Permintaan mailbox gagal.'); }
  return response;
}
async function json(path: string, values = {}, method = 'GET', body?: unknown) { return (await request(path, values, method, body)).json(); }
export const mailboxService: MailboxService = {
  config: () => json('/config'),
  list: (mailbox, folder, q, cursor = '') => json('/messages', { mailbox, folder, q, cursor }),
  get: async (mailbox, id) => (await json('/messages/' + id, { mailbox })).message,
  save: async (mailbox, draft, id) => (await json(id ? '/messages/' + id : '/drafts', { mailbox }, id ? 'PUT' : 'POST', draft)).message,
  send: async (mailbox, id) => (await json('/messages/' + id + '/send', { mailbox }, 'POST')).message,
  patch: async (mailbox, id, value) => (await json('/messages/' + id, { mailbox }, 'PATCH', value)).message,
  remove: async (mailbox, id) => { await json('/messages/' + id, { mailbox }, 'DELETE'); },
  file: async (mailbox, id, attachmentId) => (await request('/messages/' + id + (attachmentId ? '/attachments/' + attachmentId : '/raw'), { mailbox })).blob(),
};
export async function outgoingFile(file: Blob, filename: string): Promise<OutgoingAttachment> {
  if (file.size > 8 * 1024 * 1024) throw new Error('Total lampiran maksimal 8 MB.');
  const content = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Lampiran tidak dapat dibaca.')); reader.readAsDataURL(file);
  });
  return { filename, contentType: file.type || 'application/octet-stream', content };
}
export async function downloadMailFile(blob: Blob, filename: string) {
  if (Capacitor.isNativePlatform()) { await saveDocument(filename, blob); return; }
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}

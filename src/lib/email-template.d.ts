export interface BillingEmailDetails {
  kind: 'invoice' | 'receipt'; number: string; project: string; amount: number; outstanding: number;
  status: 'unpaid' | 'paid' | 'partial' | 'cancelled'; date: string; relatedInvoice?: string; verificationToken?: string;
}
export const EMAIL_ASSET_ORIGIN: string;
export const EMAIL_BANNER_URL: string;
export function isBrandedMailbox(address: string): boolean;
export function renderOutgoingEmail(message: { from: string; subject: string; text: string; billing?: BillingEmailDetails; inReplyTo?: string; year?: number }): { text: string; html?: string };

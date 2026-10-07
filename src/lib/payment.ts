export const PAYMENT_METHODS = ['Bank Transfer', 'QRIS', 'Cash', 'E-Wallet', 'Other'] as const;

export function paymentInformation(method: unknown, settings: any = {}) {
  const name = String(method || 'Bank Transfer');
  const normalized = name.trim().toLowerCase();
  if (normalized === 'cash' || normalized === 'tunai') return { method: name, kind: 'cash', lines: [] as string[], qrisImage: '' };
  if (normalized === 'qris') return {
    method: name, kind: 'qris',
    lines: [settings.qrisMerchantName || settings.businessName || 'Nalaro', settings.qrisImage ? 'QRIS statis. Masukkan nominal sesuai tagihan.' : 'Hubungi Nalaro untuk kode QRIS pembayaran.'],
    qrisImage: String(settings.qrisImage || ''),
  };
  if (normalized === 'bank transfer' || normalized === 'transfer') return {
    method: name, kind: 'bank',
    lines: settings.bankName && settings.accountNumber
      ? [String(settings.bankName), 'No. rekening: ' + settings.accountNumber, ...(settings.accountHolder ? ['a.n. ' + settings.accountHolder] : [])]
      : ['Hubungi Nalaro untuk informasi rekening pembayaran.'],
    qrisImage: '',
  };
  if (normalized === 'e-wallet') return {
    method: name, kind: 'wallet',
    lines: settings.walletName && settings.walletNumber
      ? [String(settings.walletName), 'Nomor: ' + settings.walletNumber, ...(settings.walletHolder ? ['a.n. ' + settings.walletHolder] : [])]
      : ['Hubungi Nalaro untuk informasi e-wallet pembayaran.'],
    qrisImage: '',
  };
  return { method: name, kind: 'other', lines: [settings.otherPaymentInfo || 'Informasi pembayaran mengikuti kesepakatan dengan Nalaro.'], qrisImage: '' };
}

export function documentPaymentInformation(document: any, settings: any) {
  // Issued documents retain the destination selected at issue/payment time.
  return document.paymentDetails || paymentInformation(document.paymentMethod, settings);
}

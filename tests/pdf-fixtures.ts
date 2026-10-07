import { buildInvoicePDF, buildReceiptPDF, generateInvoicePDF, generateReceiptPDF, verificationQr } from '../src/lib/pdf';
import { verificationBaseUrl, verificationToken, verificationUrl } from '../src/lib/verification';
import { paymentInformation, documentPaymentInformation } from '../src/lib/payment';
import jsQR from 'jsqr';
import QRCode from 'qrcode';

const token = '12345678901234567890';
const client = { name: 'Pemerintah Desa Contoh', picName: 'Bapak Petugas Administrasi', address: 'Jalan Raya Contoh No. 10, Kecamatan Contoh, Kabupaten Pekalongan' };
const project = { name: 'Pembuatan Website Desa dan Layanan Administrasi Digital', projectNumber: 'NAL/PRJ/2026/123456' };
const settings = { businessName: 'Nalaro', ownerName: 'Muhamad Khoirul Ulum', website: 'https://www.nalaro.one', bankName: 'BANK CONTOH', accountNumber: '000123456789', accountHolder: 'Penerima Contoh', qrisMerchantName: 'NALARO DEMO', walletName: 'Wallet Contoh', walletNumber: '081234567890', walletHolder: 'Penerima Contoh' };
const invoice = { invoiceNumber: 'NAL/INV/2026/TEST', publicToken: token, issueDate: '2026-10-06', dueDate: '2026-10-20', items: [{ description: 'Website Development', details: 'Desain dan implementasi website desa.', quantity: 1, unitPrice: 2500000, total: 2500000 }], subtotal: 2500000, grandTotal: 2500000, paymentMethod: 'Bank Transfer' };
const receipt = { receiptNumber: 'NAL/RCPT/2026/TEST', relatedInvoice: invoice.invoiceNumber, publicToken: token, paymentDate: '2026-10-06', amount: 2500000, paymentMethod: 'Bank Transfer', paymentReference: 'REF-123456' };

const api = {
  invoice, receipt, client, project, settings,
  async pdf(kind: 'invoice' | 'receipt', method = 'Bank Transfer', long = false) {
    const config = { ...settings, qrisImage: await QRCode.toDataURL('DEMO PAYMENT - NOT A REAL QRIS', { margin: 4, width: 400 }) };
    const record: any = { ...(kind === 'invoice' ? invoice : receipt), paymentMethod: method };
    const customer = long ? { ...client, name: client.name.repeat(10), address: client.address.repeat(20), picName: client.picName.repeat(5) } : client;
    const job = long ? { ...project, name: project.name.repeat(20) } : project;
    if (long) {
      record.notes = 'CATATAN LENGKAP ' + 'Pekerjaan disepakati secara tertulis dan dilaksanakan bertahap. '.repeat(200) + ' AKHIR CATATAN';
      record.paymentReference = 'REFERENSI PANJANG '.repeat(40);
      if (kind === 'invoice') record.items = Array.from({ length: 25 }, (_, index) => ({ description: 'Layanan nomor ' + index, details: 'Deskripsi lengkap layanan dan ruang lingkup yang harus tetap terbaca. '.repeat(index === 0 ? 150 : 4) + ' AKHIR ITEM ' + index, quantity: 1, unitPrice: 100000, total: 100000 }));
    }
    const doc = await (kind === 'invoice' ? buildInvoicePDF : buildReceiptPDF)(record, customer, job, config);
    return { pages: doc.getNumberOfPages(), pdf: doc.output('datauristring') };
  },
  async checks() {
    const origin = window.location.origin;
    const expected = origin + '/verifi/' + token;
    const actual = verificationUrl(token, { verificationBaseUrl: 'https://e-invoice.nalaro.digital/verif/' });
    if (actual !== expected) throw new Error('Legacy URL migration failed');
    if (verificationBaseUrl({ verificationBaseUrl: 'https://registry.example' }) !== 'https://registry.example/verifi/') throw new Error('Explicit base URL failed');
    if (verificationToken({ pathname: '/verifi/' + token + '/', search: '' }) !== token) throw new Error('Path token failed');
    if (verificationToken({ pathname: '/verifi/', search: '?token=' + token }) !== token) throw new Error('Query token failed');
    if (verificationUrl('') !== '') throw new Error('Missing token creates a misleading QR');
    for (const invalid of ['javascript:alert(1)', 'https://user:password@example.com/verifi/', 'https://example.com/verifi/?token=bad']) {
      let failed = false; try { verificationBaseUrl({ verificationBaseUrl: invalid }); } catch { failed = true; }
      if (!failed) throw new Error('Invalid verification URL accepted');
    }
    if (paymentInformation('Cash', settings).lines.length || paymentInformation('Cash', settings).qrisImage) throw new Error('Cash contains payment destination');
    const snapshot = paymentInformation('Bank Transfer', settings);
    if (documentPaymentInformation({ paymentDetails: snapshot }, { bankName: 'CHANGED' }).lines[0] !== 'BANK CONTOH') throw new Error('Issued payment destination changed');
    const logo = await new Promise<string>((resolve) => { const img = new Image(); img.onload = () => { const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height; canvas.getContext('2d')!.drawImage(img, 0, 0); resolve(canvas.toDataURL()); }; img.src = '/android-chrome-192x192.png'; });
    for (const size of [600, 300, 180, 160]) {
      const image = new Image(); image.src = await verificationQr(expected, logo); await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, size, size);
      const pixels = context.getImageData(0, 0, size, size);
      if (jsQR(pixels.data, size, size)?.data !== expected) throw new Error('Logo QR cannot be decoded at ' + size + 'px');
    }
    // Also exercise the production host and longer tokens, not only localhost.
    for (const url of ['https://order.nalaro.digital/verifi/' + token, 'https://order.nalaro.digital/verifi/' + 'a'.repeat(32)]) {
      const image = new Image(); image.src = await verificationQr(url, logo); await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 160;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, 160, 160);
      if (jsQR(context.getImageData(0, 0, 160, 160).data, 160, 160)?.data !== url) throw new Error('Production QR cannot be decoded');
    }
    return { expected, qrSizes: [600, 300, 180, 160] };
  },
};
(window as any).testAPI = api;
for (const [id, fn, data] of [['invoice', generateInvoicePDF, invoice], ['receipt', generateReceiptPDF, receipt]] as const) {
  document.getElementById(id)!.onclick = async () => {
    try { await fn(data, client, project, settings); document.getElementById('result')!.textContent = 'OK'; }
    catch (error) { document.getElementById('result')!.textContent = String(error); }
  };
}

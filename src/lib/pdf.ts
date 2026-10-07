import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { documentPaymentInformation } from './payment';
import { verificationUrl } from './verification';
import { brandContact, NALARO_WEBSITE } from './brand';

const INK: [number, number, number] = [28, 29, 27];
const MUTED: [number, number, number] = [117, 118, 114];
const LINE: [number, number, number] = [221, 221, 216];
const PAPER: [number, number, number] = [244, 244, 241];
const FLARE: [number, number, number] = [255, 91, 46];
const GREEN: [number, number, number] = [27, 128, 74];
const WHITE: [number, number, number] = [255, 255, 255];
const LEFT = 16;
const RIGHT = 194;
const WIDTH = RIGHT - LEFT;
const PUBLIC_SITE = NALARO_WEBSITE;

const money = (value: unknown = 0) => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
}).format(Number(value) || 0);

const text = (value: unknown) => String(value ?? '').trim();
const safeFileName = (value: string) => value.replace(/[\\/:*?"<>|\x00-\x1F]/g, '-');

function dateText(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

async function imageFromUrl(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Gambar dokumen tidak dapat dimuat.');
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Gambar dokumen tidak dapat dibaca.'));
    reader.readAsDataURL(blob);
  });
}

async function watermarkFromLogo(logo: string) {
  if (!logo) return '';
  try {
    const image = new Image();
    image.src = logo;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const context = canvas.getContext('2d');
    if (!context) return '';
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const r = pixels.data[i];
      const g = pixels.data[i + 1];
      const b = pixels.data[i + 2];
      const a = pixels.data[i + 3];
      const light = (r + g + b) / 3;
      // Flatten onto white instead of a very faint alpha mask: PDF viewers
      // differ in soft-mask rendering. The logo silhouette stays visible.
      const coverage = a > 0 && light > 145 ? a / 255 : 0;
      pixels.data[i] = Math.round(255 - 37 * coverage);
      pixels.data[i + 1] = Math.round(255 - 37 * coverage);
      pixels.data[i + 2] = Math.round(255 - 40 * coverage);
      pixels.data[i + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.94);
  } catch {
    return '';
  }
}

/** High error correction + larger Nalaro centre mark while preserving scanability. */
export async function verificationQr(url: string, logo?: string) {
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, url, {
    errorCorrectionLevel: 'H',
    margin: 4,
    width: 384,
    color: { dark: '#1c1d1b', light: '#ffffff' },
  });

  if (logo) {
    try {
      const image = new Image();
      image.src = logo;
      await image.decode();
      const context = canvas.getContext('2d');
      if (context) {
        const box = canvas.width * 0.16;
        const mark = canvas.width * 0.13;
        const icon = canvas.width * 0.12;
        context.fillStyle = '#ffffff';
        context.fillRect((canvas.width - box) / 2, (canvas.height - box) / 2, box, box);
        context.fillStyle = '#1c1d1b';
        context.fillRect((canvas.width - mark) / 2, (canvas.height - mark) / 2, mark, mark);
        context.drawImage(image, (canvas.width - icon) / 2, (canvas.height - icon) / 2, icon, icon);
      }
    } catch {
      // Plain QR remains valid if the logo cannot be decoded.
    }
  }
  return canvas.toDataURL('image/png');
}

type Assets = { logo: string; watermark: string };

function createDoc(title: string, number: string) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
    putOnlyUsedFonts: true,
    precision: 2,
  });
  doc.setProperties({ title: title + ' ' + number, author: 'Nalaro', creator: 'NalaroTrans' });
  return doc;
}

function setText(doc: jsPDF, size: number, style: 'normal' | 'bold' = 'normal', color: [number, number, number] = INK) {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
}

function line(doc: jsPDF, y: number) {
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.25);
  doc.line(LEFT, y, RIGHT, y);
}

function fitLines(doc: jsPDF, value: unknown, width: number, maxLines = 4, startSize = 9.4, minSize = 7.2) {
  const raw = text(value) || '—';
  let size = startSize;
  doc.setFontSize(size);
  let lines = doc.splitTextToSize(raw, width) as string[];
  while (lines.length > maxLines && size > minSize) {
    size -= 0.4;
    doc.setFontSize(size);
    lines = doc.splitTextToSize(raw, width) as string[];
  }
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    const last = String(lines[maxLines - 1] || '').replace(/[. ]+$/, '');
    lines[maxLines - 1] = last + '…';
  }
  return { lines, size, height: Math.max(1, lines.length) * 4.1 };
}

function drawLabel(doc: jsPDF, label: string, x: number, y: number, align: 'left' | 'right' = 'left') {
  setText(doc, 6.8, 'normal', MUTED);
  doc.text(label.toUpperCase(), x, y, { align });
}

function drawValue(doc: jsPDF, value: unknown, x: number, y: number, width: number, options: { bold?: boolean; maxLines?: number; size?: number; color?: [number, number, number] } = {}) {
  setText(doc, options.size || 9.4, options.bold === false ? 'normal' : 'bold', options.color || INK);
  const fitted = fitLines(doc, value, width, options.maxLines || 4, options.size || 9.4);
  setText(doc, fitted.size, options.bold === false ? 'normal' : 'bold', options.color || INK);
  doc.text(fitted.lines, x, y);
  return fitted.height;
}

function drawHeader(doc: jsPDF, assets: Assets, title: string, status: string, settings: any = {}) {
  doc.setFillColor(...PAPER);
  doc.rect(0, 0, 210, 39, 'F');
  doc.setFillColor(...FLARE);
  doc.rect(0, 38.4, 210, 0.8, 'F');

  doc.setFillColor(...INK);
  doc.roundedRect(16, 10.5, 18, 18, 3.2, 3.2, 'F');
  if (assets.logo) {
    try { doc.addImage(assets.logo, 'PNG', 18.4, 12.9, 13.2, 13.2, 'brand-logo', 'FAST'); } catch { /* wordmark stays visible */ }
  }

  setText(doc, 19.5, 'bold', INK);
  doc.text('NALARO', 39, 20.2);
  setText(doc, 6.8, 'normal', MUTED);
  doc.text(brandContact(settings).website, 39, 26.1);

  setText(doc, 20, 'bold', FLARE);
  const titleCenter = RIGHT - doc.getTextWidth(title) / 2;
  doc.text(title, titleCenter, 19.2, { align: 'center' });

  const pill = String(status || '').trim().toUpperCase();
  const unpaid = ['UNPAID', 'PARTIALLY PAID', 'OVERDUE'].includes(pill);
  setText(doc, 6.3, 'bold', unpaid ? INK : WHITE);
  const pillWidth = Math.max(20, doc.getTextWidth(pill) + 10);
  doc.setFillColor(...(pill === 'PAID' ? GREEN : unpaid ? FLARE : INK));
  doc.roundedRect(titleCenter - pillWidth / 2, 22.6, pillWidth, 7.3, 3.2, 3.2, 'F');
  doc.text(pill, titleCenter, 27.5, { align: 'center' });
}

function drawWatermark(doc: jsPDF, assets: Assets, y = 118) {
  if (!assets.watermark) return;
  try { doc.addImage(assets.watermark, 'JPEG', 67, y, 76, 76, 'brand-watermark', 'FAST'); } catch { /* decorative only */ }
}

function drawFooter(doc: jsPDF, message: string, settings: any = {}) {
  line(doc, 277);
  setText(doc, 6.6, 'normal', MUTED);
  doc.text('Nalaro', LEFT, 284);
  doc.text(message, 105, 284, { align: 'center' });
  doc.text(brandContact(settings).email, RIGHT, 284, { align: 'right' });
  setText(doc, 6.4, 'normal', MUTED);
  doc.text(PUBLIC_SITE, 105, 290, { align: 'center' });
  doc.link(86, 286.5, 38, 5.5, { url: PUBLIC_SITE });
}

function drawMeta(doc: jsPDF, fields: Array<{ label: string; value: unknown; x: number; width: number; align?: 'left' | 'right' }>) {
  for (const field of fields) {
    drawLabel(doc, field.label, field.x, 58.4, field.align || 'left');
    setText(doc, 9.5, 'bold', INK);
    doc.text(text(field.value) || '—', field.x, 65.1, { align: field.align || 'left', maxWidth: field.width });
  }
  line(doc, 74);
}

function paymentRows(payment: any) {
  const rows: Array<[string, string]> = [];
  const lines = (payment.lines || []).map((value: unknown) => String(value));
  if (payment.kind === 'bank') {
    if (lines[0]) rows.push(['Bank', lines[0]]);
    const account = lines.find((item: string) => item.toLowerCase().startsWith('no. rekening:'));
    const holder = lines.find((item: string) => item.toLowerCase().startsWith('a.n.'));
    if (account) rows.push(['Account no.', account.split(':').slice(1).join(':').trim()]);
    if (holder) rows.push(['Account name', holder.replace(/^a\.n\.\s*/i, '')]);
  } else if (payment.kind === 'wallet') {
    if (lines[0]) rows.push(['E-wallet', lines[0]]);
    const number = lines.find((item: string) => item.toLowerCase().startsWith('nomor:'));
    const holder = lines.find((item: string) => item.toLowerCase().startsWith('a.n.'));
    if (number) rows.push(['Number', number.split(':').slice(1).join(':').trim()]);
    if (holder) rows.push(['Account name', holder.replace(/^a\.n\.\s*/i, '')]);
  } else if (payment.kind === 'other') {
    rows.push(['Information', lines.join(' ') || '—']);
  } else if (payment.kind === 'qris') {
    if (lines[0]) rows.push(['Merchant', lines[0]]);
  }
  return rows;
}

function drawPaymentDetails(doc: jsPDF, documentData: any, settings: any, y: number) {
  const payment = documentPaymentInformation(documentData, settings || {});
  drawLabel(doc, 'Payment details', LEFT, y);
  setText(doc, 9.4, 'bold', INK);
  doc.text(payment.method || documentData.paymentMethod || '—', LEFT, y + 7);

  if (payment.kind === 'cash') return y + 18;

  if (payment.kind === 'qris' && payment.qrisImage) {
    try {
      const info = doc.getImageProperties(payment.qrisImage);
      const size = 33;
      doc.addImage(payment.qrisImage, info.fileType, LEFT, y + 11, size, size, 'payment-qris', 'FAST');
      const rows = paymentRows(payment);
      let rowY = y + 16;
      for (const [label, value] of rows) {
        drawLabel(doc, label, 54, rowY);
        drawValue(doc, value, 79, rowY, 61, { size: 8.2, maxLines: 2 });
        rowY += 8;
      }
      return y + 49;
    } catch {
      throw new Error('Gambar QRIS tidak valid. Unggah ulang PNG/JPG di Pengaturan.');
    }
  }

  let rowY = y + 16;
  for (const [label, value] of paymentRows(payment)) {
    drawLabel(doc, label, LEFT, rowY);
    drawValue(doc, value, 46, rowY, 82, { size: 8.4, maxLines: 2 });
    rowY += 8;
  }
  if (documentData.paymentReference) {
    drawLabel(doc, 'Reference', LEFT, rowY);
    drawValue(doc, documentData.paymentReference, 46, rowY, 82, { size: 8.2, maxLines: 2 });
    rowY += 8;
  }
  return Math.max(y + 25, rowY);
}

async function drawVerification(doc: jsPDF, token: unknown, settings: any, assets: Assets, y: number) {
  const url = verificationUrl(token, settings || {});
  const size = 36;
  const x = RIGHT - size;
  setText(doc, 6.1, 'normal', MUTED);
  const label = doc.splitTextToSize('Scan to verify the transaction', size);
  doc.text(label, x + size / 2, y, { align: 'center', lineHeightFactor: 1.15 });
  if (!url) {
    setText(doc, 7.2, 'normal', MUTED);
    doc.text('Verification unavailable', RIGHT, y + 10, { align: 'right' });
    return;
  }
  const qr = await verificationQr(url, assets.logo);
  doc.addImage(qr, 'PNG', x, y + 7, size, size, 'verification-qr', 'FAST');
  doc.link(x, y + 7, size, size, { url });
}

async function createAssets() {
  let logo = '';
  try { logo = await imageFromUrl('/android-chrome-192x192.png'); } catch { /* text-only fallback */ }
  return { logo, watermark: await watermarkFromLogo(logo) };
}

function partyBlock(doc: jsPDF, leftLabel: string, leftLines: unknown[], rightLabel: string, rightLines: unknown[], y = 88) {
  drawLabel(doc, leftLabel, LEFT, y);
  drawLabel(doc, rightLabel, 108, y);

  const leftPrimary = leftLines.filter(Boolean);
  const rightPrimary = rightLines.filter(Boolean);
  let leftY = y + 7;
  let rightY = y + 7;

  if (leftPrimary[0]) leftY += drawValue(doc, leftPrimary[0], LEFT, leftY, 82, { size: 9.2, maxLines: 2 }) + 1;
  for (const value of leftPrimary.slice(1)) {
    leftY += drawValue(doc, value, LEFT, leftY, 82, { bold: false, size: 8.7, maxLines: 1 }) + 1;
  }

  if (rightPrimary[0]) rightY += drawValue(doc, rightPrimary[0], 108, rightY, 86, { size: 9.2, maxLines: 3 }) + 1;
  for (const value of rightPrimary.slice(1)) {
    rightY += drawValue(doc, value, 108, rightY, 86, { bold: false, size: 8.7, maxLines: 2 }) + 1;
  }

  const bottom = Math.max(111, leftY + 5, rightY + 5);
  line(doc, bottom);
  return bottom;
}

export async function buildReceiptPDF(receipt: any, client: any, project: any, settings: any = {}) {
  const assets = await createAssets();
  const doc = createDoc('Payment Receipt', receipt.receiptNumber || '');
  drawHeader(doc, assets, 'PAYMENT RECEIPT', 'PAID', settings);
  drawWatermark(doc, assets, 116);

  drawMeta(doc, [
    { label: 'Receipt no.', value: receipt.receiptNumber, x: LEFT, width: 58 },
    { label: 'Invoice no.', value: receipt.relatedInvoice, x: 84, width: 62 },
    { label: 'Payment date', value: dateText(receipt.paymentDate), x: RIGHT, width: 42, align: 'right' },
  ]);

  const partyBottom = partyBlock(
    doc,
    'Received from',
    [client?.name || receipt.clientName, client?.picName],
    'Received by',
    [settings?.businessName || 'Nalaro', settings?.ownerName || 'Muhamad Khoirul Ulum'],
  );

  let y = partyBottom + 12;
  drawLabel(doc, 'Payment summary', LEFT, y);
  y += 5;

  doc.setFillColor(...INK);
  doc.rect(LEFT, y, WIDTH, 8.8, 'F');
  setText(doc, 6.7, 'bold', WHITE);
  doc.text('DESCRIPTION', LEFT + 5, y + 5.7);
  doc.text('INVOICE REF.', 121, y + 5.7);
  doc.text('AMOUNT', RIGHT - 4, y + 5.7, { align: 'right' });

  const rowTop = y + 8.8;
  const description = project?.name || receipt.projectName || 'Payment';
  const subDescription = client?.name || receipt.clientName || project?.serviceType || '';
  const desc = fitLines(doc, description, 91, 2, 9.5);
  const sub = subDescription ? fitLines(doc, subDescription, 91, 2, 8.2) : { lines: [], size: 8.2, height: 0 };
  const rowHeight = Math.max(21, desc.height + sub.height + 8);

  drawValue(doc, description, LEFT + 5, rowTop + 8, 91, { size: 9.5, maxLines: 2 });
  if (subDescription) drawValue(doc, subDescription, LEFT + 5, rowTop + 8 + desc.height, 91, { bold: false, size: 8.2, color: MUTED, maxLines: 2 });
  drawValue(doc, receipt.relatedInvoice, 121, rowTop + 8, 42, { bold: false, size: 8.4, maxLines: 2 });
  setText(doc, 9.4, 'bold', INK);
  doc.text(money(receipt.amount), RIGHT - 4, rowTop + 8, { align: 'right' });
  line(doc, rowTop + rowHeight);

  const amountY = rowTop + rowHeight + 13;
  doc.setFillColor(...PAPER);
  doc.rect(LEFT, amountY, WIDTH, 31.5, 'F');
  doc.setFillColor(...FLARE);
  doc.rect(LEFT, amountY, 1.4, 31.5, 'F');
  drawLabel(doc, 'Amount received', LEFT + 8, amountY + 10);
  setText(doc, 24, 'bold', FLARE);
  doc.text(money(receipt.amount), LEFT + 8, amountY + 23);
  setText(doc, 7.6, 'normal', MUTED);
  const paidVia = 'Received in full via ' + String(receipt.paymentMethod || 'payment').toLowerCase();
  doc.text(paidVia, RIGHT - 5, amountY + 22, { align: 'right', maxWidth: 72 });

  const detailsY = amountY + 49;
  line(doc, detailsY - 10);
  drawPaymentDetails(doc, receipt, settings, detailsY);
  await drawVerification(doc, receipt.publicToken, settings, assets, detailsY);

  drawFooter(doc, 'Thank you for your payment.', settings);
  return doc;
}

export async function buildInvoicePDF(invoice: any, client: any, project: any, settings: any = {}) {
  const assets = await createAssets();
  const doc = createDoc('Invoice', invoice.invoiceNumber || '');
  const status = String(invoice.status || 'unpaid').replaceAll('_', ' ').toUpperCase();
  drawHeader(doc, assets, 'INVOICE', status, settings);
  drawWatermark(doc, assets, 118);

  drawMeta(doc, [
    { label: 'Invoice no.', value: invoice.invoiceNumber, x: LEFT, width: 58 },
    { label: 'Issue date', value: dateText(invoice.issueDate), x: 91, width: 44 },
    { label: 'Due date', value: dateText(invoice.dueDate), x: RIGHT, width: 42, align: 'right' },
  ]);

  const partyBottom = partyBlock(
    doc,
    'Billed to',
    [client?.name || invoice.clientName, client?.picName, client?.address, client?.email],
    'Issued by',
    [settings?.businessName || 'Nalaro', settings?.ownerName || 'Muhamad Khoirul Ulum'],
  );

  let y = partyBottom + 12;
  drawLabel(doc, 'Invoice summary', LEFT, y);
  y += 5;

  doc.setFillColor(...INK);
  doc.rect(LEFT, y, WIDTH, 8.8, 'F');
  setText(doc, 6.5, 'bold', WHITE);
  doc.text('DESCRIPTION', LEFT + 5, y + 5.7);
  doc.text('QTY', 126, y + 5.7, { align: 'center' });
  doc.text('UNIT PRICE', 158, y + 5.7, { align: 'right' });
  doc.text('AMOUNT', RIGHT - 4, y + 5.7, { align: 'right' });

  const items = Array.isArray(invoice.items) && invoice.items.length ? invoice.items : [{
    description: project?.name || invoice.projectName || 'Service',
    details: project?.description || '',
    quantity: 1,
    unitPrice: invoice.subtotal || invoice.grandTotal || 0,
    total: invoice.subtotal || invoice.grandTotal || 0,
  }];

  let rowY = y + 8.8;
  let visibleCount = 0;
  for (const item of items.slice(0, 3)) {
    let maxLines = 2;
    let titleFit = fitLines(doc, item.description || 'Service', 94, maxLines, 9.1);
    let detailFit = item.details ? fitLines(doc, item.details, 94, maxLines, 7.8) : { lines: [], size: 7.8, height: 0 };
    let rowHeight = Math.max(18, titleFit.height + detailFit.height + 6);
    // Reserve the complete payment/verification block above the footer.
    if (rowY + rowHeight > 169) {
      if (visibleCount) break;
      maxLines = 1;
      titleFit = fitLines(doc, item.description || 'Service', 94, maxLines, 9.1);
      detailFit = item.details ? fitLines(doc, item.details, 94, maxLines, 7.8) : { lines: [], size: 7.8, height: 0 };
      rowHeight = 18;
    }
    drawValue(doc, item.description || 'Service', LEFT + 5, rowY + 7, 94, { size: 9.1, maxLines });
    if (item.details) drawValue(doc, item.details, LEFT + 5, rowY + 7 + titleFit.height, 94, { bold: false, size: 7.8, color: MUTED, maxLines });
    setText(doc, 8.5, 'normal', INK);
    doc.text(String(item.quantity ?? 1), 126, rowY + 7, { align: 'center' });
    doc.text(money(item.unitPrice), 158, rowY + 7, { align: 'right' });
    setText(doc, 8.8, 'bold', INK);
    doc.text(money(item.total ?? Number(item.quantity ?? 1) * Number(item.unitPrice || 0)), RIGHT - 4, rowY + 7, { align: 'right' });
    rowY += rowHeight;
    line(doc, rowY);
    visibleCount++;
  }

  if (items.length > visibleCount) {
    setText(doc, 6.4, 'normal', MUTED);
    doc.text('+ ' + (items.length - visibleCount) + ' item(s) in the transaction record', RIGHT, y - 5, { align: 'right' });
  }

  const totalY = rowY + 12;
  doc.setFillColor(...PAPER);
  doc.rect(LEFT, totalY, WIDTH, 31.5, 'F');
  doc.setFillColor(...FLARE);
  doc.rect(LEFT, totalY, 1.4, 31.5, 'F');
  drawLabel(doc, 'Total due', LEFT + 8, totalY + 10);
  setText(doc, 24, 'bold', FLARE);
  doc.text(money(invoice.grandTotal), LEFT + 8, totalY + 23);
  setText(doc, 7.4, 'normal', MUTED);
  const paid = Number(invoice.paidAmount || 0);
  const outstanding = Number(invoice.outstandingAmount ?? Math.max(0, Number(invoice.grandTotal || 0) - paid));
  doc.text('Paid: ' + money(paid), RIGHT - 5, totalY + 15, { align: 'right' });
  doc.text('Outstanding: ' + money(outstanding), RIGHT - 5, totalY + 22, { align: 'right' });

  const detailsY = totalY + 49;
  line(doc, detailsY - 10);
  drawPaymentDetails(doc, invoice, settings, detailsY);
  await drawVerification(doc, invoice.publicToken, settings, assets, detailsY);

  if (invoice.notes) {
    const note = fitLines(doc, invoice.notes, WIDTH, 1, 6.8, 6.2);
    setText(doc, note.size, 'normal', MUTED);
    doc.text(note.lines, LEFT, totalY + 36);
  }

  drawFooter(doc, 'Thank you for your business.', settings);
  return doc;
}

export async function generateInvoicePDF(invoice: any, client: any, project: any, settings: any) {
  const doc = await buildInvoicePDF(invoice, client, project, settings);
  await doc.save(safeFileName(invoice.invoiceNumber || 'Nalaro-Invoice') + '.pdf', { returnPromise: true });
}

export async function generateReceiptPDF(receipt: any, client: any, project: any, settings: any) {
  const doc = await buildReceiptPDF(receipt, client, project, settings);
  await doc.save(safeFileName(receipt.receiptNumber || 'Nalaro-Receipt') + '.pdf', { returnPromise: true });
}

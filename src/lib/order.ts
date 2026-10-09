export const SERVICE_TYPES = ['Website Development', 'Landing Page', 'Custom Information System', 'Maintenance', 'Hosting', 'Domain', 'Nalaro Product', 'Other'] as const;

export const EMPTY_ORDER = { name: '', picName: '', email: '', whatsapp: '', address: '', projectName: '', serviceType: 'Website Development', deadline: '' };
export type OrderInput = typeof EMPTY_ORDER;

export function orderRecords(input: OrderInput, id: string, timestamp: unknown, receivedDate: string) {
  const data = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, value.trim()])) as OrderInput;
  if (!data.name || data.name.length > 120 || !data.picName || data.picName.length > 120
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || data.email.length > 254
    || !/^[+0-9 ()-]{8,24}$/.test(data.whatsapp) || data.address.length > 500
    || !data.projectName || data.projectName.length > 160
    || !SERVICE_TYPES.includes(data.serviceType as typeof SERVICE_TYPES[number])
    || (data.deadline && (!/^\d{4}-\d{2}-\d{2}$/.test(data.deadline) || data.deadline < receivedDate))) {
    throw new Error('Periksa kembali informasi klien, kontak, dan tanggal target proyek.');
  }
  const shared = { source: 'public_order', orderId: id, createdAt: timestamp, updatedAt: timestamp };
  return {
    client: { ...shared, name: data.name, picName: data.picName, email: data.email, whatsapp: data.whatsapp, address: data.address, status: 'active', notes: '', clientCode: 'CLI-' + id.slice(0, 12).toUpperCase(), projectId: id },
    project: { ...shared, name: data.projectName, clientId: id, clientName: data.name, serviceType: data.serviceType, receivedDate, deadline: data.deadline, status: 'planning', value: 0, description: '', projectNumber: 'NAL/PRJ/' + receivedDate.slice(0, 4) + '/' + id.slice(0, 12).toUpperCase() },
  };
}

export function localDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

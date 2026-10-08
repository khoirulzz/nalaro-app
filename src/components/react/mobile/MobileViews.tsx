import React from 'react';
import { NavLink } from 'react-router-dom';

export default function MobileFinance() {
  return (
    <section className="admin-page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow"><span>Finance</span></p>
          <h1>Keuangan</h1>
        </div>
      </header>
      <div className="mobile-menu-list">
        <NavLink to="/invoices" className="mobile-menu-item">
          <strong>Invoices</strong>
          <span>Tagihan proyek ↗</span>
        </NavLink>
        <NavLink to="/receipts" className="mobile-menu-item">
          <strong>Receipts</strong>
          <span>Kuitansi pembayaran ↗</span>
        </NavLink>
      </div>
    </section>
  );
}

export function MobileMore({ logout }: { logout: () => void }) {
  return (
    <section className="admin-page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow"><span>More</span></p>
          <h1>Lainnya</h1>
        </div>
      </header>
      <div className="mobile-menu-list">
        <NavLink to="/clients" className="mobile-menu-item">
          <strong>Clients</strong>
          <span>Klien dan kontak ↗</span>
        </NavLink>
        <NavLink to="/archive" className="mobile-menu-item">
          <strong>Archive</strong>
          <span>Arsip dokumen ↗</span>
        </NavLink>
        <NavLink to="/settings" className="mobile-menu-item">
          <strong>Settings</strong>
          <span>Pengaturan dan identitas ↗</span>
        </NavLink>
        <button onClick={logout} className="mobile-menu-item text-left text-red-500">
          <strong>Keluar (Logout)</strong>
        </button>
      </div>
    </section>
  );
}

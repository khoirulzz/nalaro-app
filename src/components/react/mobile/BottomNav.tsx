import React from 'react';
import { NavLink } from 'react-router-dom';

export default function BottomNav() {
  return (
    <nav className="mobile-bottom-nav">
      <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
        <div className="icon">🏠</div>
        <span>Home</span>
      </NavLink>
      <NavLink to="/projects" className={({ isActive }) => (isActive ? 'active' : '')}>
        <div className="icon">📂</div>
        <span>Projects</span>
      </NavLink>
      <NavLink to="/finance" className={({ isActive }) => (isActive ? 'active' : '')}>
        <div className="icon">💰</div>
        <span>Finance</span>
      </NavLink>
      <NavLink to="/email" className={({ isActive }) => (isActive ? 'active' : '')}>
        <div className="icon">✉️</div>
        <span>Mail</span>
      </NavLink>
      <NavLink to="/more" className={({ isActive }) => (isActive ? 'active' : '')}>
        <div className="icon">☰</div>
        <span>More</span>
      </NavLink>
    </nav>
  );
}

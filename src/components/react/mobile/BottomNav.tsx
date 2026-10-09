import React from 'react';
import { NavLink } from 'react-router-dom';
type IconName = 'home' | 'projects' | 'finance' | 'mail' | 'more';
function Icon({name}:{name:IconName}) {
  const parts = {
    home:<><path d="m3.7 10.2 8.3-6.6 8.3 6.6v9a1.6 1.6 0 0 1-1.6 1.6h-4.3v-6.2H9.6v6.2H5.3a1.6 1.6 0 0 1-1.6-1.6z"/><path d="M9.6 20.8v-6.2h4.8v6.2"/></>,
    projects:<><rect x="3.6" y="5.3" width="16.8" height="15.2" rx="2.4"/><path d="M8 5.3V3.6h8v1.7M3.6 11.2h16.8M10.2 11.2v2h3.6v-2"/></>,
    finance:<><rect x="3.2" y="5" width="17.6" height="14.4" rx="2.7"/><path d="M3.2 9h17.6M16.8 14.3h-3.2M7.1 14.4h2.4"/></>,
    mail:<><rect x="3" y="5.2" width="18" height="13.6" rx="2.2"/><path d="m3.8 6.7 8.2 6.6 8.2-6.6"/><path d="M7 17h4"/></>,
    more:<><circle cx="5.2" cy="6.1" r="1.4"/><circle cx="5.2" cy="12" r="1.4"/><circle cx="5.2" cy="17.9" r="1.4"/><path d="M9 6.1h10M9 12h10M9 17.9h10"/></>,
  };
  return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{parts[name]}</svg>;
}
const links: {to:string;label:string;icon:IconName;end?:boolean}[] = [
  {to:'/',label:'Home',icon:'home',end:true},
  {to:'/projects',label:'Projects',icon:'projects'},
  {to:'/finance',label:'Finance',icon:'finance'},
  {to:'/email',label:'Mail',icon:'mail'},
  {to:'/more',label:'More',icon:'more'},
];
export default function BottomNav() {
  return <nav className="mobile-bottom-nav" aria-label="Navigasi utama Nalaro">
    {links.map(link=><NavLink key={link.to} to={link.to} end={link.end} className={({isActive})=>isActive?'active':''}>
      <span className="icon"><Icon name={link.icon}/></span><span>{link.label}</span>
    </NavLink>)}
  </nav>;
}

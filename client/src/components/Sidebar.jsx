import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Play,
  FileText,
  KeyRound,
  ScrollText,
  LogOut,
  Briefcase,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useState } from 'react';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/automate', icon: Play, label: 'Automate' },
  { to: '/logs', icon: ScrollText, label: 'Logs' },
  { to: '/credentials', icon: KeyRound, label: 'Credentials' },
  { to: '/resume', icon: FileText, label: 'Resume' },
];

/* ─── Desktop / Tablet Sidebar ─────────────────────────────────── */
const Sidebar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/auth');
  };

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────── */}
      <aside
        className={`desktop-sidebar flex flex-col h-screen border-r border-border transition-all duration-300 shrink-0 relative ${
          collapsed ? 'w-16' : 'w-60'
        }`}
        style={{
          background: 'linear-gradient(180deg, #0e1628 0%, #0a1020 60%, #060d18 100%)',
        }}
      >
        {/* ── Logo ──────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-border shrink-0">
          {/* Icon with blue glow */}
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: 'linear-gradient(135deg, #1d4ed8 0%, #4f46e5 100%)',
              boxShadow: '0 0 16px rgba(59,130,246,0.45), 0 0 32px rgba(99,102,241,0.2)',
            }}
          >
            <Briefcase size={16} className="text-white" />
          </div>

          {!collapsed && (
            <div className="animate-in min-w-0">
              <div className="flex items-baseline gap-1.5 leading-none">
                <span
                  className="font-bold text-lg tracking-tight"
                  style={{ color: '#e2e8f0' }}
                >
                  Jobbie
                </span>
                {/* 2.O with continuous blue shimmer */}
                <span className="sidebar-version">2.O</span>
              </div>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(148,163,184,0.55)' }}>
                Job Automation
              </p>
            </div>
          )}
        </div>

        {/* ── Collapse toggle ────────────────────────────────── */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-[52px] z-10 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200"
          style={{
            background: '#131d30',
            border: '1px solid rgba(59,130,246,0.25)',
            color: 'rgba(148,163,184,0.7)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.6)'; e.currentTarget.style.color = '#93c5fd'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.25)'; e.currentTarget.style.color = 'rgba(148,163,184,0.7)'; }}
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>

        {/* ── Nav ───────────────────────────────────────────── */}
        <nav className="flex-1 px-2 py-4 flex flex-col gap-0.5 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                isActive ? 'nav-item-active' : 'nav-item'
              }
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span className="animate-in truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* ── User / Logout ──────────────────────────────────── */}
        <div
          className="px-2 pb-4 pt-4 shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          {!collapsed && (
            <div className="px-3 py-2 mb-1 animate-in rounded-lg" style={{ background: 'rgba(59,130,246,0.05)' }}>
              <p className="text-sm font-medium truncate" style={{ color: '#e2e8f0' }}>
                {user?.name}
              </p>
              <p className="text-xs truncate mt-0.5" style={{ color: 'rgba(148,163,184,0.5)' }}>
                {user?.email}
              </p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="nav-item w-full"
            title={collapsed ? 'Logout' : undefined}
            style={{ color: 'rgba(248,113,113,0.8)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = '#fca5a5'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'rgba(248,113,113,0.8)'; }}
          >
            <LogOut size={18} className="shrink-0" />
            {!collapsed && <span className="animate-in">Logout</span>}
          </button>
        </div>
      </aside>

      {/* ── Mobile bottom nav ───────────────────────────────── */}
      <nav className="mobile-nav">
        {navItems.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname === to;
          return (
            <NavLink
              key={to}
              to={to}
              className={`mobile-nav-item${isActive ? ' active' : ''}`}
            >
              <Icon size={20} />
              <span>{label}</span>
            </NavLink>
          );
        })}
        <button
          onClick={handleLogout}
          className="mobile-nav-item"
          style={{ color: 'rgba(248,113,113,0.8)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <LogOut size={20} />
          <span>Logout</span>
        </button>
      </nav>
    </>
  );
};

export default Sidebar;

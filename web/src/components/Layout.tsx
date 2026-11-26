import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  BookOpen, CalendarDays, Camera, ClipboardCheck, FileBarChart, GraduationCap,
  LayoutDashboard, LogOut, Menu, ShieldCheck, UserCog, Users, History, ScrollText, X,
} from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useToast } from './ui';

type NavItem = { to: string; label: string; icon: ReactNode };

const navByRole = {
  admin: [
    { to: '/admin', label: 'نظرة عامة', icon: <LayoutDashboard size={19} /> },
    { to: '/admin/users', label: 'إدارة الحسابات', icon: <UserCog size={19} /> },
    { to: '/admin/structure', label: 'الأقسام والمراحل', icon: <GraduationCap size={19} /> },
    { to: '/admin/subjects', label: 'المواد الدراسية', icon: <BookOpen size={19} /> },
    { to: '/admin/attendance', label: 'سجلات الحضور', icon: <ClipboardCheck size={19} /> },
    { to: '/admin/reports', label: 'التقارير', icon: <FileBarChart size={19} /> },
    { to: '/admin/audit', label: 'سجل العمليات', icon: <ScrollText size={19} /> },
  ],
  doctor: [
    { to: '/doctor', label: 'نظرة عامة', icon: <LayoutDashboard size={19} /> },
    { to: '/doctor/schedule', label: 'جدول المحاضرات', icon: <CalendarDays size={19} /> },
    { to: '/doctor/students', label: 'الطلاب', icon: <Users size={19} /> },
    { to: '/doctor/reports', label: 'التقارير', icon: <FileBarChart size={19} /> },
  ],
  student: [
    { to: '/student', label: 'الرئيسية', icon: <LayoutDashboard size={19} /> },
    { to: '/student/history', label: 'سجل الحضور', icon: <History size={19} /> },
    { to: '/student/file', label: 'ملفي الأكاديمي', icon: <ClipboardCheck size={19} /> },
  ],
} satisfies Record<string, NavItem[]>;

const roleLabels = { admin: 'مدير النظام', doctor: 'دكتور', student: 'طالب' };

export default function Layout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { user, logout } = useAuth();
  const { show } = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const items = user ? navByRole[user.role] : [];

  const handleLogout = async () => {
    await logout();
    show('تم تسجيل الخروج', 'info');
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell">
      {open && <button className="sidebar-overlay" onClick={() => setOpen(false)} aria-label="إغلاق القائمة" />}
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><ShieldCheck size={24} /></div>
          <div>
            <strong>نظام الحضور</strong>
            <span>الجامعي الذكي</span>
          </div>
          <button className="icon-btn mobile-only" onClick={() => setOpen(false)} aria-label="إغلاق"><X size={20} /></button>
        </div>
        <nav>
          <span className="nav-label">القائمة الرئيسية</span>
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/admin' || item.to === '/doctor' || item.to === '/student'}
              onClick={() => setOpen(false)}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              {item.icon}<span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <Camera size={16} />
          <span>التحقق بالكاميرا فعّال</span>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={() => setOpen(true)} aria-label="القائمة"><Menu size={22} /></button>
          <div className="topbar-title">
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div className="user-box">
            <div className="avatar">{(user?.fullName || user?.username || 'م').charAt(0)}</div>
            <div className="user-meta">
              <strong>{user?.fullName || user?.username}</strong>
              <span>{user ? roleLabels[user.role] : ''}</span>
            </div>
            <button className="icon-btn" onClick={handleLogout} title="تسجيل الخروج"><LogOut size={19} /></button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

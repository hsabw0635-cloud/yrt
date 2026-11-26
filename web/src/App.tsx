import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './AuthContext';
import Layout from './components/Layout';
import { Loading } from './components/ui';
import LoginPage, { homePath } from './pages/LoginPage';

import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminStructure from './pages/admin/AdminStructure';
import AdminSubjects from './pages/admin/AdminSubjects';
import AdminAttendance from './pages/admin/AdminAttendance';
import AdminAudit from './pages/admin/AdminAudit';

import DoctorDashboard from './pages/doctor/DoctorDashboard';
import DoctorSchedule from './pages/doctor/DoctorSchedule';
import DoctorSessionPage from './pages/doctor/DoctorSessionPage';
import DoctorStudents from './pages/doctor/DoctorStudents';

import StudentDashboard from './pages/student/StudentDashboard';
import ProfileSetup from './pages/student/ProfileSetup';
import StudentHistory from './pages/student/StudentHistory';
import StudentFilePage from './pages/StudentFilePage';
import ReportsPage from './pages/ReportsPage';

import type { Role } from './types';

function Protected({ roles, requireProfile = false, children }: { roles: Role[]; requireProfile?: boolean; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={homePath(user)} replace />;
  if (requireProfile && !user.profileCompleted) return <Navigate to="/student/profile" replace />;
  return <>{children}</>;
}

function Shell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return <Layout title={title} subtitle={subtitle}>{children}</Layout>;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return <Navigate to={user ? homePath(user) : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<HomeRedirect />} />

      <Route path="/admin" element={<Protected roles={['admin']}><Shell title="لوحة التحكم" subtitle="إدارة النظام"><AdminDashboard /></Shell></Protected>} />
      <Route path="/admin/users" element={<Protected roles={['admin']}><Shell title="إدارة الحسابات"><AdminUsers /></Shell></Protected>} />
      <Route path="/admin/structure" element={<Protected roles={['admin']}><Shell title="الهيكل الأكاديمي"><AdminStructure /></Shell></Protected>} />
      <Route path="/admin/subjects" element={<Protected roles={['admin']}><Shell title="المواد الدراسية"><AdminSubjects /></Shell></Protected>} />
      <Route path="/admin/attendance" element={<Protected roles={['admin']}><Shell title="سجلات الحضور"><AdminAttendance /></Shell></Protected>} />
      <Route path="/admin/reports" element={<Protected roles={['admin']}><Shell title="التقارير"><ReportsPage role="admin" /></Shell></Protected>} />
      <Route path="/admin/audit" element={<Protected roles={['admin']}><Shell title="سجل العمليات"><AdminAudit /></Shell></Protected>} />
      <Route path="/admin/students/:id" element={<Protected roles={['admin']}><Shell title="ملف الطالب"><StudentFilePage endpoint={`/admin/students/${window.location.pathname.split('/').pop()}`} /></Shell></Protected>} />

      <Route path="/doctor" element={<Protected roles={['doctor']}><Shell title="لوحة الدكتور"><DoctorDashboard /></Shell></Protected>} />
      <Route path="/doctor/schedule" element={<Protected roles={['doctor']}><Shell title="جدول المحاضرات"><DoctorSchedule /></Shell></Protected>} />
      <Route path="/doctor/sessions/:id" element={<Protected roles={['doctor']}><Shell title="تسجيل الحضور"><DoctorSessionPage /></Shell></Protected>} />
      <Route path="/doctor/students" element={<Protected roles={['doctor']}><Shell title="الطلاب"><DoctorStudents /></Shell></Protected>} />
      <Route path="/doctor/students/:id" element={<Protected roles={['doctor']}><Shell title="ملف الطالب"><StudentFilePage endpoint={`/doctor/students/${window.location.pathname.split('/').pop()}`} /></Shell></Protected>} />
      <Route path="/doctor/reports" element={<Protected roles={['doctor']}><Shell title="التقارير"><ReportsPage role="doctor" /></Shell></Protected>} />

      <Route path="/student/profile" element={<Protected roles={['student']}><Shell title="الملف الشخصي"><ProfileSetup /></Shell></Protected>} />
      <Route path="/student" element={<Protected roles={['student']} requireProfile><Shell title="الصفحة الرئيسية"><StudentDashboard /></Shell></Protected>} />
      <Route path="/student/history" element={<Protected roles={['student']} requireProfile><Shell title="سجل الحضور"><StudentHistory /></Shell></Protected>} />
      <Route path="/student/file" element={<Protected roles={['student']} requireProfile><Shell title="ملفي الأكاديمي"><StudentFilePage endpoint="/student/academic-file" title="ملفي الأكاديمي" /></Shell></Protected>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, CalendarDays, ClipboardCheck, DoorOpen, LockKeyhole, Trash2 } from 'lucide-react';
import api, { errorMessage } from '../../api';
import { useAuth } from '../../AuthContext';
import { useLiveEvents } from '../../hooks';
import { Card, EmptyState, Loading, PageHeader, StatCard, useToast } from '../../components/ui';
import LectureCard from '../../components/LectureCard';
import type { LectureSession } from '../../types';

interface DashboardData {
  subjects: Array<Record<string, string>>;
  today: LectureSession[];
  upcoming: LectureSession[];
  recent: Array<Record<string, string>>;
  stats: { total: number; present: number; absent: number; sessions: number };
}

export default function DoctorDashboard() {
  const { show } = useToast();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    api.get('/doctor/dashboard').then(({ data }) => setData(data)).catch((error) => show(errorMessage(error), 'error'));
  }, [show]);
  useEffect(load, [load]);
  useLiveEvents(() => load());

  const toggle = async (session: LectureSession, action: 'open' | 'close') => {
    setBusy(session.sessionId);
    try {
      await api.post(`/doctor/sessions/${session.sessionId}/${action}`);
      show(action === 'open' ? 'تم فتح تسجيل الحضور 🟢' : 'تم إغلاق تسجيل الحضور 🔒', 'success');
      load();
    } catch (error) { show(errorMessage(error), 'error'); }
    finally { setBusy(null); }
  };

  const deleteAccount = async () => {
    if (!window.confirm('حذف حساب الدكتور نهائياً مع كل محاضراته وسجلات الحضور المرتبطة؟ لا يمكن التراجع.')) return;
    setDeleting(true);
    try {
      await api.delete('/doctor/account');
      setUser(null);
      show('تم حذف الحساب وبياناته المرتبطة', 'success');
      navigate('/login', { replace: true });
    } catch (error) { show(errorMessage(error), 'error'); }
    finally { setDeleting(false); }
  };

  if (!data) return <Loading />;
  return (
    <>
      <PageHeader title="لوحة الدكتور" subtitle="محاضرات اليوم، فتح تسجيل الحضور، ومتابعة الطلاب"
        actions={<Link className="btn btn-primary" to="/doctor/schedule">إضافة محاضرة</Link>} />
      <div className="grid grid-4">
        <StatCard label="محاضرات اليوم" value={data.stats.sessions} icon={<CalendarDays size={19} />} tone="navy" />
        <StatCard label="الطلاب المسجلون" value={data.stats.total} icon={<ClipboardCheck size={19} />} tone="teal" />
        <StatCard label="الحاضرون" value={data.stats.present} tone="teal" />
        <StatCard label="المواد المسندة" value={data.subjects.length} icon={<BookOpen size={19} />} tone="gold" />
      </div>

      <Card title="محاضرات اليوم" subtitle="اضغط فتح تسجيل الحضور ليظهر الزر للطلاب مباشرة" className="" >
        {data.today.length === 0 ? <EmptyState title="لا توجد محاضرات اليوم" description="راجع جدول المحاضرات مع الإدارة" /> : (
          <div className="grid grid-3" style={{ marginTop: 8 }}>
            {data.today.map((session) => (
              <LectureCard key={session.sessionId} session={session} variant="doctor"
                actions={<>
                  {session.status !== 'open' ? (
                    <button className="btn btn-teal btn-sm" disabled={busy === session.sessionId} onClick={() => toggle(session, 'open')}>
                      <DoorOpen size={14} /> فتح تسجيل الحضور
                    </button>
                  ) : (
                    <button className="btn btn-danger btn-sm" disabled={busy === session.sessionId} onClick={() => toggle(session, 'close')}>
                      <LockKeyhole size={14} /> إغلاق تسجيل الحضور
                    </button>
                  )}
                  <Link className="btn btn-primary btn-sm" to={`/doctor/sessions/${session.sessionId}`}>الحاضرون</Link>
                </>} />
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-2" style={{ marginTop: 18 }}>
        <Card title="المواد التي تدرسها">
          {data.subjects.length === 0 ? <EmptyState title="لا توجد مواد" /> : data.subjects.map((subject) => (
            <div key={subject.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
              <strong>{subject.name}</strong><br /><small style={{ color: 'var(--muted)' }}>{subject.code} — {subject.department_name} — {subject.level_name}</small>
            </div>
          ))}
        </Card>
        <Card title="المحاضرات القادمة">
          {data.upcoming.length === 0 ? <EmptyState title="لا توجد محاضرات قادمة" /> : data.upcoming.slice(0, 8).map((session) => (
            <div key={session.sessionId} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between' }}>
              <div><strong>{session.subject.name}</strong><br /><small style={{ color: 'var(--muted)' }}>{session.date} — {session.startTime}</small></div>
              <small>{session.classroom}</small>
            </div>
          ))}
        </Card>
      </div>

      <Card title="إدارة الحساب" subtitle="حذف حساب الدكتور يحذف كل محاضراته وسجلات حضوره نهائياً" style={{ marginTop: 18 }}>
        <button className="btn btn-danger" disabled={deleting} onClick={deleteAccount}>
          <Trash2 size={16} /> {deleting ? 'جارٍ الحذف...' : 'حذف حساب الدكتور'}
        </button>
      </Card>
    </>
  );
}

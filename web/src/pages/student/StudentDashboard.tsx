import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Camera, ClipboardCheck, TrendingUp } from 'lucide-react';
import api, { errorMessage } from '../../api';
import { useLiveEvents } from '../../hooks';
import { Badge, Card, EmptyState, Loading, PageHeader, ProgressBar, StatCard, useToast } from '../../components/ui';
import LectureCard from '../../components/LectureCard';
import CheckInModal from '../../components/CheckInModal';
import type { LectureSession } from '../../types';

export interface Profile { full_name: string; university_number: string; department_name: string; level_name: string; study_mode_label: string; profile_photo_id: number | null }
interface DashboardData { sessions: LectureSession[]; stats: { total: number; attended: number; absent: number; rate: number }; date: string }

export default function StudentDashboard() {
  const { show } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [active, setActive] = useState<LectureSession | null>(null);

  const load = useCallback(() => {
    api.get('/student/dashboard').then(({ data }) => setData(data)).catch((error) => show(errorMessage(error), 'error'));
    api.get('/student/profile').then(({ data }) => setProfile(data.profile)).catch(() => {});
  }, [show]);
  useEffect(load, [load]);
  useLiveEvents(() => load());

  if (!data) return <Loading />;
  return (
    <>
      <PageHeader title={`مرحباً، ${profile?.full_name || 'الطالب'}`} subtitle="نظرة على محاضرات اليوم وحضورك" />
      <Card>
        <div className="profile-strip">
          {profile?.profile_photo_id ? (
            <img className="profile-photo" src={`/api/attachments/${profile.profile_photo_id}`} alt="الصورة الشخصية" />
          ) : <div className="avatar" style={{ width: 64, height: 64, fontSize: 22 }}>{(profile?.full_name || 'ط').charAt(0)}</div>}
          <div className="profile-info">
            <h2>{profile?.full_name || '—'}</h2>
            <p>الرقم الجامعي: {profile?.university_number || '—'}</p>
            <div className="chips">
              <span className="chip">{profile?.department_name || '—'}</span>
              <span className="chip">{profile?.level_name || '—'}</span>
              <span className="chip">{profile?.study_mode_label || '—'}</span>
            </div>
          </div>
          <Link className="btn btn-ghost btn-sm" to="/student/file">عرض الملف الأكاديمي</Link>
        </div>
      </Card>

      <div className="grid grid-4" style={{ marginTop: 18 }}>
        <StatCard label="محاضرات اليوم" value={data.stats.total} icon={<CalendarDays size={19} />} tone="navy" />
        <StatCard label="سجلت حضور" value={data.stats.attended} icon={<ClipboardCheck size={19} />} tone="teal" />
        <StatCard label="غياب" value={data.stats.absent} tone="rose" />
        <StatCard label="نسبة الحضور" value={`${data.stats.rate}%`} icon={<TrendingUp size={19} />} tone="gold" />
      </div>

      <Card title="جدول محاضرات اليوم" subtitle={`${data.date} — تظهر المحاضرات حسب قسمك ومرحلتك ونوع دراستك`} className="" >
        <div style={{ marginBottom: 14, maxWidth: 320 }}><ProgressBar value={data.stats.rate} /></div>
        {data.sessions.length === 0 ? <EmptyState title="لا توجد محاضرات اليوم" description="استمتع بيومك الدراسي!" /> : (
          <div className="grid grid-3" style={{ marginTop: 8 }}>
            {data.sessions.map((session) => (
              <LectureCard key={session.sessionId} session={session} variant="student"
                actions={<>
                  {session.status === 'open' && (
                    <button className="btn btn-teal btn-sm" onClick={() => setActive(session)}><Camera size={14} /> تسجيل الحضور</button>
                  )}
                  {session.status === 'registered' && <Badge status="registered" />}
                </>} />
            ))}
          </div>
        )}
      </Card>
      <CheckInModal session={active} open={Boolean(active)} onClose={() => setActive(null)} onSuccess={load} />
    </>
  );
}

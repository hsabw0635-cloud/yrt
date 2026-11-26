import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, CalendarDays, ClipboardCheck, Trash2, UserCog } from 'lucide-react';
import api, { errorMessage } from '../../api';
import { Card, EmptyState, Loading, PageHeader, StatCard, useToast } from '../../components/ui';

export default function AdminDashboard() {
  const { show } = useToast();
  const [data, setData] = useState<{ stats: Record<string, number>; recent: Array<Record<string, string>> } | null>(null);
  const [cleaning, setCleaning] = useState(false);

  useEffect(() => {
    api.get('/admin/dashboard').then(({ data }) => setData(data)).catch((error) => show(errorMessage(error), 'error'));
  }, [show]);

  const cleanPhotos = async () => {
    if (!window.confirm('حذف كل صور الحضور الآن؟ ستبقى سجلات الحضور والمخالفات ودرجات المطابقة.')) return;
    setCleaning(true);
    try {
      const { data: result } = await api.post('/admin/cleanup/photos', { includeToday: true });
      show(`تم حذف ${result.files} صورة حضور`, 'success');
    } catch (error) { show(errorMessage(error), 'error'); }
    finally { setCleaning(false); }
  };

  if (!data) return <Loading />;
  const stats = data.stats;

  return (
    <>
      <PageHeader title="لوحة تحكم المدير" subtitle="نظرة شاملة على الحسابات والمحاضرات والحضور" />
      <div className="grid grid-4">
        <StatCard label="إجمالي المستخدمين" value={stats.users} icon={<UserCog size={19} />} tone="navy" />
        <StatCard label="الطلاب" value={stats.students} icon={<ClipboardCheck size={19} />} tone="teal" />
        <StatCard label="الدكاترة" value={stats.doctors} icon={<UserCog size={19} />} tone="gold" />
        <StatCard label="المواد" value={stats.subjects} icon={<BookOpen size={19} />} tone="rose" />
        <StatCard label="أقسام اليوم" value={stats.sessionsToday} icon={<CalendarDays size={19} />} tone="navy" />
        <StatCard label="حاضر اليوم" value={stats.presentToday} icon={<ClipboardCheck size={19} />} tone="teal" />
        <StatCard label="حسابات موقوفة" value={stats.disabledUsers} tone="rose" />
        <StatCard label="الأقسام" value={stats.departments} tone="gold" />
      </div>

      <div className="grid grid-2" style={{ marginTop: 18 }}>
        <Card title="آخر عمليات الحضور">
          {data.recent.length === 0 ? <EmptyState title="لا توجد سجلات بعد" /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>الطالب</th><th>المادة</th><th>التاريخ</th><th>الوقت</th></tr></thead>
                <tbody>{data.recent.map((item, index) => (
                  <tr key={index}><td>{item.student_name}</td><td>{item.subject_name}</td><td>{item.session_date}</td>
                    <td>{new Date(item.marked_at).toLocaleTimeString('ar')}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="وصول سريع">
          <div className="grid grid-2" style={{ gap: 12 }}>
            <Link className="btn btn-primary" to="/admin/users">إدارة الحسابات</Link>
            <Link className="btn btn-teal" to="/admin/subjects">المواد الدراسية</Link>
            <Link className="btn btn-ghost" to="/admin/attendance">مشاهدة الحضور</Link>
            <Link className="btn btn-gold" to="/admin/reports">التقارير</Link>
            <button className="btn btn-danger" disabled={cleaning} onClick={cleanPhotos}>
              <Trash2 size={16} /> {cleaning ? 'جارٍ التنظيف...' : 'تنظيف صور الحضور'}
            </button>
          </div>
        </Card>
      </div>
    </>
  );
}

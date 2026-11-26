import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, DoorOpen, LockKeyhole, Search, Trash2 } from 'lucide-react';
import api, { errorMessage } from '../../api';
import { useLiveEvents } from '../../hooks';
import { Badge, Card, EmptyState, Field, Loading, PageHeader, StatCard, useToast } from '../../components/ui';
import type { AttendanceStudent, LectureSession } from '../../types';

export default function DoctorSessionPage() {
  const { id } = useParams();
  const { show } = useToast();
  const [data, setData] = useState<{ session: LectureSession; students: AttendanceStudent[]; stats: { total: number; present: number; absent: number; pending: number; violations: number } } | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(() => {
    api.get(`/doctor/sessions/${id}/attendance`, { params: { search } })
      .then(({ data }) => setData(data))
      .catch((error) => show(errorMessage(error), 'error'))
      .finally(() => setLoading(false));
  }, [id, search, show]);
  useEffect(load, [load]);
  useLiveEvents((event) => {
    load();
    if (event === 'attendance:violation') show('تنبيه: طالب مخالف، صورته لا تطابق مكان المحاضرة', 'error');
    if (event === 'attendance:deleted') show('تم حذف حضور الطالب', 'success');
  });

  const removeAttendance = async (student: AttendanceStudent) => {
    const recordId = student.attendance?.id;
    if (!recordId) return;
    if (!window.confirm(`حذف حضور الطالب «${student.fullName}» من هذه المحاضرة؟ لا يمكن التراجع.`)) return;
    setDeletingId(recordId);
    try {
      await api.delete(`/reports/attendance/${recordId}`);
      show('تم حذف الحضور وصورته', 'success');
      load();
    } catch (error) { show(errorMessage(error), 'error'); }
    finally { setDeletingId(null); }
  };

  const toggle = async (action: 'open' | 'close') => {
    try {
      await api.post(`/doctor/sessions/${id}/${action}`);
      show(action === 'open' ? 'تم فتح التسجيل 🟢' : 'تم إغلاق التسجيل 🔒', 'success');
      load();
    } catch (error) { show(errorMessage(error), 'error'); }
  };

  if (loading) return <Loading />;
  if (!data) return <EmptyState title="المحاضرة غير موجودة" />;
  const { session, students, stats } = data;

  return (
    <>
      <PageHeader title={session.subject.name} subtitle={`${session.doctor.name} — ${session.date} — ${session.startTime} إلى ${session.endTime}`}
        actions={<>
          {session.status === 'open'
            ? <button className="btn btn-danger" onClick={() => toggle('close')}><LockKeyhole size={16} /> إغلاق تسجيل الحضور</button>
            : <button className="btn btn-teal" onClick={() => toggle('open')} disabled={session.status === 'expired'}><DoorOpen size={16} /> فتح تسجيل الحضور</button>}
        </>} />
      <div className="grid grid-4">
        <StatCard label="إجمالي الطلاب" value={stats.total} tone="navy" />
        <StatCard label="الحاضرون" value={stats.present} tone="teal" />
        <StatCard label="الغائبون" value={stats.absent} tone="rose" />
        <StatCard label="لم يسجلوا بعد" value={stats.pending} tone="gold" />
        <StatCard label="حالات مخالفة" value={stats.violations} tone="rose" />
      </div>

      <Card title="الطلاب المسجلون في المحاضرة" subtitle="يتم تحديث القائمة مباشرة عند تسجيل أي طالب" className="" >
        <div className="toolbar">
          <Field label="بحث باسم الطالب">
            <div className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="الاسم أو الرقم الجامعي" /></div>
          </Field>
          <Badge status={session.status} />
        </div>
        <div className="grid grid-3">
          {students.length === 0 ? <EmptyState title="لا يوجد طلاب مطابقون" /> : students.map((student) => {
            const violation = student.attendance?.verificationStatus === 'suspicious';
            return (
              <article className={`lecture-card ${violation ? 'violation' : ''}`} key={student.studentId}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {student.attendance?.photoAttachmentId ? (
                    <img src={`/api/attachments/${student.attendance.photoAttachmentId}`} alt={student.fullName} className="photo-thumb" style={{ width: 56, height: 56 }} />
                  ) : <div className="avatar">{student.fullName.charAt(0)}</div>}
                  <div style={{ flex: 1 }}>
                    <strong>{student.fullName}</strong>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{student.universityNumber}</div>
                  </div>
                  {violation
                    ? <span className="badge badge-danger"><AlertTriangle size={13} /> مخالف</span>
                    : <Badge status={student.status} />}
                </div>
                <div className="lecture-meta">
                  <div>{student.department} — {student.level} — {student.studyMode}</div>
                  {student.attendance ? <>
                    <div>وقت التسجيل: {new Date(student.attendance.markedAt).toLocaleTimeString('ar')}</div>
                    {violation && (
                      <div className="violation-note">
                        مكان الصورة لا يطابق صور زملاء المحاضرة
                        {student.attendance.sceneScore != null && ` — التطابق ${Math.round(student.attendance.sceneScore * 100)}%`}
                        {student.attendance.verificationSource === 'gemini' ? ' — فحص Gemini الذكي' : ' — فحص بصري محلي'}
                      </div>
                    )}
                    {!student.attendance.photoAttachmentId && <div style={{ color: 'var(--muted)' }}>تم حذف الصورة تلقائياً بعد 5 ساعات من الحضور</div>}
                  </> : <div>لم يسجل الحضور بعد</div>}
                </div>
                <div className="lecture-actions">
                  {student.attendance?.photoAttachmentId && (
                    <a className="btn btn-ghost btn-sm" href={`/api/attachments/${student.attendance.photoAttachmentId}`} target="_blank" rel="noreferrer">عرض الصورة</a>
                  )}
                  <Link className="btn btn-ghost btn-sm" to={`/doctor/students/${student.studentId}`}>الملف الأكاديمي</Link>
                  {student.attendance && (
                    <button className="btn btn-danger btn-sm" disabled={deletingId === student.attendance.id} onClick={() => removeAttendance(student)}>
                      <Trash2 size={14} /> {deletingId === student.attendance.id ? '...' : 'حذف الحضور'}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </Card>
    </>
  );
}

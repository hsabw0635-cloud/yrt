import { useEffect, useState } from 'react';
import api, { errorMessage } from '../api';
import { Badge, Card, EmptyState, Loading, PageHeader, ProgressBar, StatCard, useToast } from '../components/ui';
import type { StudentFile } from '../types';

export default function StudentFilePage({ endpoint, title = 'الملف الأكاديمي للطالب' }: { endpoint: string; title?: string }) {
  const { show } = useToast();
  const [file, setFile] = useState<StudentFile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(endpoint).then(({ data }) => setFile(data)).catch((error) => show(errorMessage(error), 'error')).finally(() => setLoading(false));
  }, [endpoint, show]);

  if (loading) return <Loading />;
  if (!file) return <EmptyState title="تعذر تحميل الملف" />;
  const profile = file.profile as Record<string, string>;

  return (
    <>
      <PageHeader title={title} subtitle="ملف الحضور والمواد الدراسية" />
      <Card>
        <div className="profile-strip">
          <div className="avatar" style={{ width: 64, height: 64, fontSize: 22 }}>{(profile.fullName || 'ط').charAt(0)}</div>
          <div className="profile-info">
            <h2>{profile.fullName}</h2>
            <p>الرقم الجامعي: {profile.universityNumber} — اسم المستخدم: {profile.username}</p>
            <div className="chips">
              <span className="chip">{profile.department}</span>
              <span className="chip">{profile.level}</span>
              <span className="chip">{profile.studyMode}</span>
            </div>
          </div>
          <Badge status={profile.isActive ? 'active' : 'disabled'} />
        </div>
      </Card>

      <div className="grid grid-4" style={{ marginTop: 18 }}>
        <StatCard label="إجمالي المحاضرات" value={file.summary.totalSessions} tone="navy" />
        <StatCard label="الحضور" value={file.summary.present} tone="teal" />
        <StatCard label="الغياب" value={file.summary.absent} tone="rose" />
        <StatCard label="نسبة الحضور" value={`${file.summary.rate}%`} tone="gold" />
      </div>

      <div className="grid grid-2" style={{ marginTop: 18 }}>
        <Card title="الحضور حسب المادة">
          {file.subjects.length === 0 ? <EmptyState title="لا توجد مواد" /> : (
            <div style={{ display: 'grid', gap: 14 }}>
              {file.subjects.map((subject) => (
                <div key={subject.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                    <strong>{subject.name}</strong><span>{subject.rate}%</span>
                  </div>
                  <ProgressBar value={subject.rate} />
                  <small style={{ color: 'var(--muted)' }}>حاضر {subject.present} — غائب {subject.absent} من {subject.total}</small>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="ملخص">
          <div className="lecture-meta" style={{ fontSize: 14 }}>
            <div>المحاضرات غير المسجلة: {file.summary.pending}</div>
            <div>النسبة العامة: {file.summary.rate}%</div>
            <div>عدد المواد: {file.subjects.length}</div>
          </div>
        </Card>
      </div>

      <Card title="سجل المحاضرات" className="" >
        {file.sessions.length === 0 ? <EmptyState title="لا توجد محاضرات مسجلة" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>التاريخ</th><th>المادة</th><th>الدكتور</th><th>الوقت</th><th>الحالة</th><th>وقت الحضور</th><th>الصورة</th></tr></thead>
              <tbody>
                {file.sessions.map((session, index) => (
                  <tr key={`${session.date}-${index}`}>
                    <td>{session.date}<br /><small>{session.dayName}</small></td>
                    <td>{session.subject}</td><td>{session.doctor}</td>
                    <td>{session.startTime} - {session.endTime}</td>
                    <td><Badge status={session.status} label={session.statusLabel} /></td>
                    <td>{session.markedAt ? new Date(session.markedAt).toLocaleString('ar') : '—'}</td>
                    <td>{session.photoAttachmentId ? (
                      <a href={`/api/attachments/${session.photoAttachmentId}`} target="_blank" rel="noreferrer">
                        <img src={`/api/attachments/${session.photoAttachmentId}`} alt="صورة الحضور" className="photo-thumb" />
                      </a>
                    ) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

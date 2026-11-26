import { useEffect, useState } from 'react';
import api, { errorMessage } from '../../api';
import { Badge, Card, EmptyState, Field, Loading, PageHeader, StatCard, useToast } from '../../components/ui';
import type { LectureSession } from '../../types';

export default function StudentHistory() {
  const { show } = useToast();
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [data, setData] = useState<{ sessions: LectureSession[]; summary: { total: number; attended: number; absent: number; rate: number } } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/student/history', { params: { from, to } })
      .then(({ data }) => setData(data))
      .catch((error) => show(errorMessage(error), 'error'))
      .finally(() => setLoading(false));
  }, [from, to, show]);

  return (
    <>
      <PageHeader title="سجل الحضور" subtitle="جميع محاضراتك خلال الفترة المحددة" />
      <Card>
        <div className="toolbar">
          <Field label="من تاريخ"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="إلى تاريخ"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
      </Card>
      {loading ? <Loading /> : data && <>
        <div className="grid grid-4" style={{ marginTop: 18 }}>
          <StatCard label="المحاضرات" value={data.summary.total} tone="navy" />
          <StatCard label="حاضر" value={data.summary.attended} tone="teal" />
          <StatCard label="غائب" value={data.summary.absent} tone="rose" />
          <StatCard label="النسبة" value={`${data.summary.rate}%`} tone="gold" />
        </div>
        <Card title="التفاصيل" className="" >
          {data.sessions.length === 0 ? <EmptyState title="لا توجد محاضرات في هذه الفترة" /> : (
            <div className="table-wrap"><table>
              <thead><tr><th>التاريخ</th><th>المادة</th><th>الدكتور</th><th>الوقت</th><th>القاعة</th><th>الحالة</th><th>وقت الحضور</th></tr></thead>
              <tbody>{data.sessions.map((session) => (
                <tr key={session.sessionId}>
                  <td>{session.date}<br /><small>{session.dayName}</small></td>
                  <td>{session.subject.name}</td><td>{session.doctor.name}</td>
                  <td>{session.startTime} - {session.endTime}</td><td>{session.classroom}</td>
                  <td><Badge status={session.status} /></td>
                  <td>{session.attendance ? new Date(session.attendance.markedAt).toLocaleString('ar') : '—'}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      </>}
    </>
  );
}

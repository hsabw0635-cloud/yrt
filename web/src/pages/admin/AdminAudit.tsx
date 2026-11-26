import { useEffect, useState } from 'react';
import api from '../../api';
import { Card, EmptyState, Loading, PageHeader } from '../../components/ui';

export default function AdminAudit() {
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get('/admin/audit-logs').then(({ data }) => setLogs(data.logs)).finally(() => setLoading(false));
  }, []);
  return (
    <>
      <PageHeader title="سجل العمليات" subtitle="تتبع العمليات المهمة داخل النظام" />
      <Card>
        {loading ? <Loading /> : logs.length === 0 ? <EmptyState title="لا توجد عمليات مسجلة" /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>الكيان</th><th>التفاصيل</th><th>IP</th></tr></thead>
            <tbody>{logs.map((log) => (
              <tr key={String(log.id)}>
                <td>{new Date(String(log.created_at)).toLocaleString('ar')}</td>
                <td>{String(log.username || 'النظام')}</td>
                <td>{String(log.action)}</td>
                <td>{String(log.entity_type || '—')}</td>
                <td dir="ltr" style={{ textAlign: 'right', fontSize: 11 }}>{String(log.details || '—')}</td>
                <td dir="ltr">{String(log.ip || '—')}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { FileSpreadsheet, FileText, Search, Trash2 } from 'lucide-react';
import api, { errorMessage } from '../api';
import { useLiveEvents, useLookups } from '../hooks';
import { Badge, Card, EmptyState, Field, Loading, PageHeader, StatCard, useToast } from '../components/ui';
import type { ReportRow } from '../types';

const scopes = [
  { value: 'student', label: 'طالب محدد' },
  { value: 'subject', label: 'مادة محددة' },
  { value: 'department', label: 'قسم' },
  { value: 'level', label: 'مرحلة' },
  { value: 'daily', label: 'يومي' },
  { value: 'weekly', label: 'أسبوعي' },
  { value: 'monthly', label: 'شهري' },
];

function today() { return new Date().toISOString().slice(0, 10); }

export default function ReportsPage({ role }: { role: 'admin' | 'doctor' }) {
  const { data: lookups } = useLookups();
  const { show } = useToast();
  const [scope, setScope] = useState('monthly');
  const [entityId, setEntityId] = useState('');
  const [dateFrom, setDateFrom] = useState(`${today().slice(0, 8)}01`);
  const [dateTo, setDateTo] = useState(today());
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [summary, setSummary] = useState({ total: 0, present: 0, absent: 0, pending: 0, rate: 0 });
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const query = useCallback(() => {
    const params = new URLSearchParams({ scope, dateFrom, dateTo });
    if (entityId) params.set('entityId', entityId);
    return params.toString();
  }, [scope, entityId, dateFrom, dateTo]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/reports?${query()}`);
      setRows(data.rows);
      setSummary(data.summary);
    } catch (error) { show(errorMessage(error), 'error'); }
    finally { setLoading(false); }
  }, [query, show]);

  useEffect(() => { load(); }, [load]);
  useLiveEvents((event) => { if (event === 'attendance:deleted') load(); });

  const removeAttendance = async (row: ReportRow) => {
    if (!row.attendanceId) return;
    if (!window.confirm(`حذف سجل حضور الطالب «${row.student}» في ${row.date}؟ لا يمكن التراجع.`)) return;
    setDeletingId(row.attendanceId);
    try {
      await api.delete(`/reports/attendance/${row.attendanceId}`);
      show('تم حذف سجل الحضور وصورته', 'success');
      load();
    } catch (error) { show(errorMessage(error), 'error'); }
    finally { setDeletingId(null); }
  };

  const options = (() => {
    if (scope === 'student') return [];
    if (scope === 'subject') return lookups?.subjects.map((item) => ({ id: item.id, label: item.name })) || [];
    if (scope === 'department') return lookups?.departments.map((item) => ({ id: item.id, label: item.name })) || [];
    if (scope === 'level') return lookups?.levels.map((item) => ({ id: item.id, label: item.name })) || [];
    return [];
  })();

  // قائمة الطلاب متاحة للمدير من سجل الحضور، وللدكتور عبر واجهة الطلاب
  const [studentOptions, setStudentOptions] = useState<Array<{ id: number; label: string }>>([]);
  useEffect(() => {
    if (scope !== 'student') return;
    const endpoint = role === 'admin' ? '/admin/students' : '/doctor/students';
    api.get(endpoint).then(({ data }) => {
      const list = data.students || data.users || [];
      setStudentOptions(list.map((item: { id: number; full_name?: string; fullName?: string; university_number?: string; universityNumber?: string }) => ({
        id: item.id,
        label: `${item.full_name || item.fullName} — ${item.university_number || item.universityNumber || ''}`,
      })));
    }).catch(() => {});
  }, [scope, role]);

  const activeOptions = scope === 'student' ? studentOptions : options;
  const exportLink = (format: 'excel' | 'pdf') => `/api/reports?${query()}&format=${format}`;

  return (
    <>
      <PageHeader title="التقارير والإحصائيات" subtitle="تقارير حضور قابلة للبحث والتصدير" />
      <Card>
        <div className="form-grid">
          <Field label="نوع التقرير">
            <select value={scope} onChange={(event) => { setScope(event.target.value); setEntityId(''); }}>
              {scopes.filter((item) => role === 'admin' || !['department', 'level'].includes(item.value)).map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </Field>
          {activeOptions.length > 0 && (
            <Field label="العنصر">
              <select value={entityId} onChange={(event) => setEntityId(event.target.value)}>
                <option value="">الكل</option>
                {activeOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </Field>
          )}
          <Field label="من تاريخ"><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></Field>
          <Field label="إلى تاريخ"><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></Field>
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" onClick={load}><Search size={16} /> عرض التقرير</button>
          <a className="btn btn-teal" href={exportLink('excel')}><FileSpreadsheet size={16} /> تصدير Excel</a>
          <a className="btn btn-gold" href={exportLink('pdf')}><FileText size={16} /> تصدير PDF</a>
        </div>
      </Card>

      <div className="grid grid-4" style={{ marginTop: 18 }}>
        <StatCard label="إجمالي السجلات" value={summary.total} tone="navy" />
        <StatCard label="حاضر" value={summary.present} tone="teal" />
        <StatCard label="غائب" value={summary.absent} tone="rose" />
        <StatCard label="نسبة الحضور" value={`${summary.rate}%`} tone="gold" />
      </div>

      <Card title="نتائج التقرير" subtitle={`${rows.length} سجل`} className="">
        {loading ? <Loading /> : rows.length === 0 ? <EmptyState title="لا توجد بيانات" description="تأكد من تواريخ التقرير أو أضف محاضرات وطلاب أولاً" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>التاريخ</th><th>الطالب</th><th>الرقم الجامعي</th><th>المادة</th><th>الدكتور</th><th>الحالة</th><th>وقت الحضور</th><th>إجراء</th></tr></thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.date}-${row.universityNumber}-${index}`}>
                    <td>{row.date}</td><td>{row.student}</td><td>{row.universityNumber}</td>
                    <td>{row.subject}</td><td>{row.doctor}</td><td><Badge status={row.status} label={row.statusLabel} /></td>
                    <td>{row.markedAt ? new Date(row.markedAt).toLocaleTimeString('ar') : '—'}</td>
                    <td>
                      {row.attendanceId ? (
                        <button className="btn btn-danger btn-sm" disabled={deletingId === row.attendanceId} onClick={() => removeAttendance(row)}>
                          <Trash2 size={14} /> {deletingId === row.attendanceId ? '...' : 'حذف'}
                        </button>
                      ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                    </td>
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

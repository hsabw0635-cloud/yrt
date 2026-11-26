import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Trash2 } from 'lucide-react';
import api, { errorMessage } from '../../api';
import { useLiveEvents } from '../../hooks';
import { Badge, Card, EmptyState, Field, Loading, PageHeader, StatCard, useToast } from '../../components/ui';
import type { ReportRow } from '../../types';

export default function AdminAttendance() {
  const { show } = useToast();
  const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [summary, setSummary] = useState({ total: 0, present: 0, absent: 0, pending: 0, rate: 0 });
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/attendance', { params: { dateFrom, dateTo, search } });
      setRows(data.rows); setSummary(data.summary);
    } catch (error) { show(errorMessage(error), 'error'); }
    finally { setLoading(false); }
  }, [dateFrom, dateTo, search, show]);

  useEffect(() => { load(); }, [load]);
  useLiveEvents((event) => { if (event === 'attendance:deleted') load(); });

  const removeAttendance = async (row: ReportRow) => {
    if (!row.attendanceId) return;
    if (!window.confirm(`حذف حضور «${row.student}» بتاريخ ${row.date}؟ سيُحذف السجل والصورة معاً.`)) return;
    setDeletingId(row.attendanceId);
    try {
      await api.delete(`/reports/attendance/${row.attendanceId}`);
      show('تم حذف سجل الحضور', 'success');
      load();
    } catch (error) { show(errorMessage(error), 'error'); }
    finally { setDeletingId(null); }
  };

  return (
    <>
      <PageHeader title="سجلات الحضور" subtitle="جميع سجلات الحضور والغياب في النظام" />
      <Card>
        <div className="toolbar">
          <Field label="من تاريخ"><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></Field>
          <Field label="إلى تاريخ"><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></Field>
          <Field label="بحث">
            <div className="search-box"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="اسم الطالب أو الرقم الجامعي أو المادة" /></div>
          </Field>
          <button className="btn btn-primary" onClick={load}>تحديث</button>
        </div>
      </Card>
      <div className="grid grid-4" style={{ marginTop: 18 }}>
        <StatCard label="إجمالي السجلات" value={summary.total} tone="navy" />
        <StatCard label="حاضر" value={summary.present} tone="teal" />
        <StatCard label="غائب" value={summary.absent} tone="rose" />
        <StatCard label="نسبة الحضور" value={`${summary.rate}%`} tone="gold" />
      </div>
      <Card title="السجلات" className="" >
        {loading ? <Loading /> : rows.length === 0 ? <EmptyState title="لا توجد سجلات في هذا النطاق" /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>التاريخ</th><th>الطالب</th><th>القسم</th><th>المادة</th><th>الدكتور</th><th>الحالة</th><th>وقت الحضور</th><th>إجراء</th></tr></thead>
            <tbody>{rows.map((row, index) => (
              <tr key={`${row.date}-${index}`}>
                <td>{row.date}</td>
                <td><Link to="#">{row.student}</Link><br /><small>{row.universityNumber}</small></td>
                <td>{row.department} — {row.level}</td><td>{row.subject}</td><td>{row.doctor}</td>
                <td><Badge status={row.status} label={row.statusLabel} /></td>
                <td>{row.markedAt ? new Date(row.markedAt).toLocaleString('ar') : '—'}</td>
                <td>
                  {row.attendanceId ? (
                    <button className="btn btn-danger btn-sm" disabled={deletingId === row.attendanceId} onClick={() => removeAttendance(row)}>
                      <Trash2 size={14} /> {deletingId === row.attendanceId ? '...' : 'حذف'}
                    </button>
                  ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </>
  );
}

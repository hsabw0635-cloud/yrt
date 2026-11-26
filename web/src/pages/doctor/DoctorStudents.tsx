import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import api, { errorMessage } from '../../api';
import { Card, EmptyState, Field, Loading, PageHeader, useToast } from '../../components/ui';

export default function DoctorStudents() {
  const { show } = useToast();
  const [students, setStudents] = useState<Array<Record<string, unknown>>>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/doctor/students', { params: { search } })
      .then(({ data }) => setStudents(data.students))
      .catch((error) => show(errorMessage(error), 'error'))
      .finally(() => setLoading(false));
  }, [search, show]);

  return (
    <>
      <PageHeader title="الطلاب" subtitle="الطلاب المرتبطون بالأقسام والمراحل التي تدرسها" />
      <Card>
        <div className="toolbar"><Field label="بحث">
          <div className="search-box"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="الاسم أو الرقم الجامعي" /></div>
        </Field></div>
        {loading ? <Loading /> : students.length === 0 ? <EmptyState title="لا يوجد طلاب" /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>الاسم</th><th>الرقم الجامعي</th><th>القسم</th><th>المرحلة</th><th>الدراسة</th><th>عدد الحضور</th><th></th></tr></thead>
            <tbody>{students.map((student) => (
              <tr key={String(student.id)}>
                <td>{String(student.full_name)}</td><td>{String(student.university_number)}</td>
                <td>{String(student.department_name || '—')}</td><td>{String(student.level_name || '—')}</td>
                <td>{student.study_mode === 'morning' ? 'صباحي' : 'مسائي'}</td>
                <td>{String(student.present_count)}</td>
                <td><Link className="btn btn-ghost btn-sm" to={`/doctor/students/${student.id}`}>الملف</Link></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </>
  );
}

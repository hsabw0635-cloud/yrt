import { useEffect, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import api, { errorMessage } from '../../api';
import { useLookups } from '../../hooks';
import { Badge, Card, EmptyState, Field, Modal, PageHeader, useToast } from '../../components/ui';

type Subject = Record<string, unknown>;
const empty = { name: '', code: '', departmentId: '', levelId: '', isActive: true };

export default function AdminSubjects() {
  const { show } = useToast();
  const { data: lookups } = useLookups();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [form, setForm] = useState({ ...empty });

  const load = () => api.get('/admin/subjects').then(({ data }) => setSubjects(data.subjects)).catch((error) => show(errorMessage(error), 'error'));
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ ...empty }); setOpen(true); };
  const openEdit = (subject: Subject) => {
    setEditing(subject);
    setForm({
      name: String(subject.name), code: String(subject.code),
      departmentId: String(subject.department_id), levelId: String(subject.level_id),
      isActive: Boolean(subject.is_active),
    });
    setOpen(true);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const payload = { ...form, departmentId: Number(form.departmentId), levelId: Number(form.levelId) };
    try {
      if (editing) await api.patch(`/admin/subjects/${editing.id}`, payload);
      else await api.post('/admin/subjects', payload);
      show('تم حفظ المادة', 'success');
      setOpen(false); load();
    } catch (error) { show(errorMessage(error), 'error'); }
  };

  const remove = async (subject: Subject) => {
    if (!window.confirm(`حذف مادة «${String(subject.name)}» مع كل محاضراتها وسجلات الحضور؟ لا يمكن التراجع.`)) return;
    try {
      await api.delete(`/admin/subjects/${String(subject.id)}`);
      show('تم حذف المادة وبياناتها المرتبطة', 'success');
      window.dispatchEvent(new Event('lookups:refresh'));
      load();
    } catch (error) { show(errorMessage(error), 'error'); }
  };

  return (
    <>
      <PageHeader title="المواد الدراسية" subtitle="إضافة وتعديل المواد وربطها بالأقسام والمراحل"
        actions={<button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> إضافة مادة</button>} />
      <Card>
        {subjects.length === 0 ? <EmptyState title="لا توجد مواد" description="ابدأ بإضافة مادة دراسية" /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>الرمز</th><th>اسم المادة</th><th>القسم</th><th>المرحلة</th><th>الحالة</th><th></th></tr></thead>
            <tbody>{subjects.map((subject) => (
              <tr key={String(subject.id)}>
                <td>{String(subject.code)}</td><td>{String(subject.name)}</td>
                <td>{String(subject.department_name)}</td><td>{String(subject.level_name)}</td>
                <td><Badge status={subject.is_active ? 'active' : 'disabled'} /></td>
                <td>
                  <button className="icon-btn" title="تعديل" onClick={() => openEdit(subject)}><Pencil size={16} /></button>
                  <button className="icon-btn" title="حذف المادة وبياناتها" onClick={() => remove(subject)}><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'تعديل المادة' : 'إضافة مادة'}>
        <form onSubmit={save}>
          <div className="form-grid">
            <Field label="اسم المادة"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label="رمز المادة"><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required /></Field>
            <Field label="القسم">
              <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value, levelId: '' })} required>
                <option value="">اختر القسم</option>
                {lookups?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="المرحلة">
              <select value={form.levelId} onChange={(e) => setForm({ ...form, levelId: e.target.value })} required>
                <option value="">اختر المرحلة</option>
                {lookups?.levels.filter((l) => lookups.departmentLevels.some((link) => link.department_id === Number(form.departmentId) && link.level_id === l.id))
                  .map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
          </div>
          <label className="checkbox-line" style={{ marginTop: 14 }}>
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> مادة فعّالة
          </label>
          <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>إلغاء</button><button className="btn btn-primary">حفظ</button></div>
        </form>
      </Modal>
    </>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import api, { errorMessage } from '../../api';
import { useLookups } from '../../hooks';
import { Card, EmptyState, Field, Modal, PageHeader, useToast } from '../../components/ui';

type Kind = 'department' | 'level';
const labels: Record<Kind, string> = { department: 'قسم', level: 'مرحلة' };
const empty = { name: '', code: '' };

export default function AdminStructure() {
  const { show } = useToast();
  const { data: lookups, loading } = useLookups();
  const [kind, setKind] = useState<Kind | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [levelIds, setLevelIds] = useState<number[]>([]);

  useEffect(() => {
    if (!selectedDepartment || !lookups) return;
    setLevelIds(lookups.departmentLevels.filter((link) => link.department_id === Number(selectedDepartment)).map((link) => link.level_id));
  }, [selectedDepartment, lookups]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!kind) return;
    const endpoint = kind === 'department' ? '/admin/departments' : '/admin/levels';
    try {
      await api.post(endpoint, { name: form.name, code: form.code });
      show(`تمت إضافة ${labels[kind]} بنجاح`, 'success');
      setKind(null);
      setForm({ ...empty });
      window.dispatchEvent(new Event('lookups:refresh'));
    } catch (error) { show(errorMessage(error), 'error'); }
  };

  const saveDepartmentLevels = async () => {
    if (!selectedDepartment) return;
    try {
      await api.put(`/admin/departments/${selectedDepartment}/levels`, { levelIds });
      show('تم حفظ المراحل المرتبطة بالقسم', 'success');
    } catch (error) { show(errorMessage(error), 'error'); }
  };

  const remove = async (kind: Kind, itemId: number, name: string) => {
    if (!window.confirm(`حذف ${labels[kind]} «${name}» مع كل البيانات المرتبطة به (مواد، محاضرات، حسابات، حضور)؟ لا يمكن التراجع.`)) return;
    try {
      await api.delete(`/admin/${kind === 'department' ? 'departments' : 'levels'}/${itemId}`);
      show(`تم حذف ${labels[kind]} وبياناته المرتبطة`, 'success');
      if (kind === 'department' && selectedDepartment === String(itemId)) setSelectedDepartment('');
      window.dispatchEvent(new Event('lookups:refresh'));
    } catch (error) { show(errorMessage(error), 'error'); }
  };

  if (loading || !lookups) return <div className="loading">جارٍ التحميل...</div>;

  return (
    <>
      <PageHeader title="الأقسام والمراحل" subtitle="إعداد الهيكل الأكاديمي"
        actions={<div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={() => setKind('department')}><Plus size={16} /> قسم</button>
          <button className="btn btn-teal" onClick={() => setKind('level')}><Plus size={16} /> مرحلة</button>
        </div>} />

      <div className="grid grid-2">
        <Card title="الأقسام العلمية">
          {lookups.departments.length === 0 ? <EmptyState title="لا توجد أقسام" /> : lookups.departments.map((item) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
              <div><strong>{item.name}</strong><br /><small style={{ color: 'var(--muted)' }}>{item.code}</small></div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="icon-btn" onClick={() => setSelectedDepartment(String(item.id))}>اختيار</button>
                <button className="icon-btn" title="حذف القسم وبياناته" onClick={() => remove('department', item.id, item.name)}><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </Card>
        <Card title="المراحل الدراسية">
          {lookups.levels.length === 0 ? <EmptyState title="لا توجد مراحل" /> : lookups.levels.map((item) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
              <div><strong>{item.name}</strong> <small style={{ color: 'var(--muted)' }}>({item.code})</small></div>
              <button className="icon-btn" title="حذف المرحلة وبياناتها" onClick={() => remove('level', item.id, item.name)}><Trash2 size={16} /></button>
            </div>
          ))}
        </Card>
      </div>

      <Card title="ربط المراحل بالأقسام" style={{ marginTop: 18 }}>
        <div className="form-grid">
          <Field label="القسم">
            <select value={selectedDepartment} onChange={(event) => setSelectedDepartment(event.target.value)}>
              <option value="">اختر القسم</option>
              {lookups.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>
        </div>
        {selectedDepartment && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, margin: '18px 0' }}>
              {lookups.levels.map((level) => (
                <label className="checkbox-line" key={level.id}>
                  <input type="checkbox" checked={levelIds.includes(level.id)}
                    onChange={(event) => setLevelIds((current) => event.target.checked ? [...current, level.id] : current.filter((id) => id !== level.id))} />
                  {level.name}
                </label>
              ))}
            </div>
            <button className="btn btn-primary" onClick={saveDepartmentLevels}>حفظ الارتباط</button>
          </>
        )}
      </Card>

      <Modal open={Boolean(kind)} onClose={() => setKind(null)} title={`إضافة ${kind ? labels[kind] : ''}`}>
        <form onSubmit={save}>
          <div className="form-grid">
            <Field label="الاسم"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
            <Field label="الرمز"><input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required /></Field>
          </div>
          <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setKind(null)}>إلغاء</button><button className="btn btn-primary">حفظ</button></div>
        </form>
      </Modal>
    </>
  );
}

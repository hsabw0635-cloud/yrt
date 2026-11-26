import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Pencil, Plus, Search, ShieldBan, ShieldCheck, Trash2 } from 'lucide-react';
import api, { errorMessage } from '../../api';
import { useLookups } from '../../hooks';
import { Badge, Card, EmptyState, Field, Loading, Modal, PageHeader, useToast } from '../../components/ui';

type UserRow = Record<string, unknown>;
const emptyForm = {
  username: '', password: '', role: 'student', fullName: '', universityNumber: '',
  departmentId: '', levelId: '', studyMode: 'morning', phone: '',
};

export default function AdminUsers() {
  const { show } = useToast();
  const { data: lookups } = useLookups();
  const [tab, setTab] = useState('student');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [modalOpen, setModalOpen] = useState(false);
  const [resetFor, setResetFor] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/admin/users?role=${tab}&search=${encodeURIComponent(search)}`);
      setRows(data.users);
    } catch (error) { show(errorMessage(error), 'error'); }
    finally { setLoading(false); }
  }, [tab, search, show]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm({ ...emptyForm, role: tab === 'all' ? 'student' : tab }); setModalOpen(true); };
  const openEdit = (row: UserRow) => {
    setEditing(row);
    setForm({
      username: String(row.username || ''), password: '', role: String(row.role || 'student'),
      fullName: String(row.student_name || row.doctor_name || ''),
      universityNumber: String(row.university_number || ''),
      departmentId: String(row.department_id || ''), levelId: String(row.level_id || ''),
      studyMode: String(row.study_mode || 'morning'), phone: String(row.phone || ''),
    });
    setModalOpen(true);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const payload: Record<string, unknown> = { ...form };
    if (!form.departmentId) delete payload.departmentId;
    if (!form.levelId) delete payload.levelId;
    if (!form.universityNumber) delete payload.universityNumber;
    if (!form.fullName) delete payload.fullName;
    if (!form.phone) delete payload.phone;
    if (editing) {
      if (!form.password) delete payload.password;
      delete payload.role;
      try {
        await api.patch(`/admin/users/${editing.id}`, payload);
        show('تم تعديل الحساب بنجاح', 'success');
      } catch (error) { show(errorMessage(error), 'error'); return; }
    } else {
      if (!form.password) return show('كلمة المرور مطلوبة', 'error');
      try {
        await api.post('/admin/users', payload);
        show('تم إنشاء الحساب بنجاح', 'success');
      } catch (error) { show(errorMessage(error), 'error'); return; }
    }
    setModalOpen(false);
    load();
  };

  const toggleActive = async (row: UserRow) => {
    try {
      await api.patch(`/admin/users/${row.id}`, { isActive: !row.is_active });
      show(row.is_active ? 'تم إيقاف الحساب' : 'تم تفعيل الحساب', 'success');
      load();
    } catch (error) { show(errorMessage(error), 'error'); }
  };

  const resetPassword = async () => {
    if (!resetFor || newPassword.length < 8) return show('كلمة المرور يجب ألا تقل عن 8 أحرف', 'error');
    try {
      await api.post(`/admin/users/${resetFor.id}/reset-password`, { password: newPassword });
      show('تمت إعادة تعيين كلمة المرور', 'success');
      setResetFor(null); setNewPassword('');
    } catch (error) { show(errorMessage(error), 'error'); }
  };

  const remove = async (row: UserRow) => {
    const name = String(row.student_name || row.doctor_name || row.username);
    if (!window.confirm(`حذف حساب «${name}» وكل بياناته المرتبطة؟ لا يمكن التراجع.`)) return;
    try {
      await api.delete(`/admin/users/${String(row.id)}`);
      show('تم حذف الحساب وبياناته المرتبطة', 'success');
      window.dispatchEvent(new Event('lookups:refresh'));
      load();
    } catch (error) { show(errorMessage(error), 'error'); }
  };

  return (
    <>
      <PageHeader title="إدارة الحسابات" subtitle="إنشاء الطلاب والدكاترة، تعديل الحسابات، التفعيل، إعادة تعيين كلمات المرور، والحذف المتسلسل"
        actions={<button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> إنشاء حساب</button>} />

      <Card>
        <div className="tabs">
          {[['student', 'الطلاب'], ['doctor', 'الدكاترة'], ['admin', 'المديرون'], ['all', 'الكل']].map(([value, label]) => (
            <button key={value} className={`tab ${tab === value ? 'active' : ''}`} onClick={() => setTab(value)}>{label}</button>
          ))}
        </div>
        <div className="toolbar">
          <div className="search-box field">
            <Search size={17} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث بالاسم أو اسم المستخدم أو الرقم الجامعي" />
          </div>
        </div>
        {loading ? <Loading /> : rows.length === 0 ? <EmptyState title="لا توجد حسابات" description="ابدأ بإنشاء حساب جديد" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>اسم المستخدم</th><th>الاسم</th><th>الرقم الجامعي</th><th>القسم</th><th>الحالة</th><th>آخر دخول</th><th>إجراءات</th></tr></thead>
              <tbody>{rows.map((row) => (
                <tr key={String(row.id)}>
                  <td>{String(row.username)}</td>
                  <td>{row.student_name ? (
                    <Link to={`/admin/students/${String(row.student_id)}`}>{String(row.student_name)}</Link>
                  ) : String(row.doctor_name || '—')}</td>
                  <td>{String(row.university_number || '—')}</td>
                  <td>{String(row.department_name || '—')}</td>
                  <td><Badge status={row.is_active ? 'active' : 'disabled'} /></td>
                  <td>{row.last_login_at ? new Date(String(row.last_login_at)).toLocaleDateString('ar') : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="icon-btn" title="تعديل" onClick={() => openEdit(row)}><Pencil size={16} /></button>
                      <button className="icon-btn" title="إعادة تعيين كلمة المرور" onClick={() => setResetFor(row)}><KeyRound size={16} /></button>
                      <button className="icon-btn" title={row.is_active ? 'إيقاف' : 'تفعيل'} onClick={() => toggleActive(row)}>
                        {row.is_active ? <ShieldBan size={16} /> : <ShieldCheck size={16} />}
                      </button>
                      <button className="icon-btn" title="حذف الحساب وبياناته" onClick={() => remove(row)}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'تعديل الحساب' : 'إنشاء حساب جديد'} wide>
        <form onSubmit={save}>
          <div className="form-grid">
            <Field label="اسم المستخدم"><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required /></Field>
            <Field label={editing ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور'}>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editing} minLength={8} />
            </Field>
            {!editing && (
              <Field label="نوع الحساب">
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="student">طالب</option><option value="doctor">دكتور</option><option value="admin">مدير</option>
                </select>
              </Field>
            )}
            <Field label="الاسم الرباعي"><input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
            {form.role === 'student' && (
              <>
                <Field label="الرقم الجامعي"><input value={form.universityNumber} onChange={(e) => setForm({ ...form, universityNumber: e.target.value })} /></Field>
                <Field label="القسم">
                  <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value, levelId: '' })}>
                    <option value="">—</option>
                    {lookups?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </Field>
                <Field label="المرحلة">
                  <select value={form.levelId} onChange={(e) => setForm({ ...form, levelId: e.target.value })}>
                    <option value="">—</option>
                    {lookups?.levels.filter((l) => lookups.departmentLevels.some((link) => link.department_id === Number(form.departmentId) && link.level_id === l.id))
                      .map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </Field>
                <Field label="نوع الدراسة">
                  <select value={form.studyMode} onChange={(e) => setForm({ ...form, studyMode: e.target.value })}>
                    {lookups?.studyModes.map((m) => <option key={m.code} value={m.code}>{m.label_ar}</option>)}
                  </select>
                </Field>
              </>
            )}
            {form.role === 'doctor' && (
              <>
                <Field label="القسم">
                  <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                    <option value="">—</option>
                    {lookups?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </Field>
                <Field label="الهاتف"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
              </>
            )}
          </div>
          <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>إلغاء</button><button className="btn btn-primary">حفظ</button></div>
        </form>
      </Modal>

      <Modal open={Boolean(resetFor)} onClose={() => setResetFor(null)} title="إعادة تعيين كلمة المرور">
        <Field label="كلمة المرور الجديدة">
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} />
        </Field>
        <div className="modal-actions"><button className="btn btn-ghost" onClick={() => setResetFor(null)}>إلغاء</button><button className="btn btn-primary" onClick={resetPassword}>تعيين</button></div>
      </Modal>
    </>
  );
}

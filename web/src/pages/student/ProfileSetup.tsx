import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera } from 'lucide-react';
import api, { errorMessage } from '../../api';
import { useAuth } from '../../AuthContext';
import { useLookups } from '../../hooks';
import { Card, Field, Loading, PageHeader, useToast } from '../../components/ui';
import type { Profile } from './StudentDashboard';

export default function ProfileSetup() {
  const { show } = useToast();
  const { data: lookups } = useLookups();
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ fullName: '', universityNumber: '', departmentId: '', levelId: '', studyMode: 'morning' });
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/student/profile').then(({ data }) => {
      const profile: Profile | null = data.profile;
      if (profile) {
        setForm({
          fullName: profile.full_name || '', universityNumber: profile.university_number || '',
          departmentId: String((profile as unknown as Record<string, unknown>).department_id || ''),
          levelId: String((profile as unknown as Record<string, unknown>).level_id || ''),
          studyMode: String((profile as unknown as Record<string, unknown>).study_mode || 'morning'),
        });
        if ((profile as unknown as Record<string, unknown>).profile_completed) navigate('/student', { replace: true });
      }
    }).finally(() => setLoading(false));
  }, [navigate]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const body = new FormData();
    Object.entries(form).forEach(([key, value]) => body.append(key, value));
    if (photo) body.append('photo', photo);
    try {
      await api.put('/student/profile', body);
      show('تم حفظ بياناتك الشخصية بنجاح', 'success');
      await refresh();
      navigate('/student', { replace: true });
    } catch (error) { show(errorMessage(error), 'error'); }
    finally { setSaving(false); }
  };

  if (loading || !lookups) return <Loading />;
  const levels = lookups.levels.filter((level) => lookups.departmentLevels.some((link) => link.department_id === Number(form.departmentId) && link.level_id === level.id));

  return (
    <>
      <PageHeader title="إكمال الملف الشخصي" subtitle="هذه البيانات مطلوبة لربطك بمحاضرات قسمك ومرحلتك" />
      <Card>
        <form onSubmit={submit}>
          <div className="form-grid">
            <Field label="الاسم الرباعي"><input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required placeholder="الاسم كما يظهر في السجلات الجامعية" /></Field>
            <Field label="الرقم الجامعي"><input value={form.universityNumber} onChange={(e) => setForm({ ...form, universityNumber: e.target.value })} required /></Field>
            <Field label="القسم">
              <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value, levelId: '' })} required>
                <option value="">اختر القسم</option>
                {lookups.departments.filter((d) => d.is_active).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="المرحلة الدراسية">
              <select value={form.levelId} onChange={(e) => setForm({ ...form, levelId: e.target.value })} required>
                <option value="">اختر المرحلة</option>
                {levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
            <Field label="نوع الدراسة">
              <select value={form.studyMode} onChange={(e) => setForm({ ...form, studyMode: e.target.value })}>
                {lookups.studyModes.map((m) => <option key={m.code} value={m.code}>{m.label_ar}</option>)}
              </select>
            </Field>
            <Field label="صورة شخصية (اختياري)" hint="JPG / PNG / WEBP حتى 6MB">
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setPhoto(file);
                setPreview(file ? URL.createObjectURL(file) : null);
              }} />
            </Field>
          </div>
          {preview && <img src={preview} alt="معاينة" style={{ width: 110, height: 110, objectFit: 'cover', borderRadius: 16, marginTop: 16 }} />}
          <div className="notice" style={{ marginTop: 18 }}>
            <Camera size={15} /> الصورة الشخصية اختيارية، أما صورة تسجيل الحضور فتُلتقط بالكاميرا وقت المحاضرة فقط ولا يمكن رفعها من الجهاز.
          </div>
          <div className="form-actions"><button className="btn btn-primary" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ والمتابعة'}</button></div>
        </form>
      </Card>
    </>
  );
}

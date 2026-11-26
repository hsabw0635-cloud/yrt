import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Clock, DoorOpen, GraduationCap, Plus, Trash2 } from 'lucide-react';
import api, { errorMessage } from '../../api';
import { useLiveEvents, useLookups } from '../../hooks';
import { Badge, Card, EmptyState, Field, Loading, Modal, PageHeader, useToast } from '../../components/ui';
import type { LectureSession } from '../../types';

const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const emptyForm = {
  levelId: '', subjectId: '', studyMode: 'morning',
  dayOfWeek: '1', startTime: '08:00', endTime: '09:30', classroom: '',
};

type DoctorLecture = {
  id: number;
  subject_name: string;
  subject_code: string;
  level_name: string;
  study_mode_label: string;
  study_mode: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  classroom: string;
  is_active: number;
  session_count: number;
};

type DoctorSubject = { id: number; name: string; code: string; level_id: number; level_name: string };

export default function DoctorSchedule() {
  const { show } = useToast();
  const { data: lookups } = useLookups();
  const [lectures, setLectures] = useState<DoctorLecture[]>([]);
  const [sessions, setSessions] = useState<LectureSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [subjects, setSubjects] = useState<DoctorSubject[]>([]);
  const [busyDelete, setBusyDelete] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = new Date().toISOString().slice(0, 10);
      const to = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      const [lectureResponse, sessionResponse] = await Promise.all([
        api.get('/doctor/lectures'),
        api.get('/doctor/schedule', { params: { from, to } }),
      ]);
      setLectures(lectureResponse.data.lectures);
      setSessions(sessionResponse.data.sessions);
    } catch (error) { show(errorMessage(error), 'error'); }
    finally { setLoading(false); }
  }, [show]);

  useEffect(() => { load(); }, [load]);
  useLiveEvents(() => load());

  useEffect(() => {
    if (!form.levelId) { setSubjects([]); return; }
    api.get('/doctor/subjects', { params: { levelId: form.levelId } })
      .then(({ data }) => {
        setSubjects(data.subjects);
        setForm((current) => ({ ...current, subjectId: data.subjects[0] ? String(data.subjects[0].id) : '' }));
      })
      .catch((error) => show(errorMessage(error), 'error'));
  }, [form.levelId, show]);

  const openCreate = () => {
    setForm({ ...emptyForm, levelId: lookups?.levels[0] ? String(lookups.levels[0].id) : '' });
    setOpen(true);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.subjectId) return show('اختر مادة دراسية', 'error');
    setSaving(true);
    try {
      await api.post('/doctor/lectures', {
        subjectId: Number(form.subjectId),
        levelId: Number(form.levelId),
        studyMode: form.studyMode,
        dayOfWeek: Number(form.dayOfWeek),
        startTime: form.startTime,
        endTime: form.endTime,
        classroom: form.classroom.trim(),
      });
      show('تمت إضافة المحاضرة، وستظهر لطلاب المرحلة والنوع المحددين', 'success');
      setOpen(false);
      load();
    } catch (error) { show(errorMessage(error), 'error'); }
    finally { setSaving(false); }
  };

  const remove = async (lecture: DoctorLecture) => {
    if (!window.confirm(`حذف محاضرة «${lecture.subject_name}» وكل جلساتها وسجلات حضورها؟ لا يمكن التراجع.`)) return;
    setBusyDelete(lecture.id);
    try {
      await api.delete(`/doctor/lectures/${lecture.id}`);
      show('تم حذف المحاضرة وبياناتها المرتبطة', 'success');
      load();
    } catch (error) { show(errorMessage(error), 'error'); }
    finally { setBusyDelete(null); }
  };

  const sessionFor = (lectureId: number) => sessions.find((session) => session.scheduleId === lectureId);

  return (
    <>
      <PageHeader title="جدول المحاضرات" subtitle="كل محاضرة تظهر مرة واحدة، وتُعرض لطلاب مرحلتها ونوع دراستها فقط"
        actions={<button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> إضافة محاضرة</button>} />
      <Card>
        {loading ? <Loading /> : lectures.length === 0 ? <EmptyState title="لا توجد محاضرات" description="استخدم زر إضافة محاضرة لإنشاء محاضرة جديدة" /> : (
          <div className="grid grid-3">
            {lectures.map((lecture) => {
              const session = sessionFor(lecture.id);
              return (
                <article className="lecture-card" key={lecture.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong style={{ fontSize: 17 }}>{lecture.subject_name}</strong>
                    <Badge status={lecture.is_active ? 'active' : 'disabled'} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{lecture.subject_code}</div>
                  <div className="lecture-meta">
                    <div><GraduationCap size={14} /> {lecture.level_name} — {lecture.study_mode_label}</div>
                    <div><CalendarDays size={14} /> {DAY_NAMES[Number(lecture.day_of_week)]}</div>
                    <div><Clock size={14} /> {String(lecture.start_time).slice(0, 5)} إلى {String(lecture.end_time).slice(0, 5)}</div>
                    <div><DoorOpen size={14} /> {lecture.classroom}</div>
                    <div>جلسات مولّدة: {lecture.session_count}</div>
                  </div>
                  <div className="lecture-actions">
                    <button className="btn btn-danger btn-sm" disabled={busyDelete === lecture.id} onClick={() => remove(lecture)}>
                      <Trash2 size={14} /> حذف المحاضرة
                    </button>
                    {session && <Link className="btn btn-primary btn-sm" to={`/doctor/sessions/${session.sessionId}`}>تفاصيل الحضور</Link>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="إضافة محاضرة جديدة" wide>
        <form onSubmit={save}>
          <div className="form-grid">
            <Field label="المرحلة" hint="أولى، ثانية، ثالثة، أو رابعة">
              <select value={form.levelId} onChange={(e) => setForm({ ...form, levelId: e.target.value, subjectId: '' })} required>
                <option value="">اختر المرحلة</option>
                {(lookups?.levels || []).map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}
              </select>
            </Field>
            <Field label="نوع الدراسة">
              <select value={form.studyMode} onChange={(e) => setForm({ ...form, studyMode: e.target.value })} required>
                {(lookups?.studyModes || []).map((mode) => <option key={mode.code} value={mode.code}>{mode.label_ar}</option>)}
              </select>
            </Field>
            <Field label="المادة">
              <select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })} required>
                <option value="">اختر المادة</option>
                {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name} ({subject.code})</option>)}
              </select>
            </Field>
            <Field label="يوم المحاضرة">
              <select value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })} required>
                {DAY_NAMES.map((name, index) => <option key={name} value={index}>{name}</option>)}
              </select>
            </Field>
            <Field label="وقت البداية"><input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required /></Field>
            <Field label="وقت النهاية"><input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} required /></Field>
            <Field label="القاعة / المدرج"><input value={form.classroom} onChange={(e) => setForm({ ...form, classroom: e.target.value })} maxLength={100} required /></Field>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>إلغاء</button>
            <button className="btn btn-primary" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'إضافة المحاضرة'}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

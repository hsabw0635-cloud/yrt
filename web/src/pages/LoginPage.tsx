import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import api, { errorMessage } from '../api';
import { useAuth } from '../AuthContext';
import { Field, useToast } from '../components/ui';
import type { User } from '../types';

export function homePath(user: User) {
  if (user.role === 'admin') return '/admin';
  if (user.role === 'doctor') return '/doctor';
  return user.profileCompleted ? '/student' : '/student/profile';
}

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const { show } = useToast();
  const navigate = useNavigate();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const user = await login(username.trim(), password);
      show(`أهلاً بك، ${user.fullName || user.username}`, 'success');
      navigate(homePath(user), { replace: true });
    } catch (error) {
      show(errorMessage(error), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <section className="login-hero">
        <div className="hero-badge"><ShieldCheck size={16} /> منصة جامعية موثوقة</div>
        <h1>حضور الطلاب<br />بكل دقة وشفافية</h1>
        <p>نظام متكامل لإدارة المحاضرات والحضور، يربط الإدارة والدكاترة والطلاب في تجربة واحدة آمنة ومباشرة.</p>
        <div className="hero-points">
          <div className="hero-point"><span><ClipboardCheck size={19} /></span> تسجيل حضور فوري بالكاميرا</div>
          <div className="hero-point"><span><ShieldCheck size={19} /></span> تحديثات لحظية بين الدكتور والطلاب</div>
          <div className="hero-point"><span><ShieldCheck size={19} /></span> صلاحيات منفصلة وتقارير قابلة للتصدير</div>
        </div>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <div className="login-logo"><ShieldCheck size={28} /></div>
          <h2>تسجيل الدخول</h2>
          <p>أدخل بيانات حسابك للوصول إلى لوحة التحكم الخاصة بك</p>

          <Field label="اسم المستخدم">
            <div className="search-box">
              <UserRound size={17} />
              <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="مثال: student.001" autoComplete="username" required />
            </div>
          </Field>
          <Field label="كلمة المرور">
            <div className="search-box">
              <LockKeyhole size={17} />
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" autoComplete="current-password" required />
            </div>
          </Field>
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={submitting}>
            {submitting ? 'جارٍ التحقق...' : 'تسجيل الدخول'}
          </button>
          <div className="login-note">
            في حال نسيان كلمة المرور أو إيقاف الحساب، يرجى التواصل مع مدير النظام لإعادة تعيينها.
          </div>
        </form>
      </section>
    </div>
  );
}

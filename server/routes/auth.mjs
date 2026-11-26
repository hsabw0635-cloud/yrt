import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, queryOne } from '../db.mjs';
import { authRequired, clearAuthCookie, setAuthCookie } from '../auth.mjs';
import { asyncHandler, AppError } from '../errors.mjs';
import { audit } from '../audit.mjs';

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().trim().min(1, 'اسم المستخدم مطلوب').max(80),
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
});

function profileForUser(user) {
  return {
    id: Number(user.id),
    username: user.username,
    role: user.role,
    fullName: user.student_name || user.doctor_name || user.user_full_name || user.full_name || user.username,
    studentId: user.student_id ? Number(user.student_id) : null,
    doctorId: user.doctor_id ? Number(user.doctor_id) : null,
    profileCompleted: Boolean(user.profile_completed),
    departmentId: user.department_id ? Number(user.department_id) : null,
    levelId: user.level_id ? Number(user.level_id) : null,
    studyMode: user.study_mode,
  };
}

authRouter.post('/login', asyncHandler(async (req, res) => {
  const data = loginSchema.parse(req.body);
  const user = await queryOne(
    `SELECT u.*, u.full_name AS user_full_name, d.full_name AS doctor_name, d.id AS doctor_id,
            s.full_name AS student_name, s.id AS student_id, s.profile_completed,
            s.department_id, s.level_id, s.study_mode
     FROM users u
     LEFT JOIN doctors d ON d.user_id = u.id
     LEFT JOIN students s ON s.user_id = u.id
     WHERE u.username = ?`,
    [data.username],
  );

  if (!user || !(await bcrypt.compare(data.password, user.password_hash))) {
    throw new AppError(401, 'اسم المستخدم أو كلمة المرور غير صحيحة', 'INVALID_CREDENTIALS');
  }
  if (!user.is_active) throw new AppError(403, 'تم إيقاف هذا الحساب، تواصل مع مدير النظام', 'ACCOUNT_DISABLED');

  await query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
  setAuthCookie(res, user);
  await audit(req, 'LOGIN', 'user', user.id, { role: user.role });

  res.json({ user: profileForUser(user) });
}));

authRouter.post('/logout', authRequired, asyncHandler(async (req, res) => {
  await audit(req, 'LOGOUT', 'user', req.user.id);
  clearAuthCookie(res);
  res.json({ ok: true });
}));

authRouter.get('/me', authRequired, asyncHandler(async (req, res) => {
  res.json({ user: profileForUser(req.user) });
}));

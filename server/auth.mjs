import jwt from 'jsonwebtoken';
import { queryOne } from './db.mjs';
import { AppError } from './errors.mjs';

export const COOKIE_NAME = 'campus_session';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET مطلوب في ملف .env');
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: '12h' },
  );
}

export function setAuthCookie(res, user) {
  res.cookie(COOKIE_NAME, signToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true' || (process.env.NODE_ENV === 'production' && String(process.env.PUBLIC_BASE_URL || '').startsWith('https')),
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/', sameSite: 'lax' });
}

export async function authRequired(req, _res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) throw new AppError(401, 'يرجى تسجيل الدخول', 'UNAUTHENTICATED');

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      throw new AppError(401, 'انتهت الجلسة، يرجى تسجيل الدخول مجدداً', 'UNAUTHENTICATED');
    }

    const user = await queryOne(
      `SELECT u.id, u.username, u.full_name AS user_full_name, u.role, u.is_active,
              d.id AS doctor_id, d.full_name AS doctor_name, d.department_id AS doctor_department_id,
              s.id AS student_id, s.full_name AS student_name, s.profile_completed,
              s.university_number, s.department_id AS student_department_id,
              s.level_id AS student_level_id, s.study_mode AS student_study_mode,
              s.profile_photo_id
       FROM users u
       LEFT JOIN doctors d ON d.user_id = u.id
       LEFT JOIN students s ON s.user_id = u.id
       WHERE u.id = ?`,
      [payload.sub],
    );

    if (!user || !user.is_active) {
      throw new AppError(401, 'الحساب غير مفعل أو غير موجود', 'ACCOUNT_DISABLED');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError(403, 'لا تملك صلاحية للوصول إلى هذا المورد', 'FORBIDDEN'));
    }
    next();
  };
}
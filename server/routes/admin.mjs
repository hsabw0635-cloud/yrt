import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, queryOne, transaction } from '../db.mjs';
import { authRequired, requireRole } from '../auth.mjs';
import { asyncHandler, AppError } from '../errors.mjs';
import { audit } from '../audit.mjs';
import { getStudentAcademicFile } from '../student-file.mjs';
import { buildReport, summarize } from '../reports.mjs';
import { parseDate, toDateString } from '../utils.mjs';
import { removeDepartments, removeLevels, removeSubjects, removeUser } from '../cascade.mjs';
import { cleanupAttendancePhotos } from '../cleanup.mjs';
import { publish } from '../realtime.mjs';

export const adminRouter = Router();
adminRouter.use(authRequired, requireRole('admin'));

const id = z.coerce.number().int().positive();
const optionalId = z.coerce.number().int().positive().nullish();
const active = z.coerce.boolean().optional();
const password = z.string().min(8, 'كلمة المرور يجب ألا تقل عن 8 أحرف').max(128);
const studyMode = z.enum(['morning', 'evening']);

const userCreateSchema = z.object({
  username: z.string().trim().min(3).max(80),
  password,
  role: z.enum(['admin', 'doctor', 'student']),
  fullName: z.string().trim().min(2).max(200).optional(),
  universityNumber: z.string().trim().max(50).optional(),
  departmentId: optionalId,
  levelId: optionalId,
  studyMode: studyMode.optional(),
  phone: z.string().trim().max(30).optional(),
});

const userUpdateSchema = z.object({
  username: z.string().trim().min(3).max(80).optional(),
  password: password.optional(),
  isActive: active,
  fullName: z.string().trim().min(2).max(200).optional(),
  universityNumber: z.string().trim().max(50).optional(),
  departmentId: optionalId,
  levelId: optionalId,
  studyMode: studyMode.optional(),
  phone: z.string().trim().max(30).optional(),
  profileCompleted: z.coerce.boolean().optional(),
});

async function ensureStudentRow(userId, data, connection) {
  const [existingRows] = await connection.execute('SELECT id FROM students WHERE user_id = ?', [userId]);
  if (existingRows[0]) return existingRows[0];
  if (!data.universityNumber || !data.fullName) return null;
  const [result] = await connection.execute(
    `INSERT INTO students (user_id, university_number, full_name, department_id, level_id, study_mode, profile_completed)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, data.universityNumber, data.fullName, data.departmentId || null, data.levelId || null, data.studyMode || null, data.profileCompleted ? 1 : 0],
  );
  const [rows] = await connection.execute('SELECT id FROM students WHERE id = ?', [result.insertId]);
  return rows[0];
}

async function ensureDoctorRow(userId, data, connection) {
  const [existingRows] = await connection.execute('SELECT id FROM doctors WHERE user_id = ?', [userId]);
  if (existingRows[0]) return existingRows[0];
  if (!data.fullName) return null;
  const [result] = await connection.execute(
    'INSERT INTO doctors (user_id, full_name, department_id, phone) VALUES (?, ?, ?, ?)',
    [userId, data.fullName, data.departmentId || null, data.phone || null],
  );
  const [rows] = await connection.execute('SELECT id FROM doctors WHERE id = ?', [result.insertId]);
  return rows[0];
}

adminRouter.get('/dashboard', asyncHandler(async (_req, res) => {
  const row = await queryOne(
    `SELECT
       (SELECT COUNT(*) FROM users) AS users,
       (SELECT COUNT(*) FROM users WHERE role = 'student') AS students,
       (SELECT COUNT(*) FROM users WHERE role = 'doctor') AS doctors,
       (SELECT COUNT(*) FROM departments) AS departments,
       (SELECT COUNT(*) FROM subjects) AS subjects,
       (SELECT COUNT(*) FROM lecture_sessions WHERE session_date = CURDATE()) AS sessionsToday,
       (SELECT COUNT(*) FROM attendance_records ar JOIN lecture_sessions ls ON ls.id = ar.session_id WHERE ls.session_date = CURDATE()) AS presentToday,
       (SELECT COUNT(*) FROM users WHERE is_active = 0) AS disabledUsers`,
  );
  const recent = await query(
    `SELECT ar.marked_at, st.full_name AS student_name, subj.name AS subject_name, ls.session_date
     FROM attendance_records ar
     JOIN students st ON st.id = ar.student_id
     JOIN lecture_sessions ls ON ls.id = ar.session_id
     JOIN lecture_schedules sch ON sch.id = ls.schedule_id
     JOIN subjects subj ON subj.id = sch.subject_id
     ORDER BY ar.marked_at DESC LIMIT 8`,
  );
  res.json({ stats: row, recent });
}));

adminRouter.get('/users', asyncHandler(async (req, res) => {
  const role = typeof req.query.role === 'string' ? req.query.role : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const params = [];
  let where = 'WHERE 1=1';
  if (role && role !== 'all') { where += ' AND u.role = ?'; params.push(role); }
  if (search) {
    where += ' AND (u.username LIKE ? OR d.full_name LIKE ? OR s.full_name LIKE ? OR s.university_number LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  const rows = await query(
    `SELECT u.id, u.username, u.role, u.is_active, u.last_login_at, u.created_at,
            d.id AS doctor_id, d.full_name AS doctor_name, d.phone,
            s.id AS student_id, s.full_name AS student_name, s.university_number, s.profile_completed,
            s.department_id, s.level_id, s.study_mode,
            dep.name AS department_name, lvl.name AS level_name, sm.label_ar AS study_mode_label
     FROM users u
     LEFT JOIN doctors d ON d.user_id = u.id
     LEFT JOIN students s ON s.user_id = u.id
     LEFT JOIN departments dep ON dep.id = COALESCE(s.department_id, d.department_id)
     LEFT JOIN levels lvl ON lvl.id = s.level_id
     LEFT JOIN study_modes sm ON sm.code = s.study_mode
     ${where}
     ORDER BY u.created_at DESC LIMIT 500`,
    params,
  );
  res.json({ users: rows });
}));

adminRouter.post('/users', asyncHandler(async (req, res) => {
  const data = userCreateSchema.parse(req.body);
  if (data.role === 'doctor' && !data.fullName) {
    throw new AppError(400, 'الاسم الرباعي مطلوب عند إنشاء حساب دكتور');
  }
  if (data.universityNumber && !data.fullName) {
    throw new AppError(400, 'الاسم الرباعي مطلوب عند إدخال الرقم الجامعي');
  }
  const userId = await transaction(async (connection) => {
    const [result] = await connection.execute(
      'INSERT INTO users (username, password_hash, role, is_active, password_changed_at) VALUES (?, ?, ?, 1, NOW())',
      [data.username, await bcrypt.hash(data.password, 12), data.role],
    );
    const newId = result.insertId;
    if (data.role === 'student') {
      if (data.universityNumber || data.fullName) await ensureStudentRow(newId, data, connection);
    } else if (data.role === 'doctor') {
      await ensureDoctorRow(newId, data, connection);
    }
    return newId;
  });
  await audit(req, 'USER_CREATED', 'user', userId, { username: data.username, role: data.role });
  res.status(201).json({ id: userId });
}));

adminRouter.patch('/users/:id', asyncHandler(async (req, res) => {
  const userId = id.parse(req.params.id);
  const data = userUpdateSchema.parse(req.body);
  const current = await queryOne('SELECT * FROM users WHERE id = ?', [userId]);
  if (!current) throw new AppError(404, 'المستخدم غير موجود', 'NOT_FOUND');

  await transaction(async (connection) => {
    const sets = [];
    const params = [];
    if (data.username) { sets.push('username = ?'); params.push(data.username); }
    if (data.password) { sets.push('password_hash = ?'); params.push(await bcrypt.hash(data.password, 12)); }
    if (typeof data.isActive === 'boolean') { sets.push('is_active = ?'); params.push(data.isActive ? 1 : 0); }
    if (sets.length) {
      params.push(userId);
      await connection.execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
    }
    if (current.role === 'student') {
      const student = await ensureStudentRow(userId, data, connection);
      if (student) {
        const studentSets = [];
        const studentParams = [];
        for (const [column, value] of [
          ['full_name', data.fullName], ['university_number', data.universityNumber],
          ['department_id', data.departmentId], ['level_id', data.levelId], ['study_mode', data.studyMode],
          ['profile_completed', typeof data.profileCompleted === 'boolean' ? (data.profileCompleted ? 1 : 0) : undefined],
        ]) {
          if (value !== undefined) { studentSets.push(`${column} = ?`); studentParams.push(value); }
        }
        if (studentSets.length) {
          studentParams.push(student.id);
          await connection.execute(`UPDATE students SET ${studentSets.join(', ')} WHERE id = ?`, studentParams);
        }
      }
    }
    if (current.role === 'doctor') {
      const doctor = await ensureDoctorRow(userId, data, connection);
      if (doctor) {
        const doctorSets = [];
        const doctorParams = [];
        if (data.fullName) { doctorSets.push('full_name = ?'); doctorParams.push(data.fullName); }
        if (data.departmentId !== undefined) { doctorSets.push('department_id = ?'); doctorParams.push(data.departmentId); }
        if (data.phone !== undefined) { doctorSets.push('phone = ?'); doctorParams.push(data.phone); }
        if (doctorSets.length) {
          doctorParams.push(doctor.id);
          await connection.execute(`UPDATE doctors SET ${doctorSets.join(', ')} WHERE id = ?`, doctorParams);
        }
      }
    }
  });
  await audit(req, 'USER_UPDATED', 'user', userId, data);
  res.json({ ok: true });
}));

adminRouter.post('/users/:id/reset-password', asyncHandler(async (req, res) => {
  const userId = id.parse(req.params.id);
  const { password: newPassword } = z.object({ password }).parse(req.body);
  const hash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE users SET password_hash = ?, password_changed_at = NOW() WHERE id = ?', [hash, userId]);
  await audit(req, 'PASSWORD_RESET', 'user', userId);
  res.json({ ok: true });
}));

adminRouter.delete('/users/:id', asyncHandler(async (req, res) => {
  const userId = id.parse(req.params.id);
  if (userId === Number(req.user.id)) throw new AppError(400, 'لا يمكن حذف حسابك أثناء تسجيل الدخول');
  const target = await queryOne('SELECT id, role FROM users WHERE id = ?', [userId]);
  if (!target) throw new AppError(404, 'المستخدم غير موجود', 'NOT_FOUND');
  if (target.role === 'admin') {
    const admins = await query("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
    if (Number(admins[0]?.count || 0) <= 1) throw new AppError(400, 'لا يمكن حذف آخر مدير في النظام');
  }
  await removeUser(userId);
  await audit(req, 'USER_DELETED', 'user', userId, { role: target.role });
  res.json({ ok: true });
}));

adminRouter.get('/departments', asyncHandler(async (_req, res) => {
  res.json({ departments: await query('SELECT * FROM departments ORDER BY name') });
}));

adminRouter.post('/departments', asyncHandler(async (req, res) => {
  const data = z.object({ name: z.string().trim().min(2), code: z.string().trim().min(1).max(30) }).parse(req.body);
  const result = await query('INSERT INTO departments (name, code) VALUES (?, ?)', [data.name, data.code]);
  await audit(req, 'DEPARTMENT_CREATED', 'department', result.insertId, data);
  res.status(201).json({ id: result.insertId });
}));

adminRouter.patch('/departments/:id', asyncHandler(async (req, res) => {
  const departmentId = id.parse(req.params.id);
  const data = z.object({
    name: z.string().trim().min(2).optional(),
    code: z.string().trim().min(1).max(30).optional(),
    isActive: active,
  }).parse(req.body);
  const sets = [];
  const params = [];
  if (data.name) { sets.push('name = ?'); params.push(data.name); }
  if (data.code) { sets.push('code = ?'); params.push(data.code); }
  if (typeof data.isActive === 'boolean') { sets.push('is_active = ?'); params.push(data.isActive ? 1 : 0); }
  if (sets.length) await query(`UPDATE departments SET ${sets.join(', ')} WHERE id = ?`, [...params, departmentId]);
  await audit(req, 'DEPARTMENT_UPDATED', 'department', departmentId, data);
  res.json({ ok: true });
}));

adminRouter.delete('/departments/:id', asyncHandler(async (req, res) => {
  const departmentId = id.parse(req.params.id);
  const target = await queryOne('SELECT id FROM departments WHERE id = ?', [departmentId]);
  if (!target) throw new AppError(404, 'القسم غير موجود', 'NOT_FOUND');
  await removeDepartments([departmentId]);
  await audit(req, 'DEPARTMENT_DELETED', 'department', departmentId);
  res.json({ ok: true });
}));

adminRouter.put('/departments/:id/levels', asyncHandler(async (req, res) => {
  const departmentId = id.parse(req.params.id);
  const { levelIds } = z.object({ levelIds: z.array(z.number().int().positive()) }).parse(req.body);
  await transaction(async (connection) => {
    await connection.execute('DELETE FROM department_levels WHERE department_id = ?', [departmentId]);
    for (const levelId of levelIds) {
      await connection.execute('INSERT INTO department_levels (department_id, level_id) VALUES (?, ?)', [departmentId, levelId]);
    }
  });
  await audit(req, 'DEPARTMENT_LEVELS_UPDATED', 'department', departmentId, { levelIds });
  res.json({ ok: true });
}));

adminRouter.get('/levels', asyncHandler(async (_req, res) => {
  res.json({ levels: await query('SELECT * FROM levels ORDER BY name') });
}));

adminRouter.post('/levels', asyncHandler(async (req, res) => {
  const data = z.object({ name: z.string().trim().min(1), code: z.string().trim().min(1).max(30) }).parse(req.body);
  const result = await query('INSERT INTO levels (name, code) VALUES (?, ?)', [data.name, data.code]);
  await audit(req, 'LEVEL_CREATED', 'level', result.insertId, data);
  res.status(201).json({ id: result.insertId });
}));

adminRouter.delete('/levels/:id', asyncHandler(async (req, res) => {
  const levelId = id.parse(req.params.id);
  const target = await queryOne('SELECT id FROM levels WHERE id = ?', [levelId]);
  if (!target) throw new AppError(404, 'المرحلة غير موجودة', 'NOT_FOUND');
  await removeLevels([levelId]);
  await audit(req, 'LEVEL_DELETED', 'level', levelId);
  res.json({ ok: true });
}));

adminRouter.get('/subjects', asyncHandler(async (_req, res) => {
  res.json({
    subjects: await query(
      `SELECT s.*, dep.name AS department_name, lvl.name AS level_name
       FROM subjects s
       JOIN departments dep ON dep.id = s.department_id
       JOIN levels lvl ON lvl.id = s.level_id
       ORDER BY s.name`,
    ),
  });
}));

const subjectSchema = z.object({
  name: z.string().trim().min(2),
  code: z.string().trim().min(1).max(50),
  departmentId: z.number().int().positive(),
  levelId: z.number().int().positive(),
  isActive: active,
});

adminRouter.post('/subjects', asyncHandler(async (req, res) => {
  const data = subjectSchema.parse(req.body);
  const result = await query(
    'INSERT INTO subjects (name, code, department_id, level_id, is_active) VALUES (?, ?, ?, ?, ?)',
    [data.name, data.code, data.departmentId, data.levelId, data.isActive === false ? 0 : 1],
  );
  await audit(req, 'SUBJECT_CREATED', 'subject', result.insertId, data);
  res.status(201).json({ id: result.insertId });
}));

adminRouter.patch('/subjects/:id', asyncHandler(async (req, res) => {
  const subjectId = id.parse(req.params.id);
  const data = subjectSchema.partial().parse(req.body);
  const map = {
    name: 'name', code: 'code', departmentId: 'department_id',
    levelId: 'level_id', isActive: 'is_active',
  };
  const sets = [];
  const params = [];
  for (const [key, column] of Object.entries(map)) {
    if (data[key] !== undefined) {
      sets.push(`${column} = ?`);
      params.push(key === 'isActive' ? (data[key] ? 1 : 0) : data[key]);
    }
  }
  if (sets.length) await query(`UPDATE subjects SET ${sets.join(', ')} WHERE id = ?`, [...params, subjectId]);
  await audit(req, 'SUBJECT_UPDATED', 'subject', subjectId, data);
  res.json({ ok: true });
}));

adminRouter.delete('/subjects/:id', asyncHandler(async (req, res) => {
  const subjectId = id.parse(req.params.id);
  const target = await queryOne('SELECT id FROM subjects WHERE id = ?', [subjectId]);
  if (!target) throw new AppError(404, 'المادة غير موجودة', 'NOT_FOUND');
  await removeSubjects([subjectId]);
  await audit(req, 'SUBJECT_DELETED', 'subject', subjectId);
  res.json({ ok: true });
}));

adminRouter.get('/students', asyncHandler(async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const params = [];
  let where = 'WHERE 1=1';
  if (search) {
    where += ' AND (st.full_name LIKE ? OR st.university_number LIKE ? OR u.username LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const rows = await query(
    `SELECT st.*, u.username, u.is_active, dep.name AS department_name,
            lvl.name AS level_name, sm.label_ar AS study_mode_label
     FROM students st JOIN users u ON u.id = st.user_id
     LEFT JOIN departments dep ON dep.id = st.department_id
     LEFT JOIN levels lvl ON lvl.id = st.level_id
     LEFT JOIN study_modes sm ON sm.code = st.study_mode
     ${where} ORDER BY st.full_name LIMIT 500`,
    params,
  );
  res.json({ students: rows });
}));

adminRouter.get('/students/:id', asyncHandler(async (req, res) => {
  res.json(await getStudentAcademicFile(id.parse(req.params.id), req.user));
}));

// الدكتور فقط هو من ينشئ المحاضرات ويحذفها؛ للمدير عرض قراءة فقط.
adminRouter.get('/lectures', asyncHandler(async (_req, res) => {
  const rows = await query(
    `SELECT sch.*, subj.name AS subject_name, subj.code AS subject_code,
            d.full_name AS doctor_name, dep.name AS department_name, lvl.name AS level_name,
            sm.label_ar AS study_mode_label
     FROM lecture_schedules sch
     JOIN subjects subj ON subj.id = sch.subject_id
     JOIN doctors d ON d.id = sch.doctor_id
     JOIN departments dep ON dep.id = sch.department_id
     JOIN levels lvl ON lvl.id = sch.level_id
     JOIN study_modes sm ON sm.code = sch.study_mode
     ORDER BY sch.day_of_week, sch.start_time`,
  );
  res.json({ lectures: rows });
}));

adminRouter.get('/attendance', asyncHandler(async (req, res) => {
  const dateFrom = parseDate(String(req.query.dateFrom || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)), 'تاريخ البداية');
  const dateTo = parseDate(String(req.query.dateTo || toDateString()), 'تاريخ النهاية');
  const search = String(req.query.search || '').trim().toLowerCase();
  let rows = await buildReport({ scope: 'monthly', dateFrom, dateTo }, req.user);
  if (search) rows = rows.filter((row) => `${row.student} ${row.universityNumber} ${row.subject}`.toLowerCase().includes(search));
  res.json({ rows, summary: summarize(rows) });
}));

adminRouter.post('/cleanup/photos', asyncHandler(async (req, res) => {
  const includeToday = z.coerce.boolean().optional().parse(req.body?.includeToday) === true;
  const result = await cleanupAttendancePhotos({ includeToday });
  publish('photos:cleaned', result);
  await audit(req, 'ATTENDANCE_PHOTOS_CLEANED', 'attachments', null, { ...result, includeToday });
  res.json({ ok: true, ...result });
}));

adminRouter.get('/audit-logs', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 500);
  const rows = await query(
    `SELECT al.*, u.username FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     ORDER BY al.created_at DESC LIMIT ?`,
    [limit],
  );
  res.json({ logs: rows });
}));

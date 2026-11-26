import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.mjs';
import { authRequired, clearAuthCookie, requireRole } from '../auth.mjs';
import { asyncHandler, AppError } from '../errors.mjs';
import { audit } from '../audit.mjs';
import { getDoctorSession, getDoctorSessions, getSessionAttendance, ensureSessionsAround } from '../sessions.mjs';
import { getStudentAcademicFile } from '../student-file.mjs';
import { publish } from '../realtime.mjs';
import { addDays, parseDate, parseTime, toDateString } from '../utils.mjs';
import { removeDoctors, removeSchedules } from '../cascade.mjs';

export const doctorRouter = Router();
doctorRouter.use(authRequired, requireRole('doctor'));

function doctorIdOf(req) {
  if (!req.user.doctor_id) throw new AppError(403, 'حساب الدكتور غير مكتمل', 'DOCTOR_PROFILE_MISSING');
  return Number(req.user.doctor_id);
}

doctorRouter.get('/dashboard', asyncHandler(async (req, res) => {
  const doctorId = doctorIdOf(req);
  await ensureSessionsAround();
  const [subjects, today, upcoming, recent] = await Promise.all([
    query(
      `SELECT DISTINCT subj.id, subj.name, subj.code, dep.name AS department_name, lvl.name AS level_name
       FROM lecture_schedules sch
       JOIN subjects subj ON subj.id = sch.subject_id
       JOIN departments dep ON dep.id = sch.department_id
       JOIN levels lvl ON lvl.id = sch.level_id
       WHERE sch.doctor_id = ? ORDER BY subj.name`,
      [doctorId],
    ),
    getDoctorSessions(doctorId, { date: toDateString() }),
    getDoctorSessions(doctorId, { from: addDays(toDateString(), 1), to: addDays(toDateString(), 14), limit: 20 }),
    query(
      `SELECT ls.session_date, subj.name AS subject_name,
              (SELECT COUNT(*) FROM attendance_records ar WHERE ar.session_id = ls.id) AS present_count
       FROM lecture_sessions ls
       JOIN lecture_schedules sch ON sch.id = ls.schedule_id
       JOIN subjects subj ON subj.id = sch.subject_id
       WHERE sch.doctor_id = ? AND ls.session_date < CURDATE()
       ORDER BY ls.session_date DESC LIMIT 8`,
      [doctorId],
    ),
  ]);

  const todayTotals = today.reduce((acc, item) => ({
    total: acc.total + item.counts.total,
    present: acc.present + item.counts.present,
    absent: acc.absent + item.counts.absent,
  }), { total: 0, present: 0, absent: 0 });

  res.json({ subjects, today, upcoming, recent, stats: { ...todayTotals, sessions: today.length } });
}));

doctorRouter.get('/sessions/today', asyncHandler(async (req, res) => {
  const date = req.query.date ? parseDate(String(req.query.date)) : toDateString();
  res.json({ sessions: await getDoctorSessions(doctorIdOf(req), { date }) });
}));

doctorRouter.get('/sessions/:id', asyncHandler(async (req, res) => {
  const session = await getDoctorSession(doctorIdOf(req), Number(req.params.id));
  if (!session) throw new AppError(404, 'المحاضرة غير موجودة', 'NOT_FOUND');
  res.json({ session });
}));

async function changeSessionStatus(req, status) {
  const doctorId = doctorIdOf(req);
  const sessionId = Number(req.params.id);
  const session = await getDoctorSession(doctorId, sessionId);
  if (!session) throw new AppError(404, 'المحاضرة غير موجودة', 'NOT_FOUND');
  if (session.status === 'expired') throw new AppError(400, 'انتهى وقت المحاضرة، لا يمكن تغيير الحالة');

  if (status === 'open' && session.status !== 'open') {
    await query(
      `UPDATE lecture_sessions SET status = 'open', opened_at = NOW(), closed_at = NULL, opened_by_user_id = ? WHERE id = ?`,
      [req.user.id, sessionId],
    );
  } else if (status === 'closed' && session.status !== 'closed') {
    await query(
      "UPDATE lecture_sessions SET status = 'closed', closed_at = NOW() WHERE id = ?",
      [sessionId],
    );
  }

  publish(`session:${status}`, {
    sessionId,
    date: session.date,
    status,
    subject: session.subject.name,
    classroom: session.classroom,
  });
  await audit(req, `SESSION_${status.toUpperCase()}`, 'lecture_session', sessionId, { subject: session.subject.name });
  return { ok: true, status };
}

doctorRouter.post('/sessions/:id/open', asyncHandler(async (req, res) => {
  res.json(await changeSessionStatus(req, 'open'));
}));

doctorRouter.post('/sessions/:id/close', asyncHandler(async (req, res) => {
  res.json(await changeSessionStatus(req, 'closed'));
}));

doctorRouter.get('/sessions/:id/attendance', asyncHandler(async (req, res) => {
  const doctorId = doctorIdOf(req);
  const session = await getDoctorSession(doctorId, Number(req.params.id));
  if (!session) throw new AppError(404, 'المحاضرة غير موجودة', 'NOT_FOUND');
  const search = String(req.query.search || '').trim();
  const students = await getSessionAttendance(Number(req.params.id), search);
  const present = students.filter((item) => item.status === 'present').length;
  res.json({
    session,
    students,
    stats: {
      total: students.length,
      present,
      absent: students.length - present,
      pending: session.status === 'open' ? students.length - present : 0,
      violations: students.filter((item) => item.attendance?.verificationStatus === 'suspicious').length,
    },
  });
}));

doctorRouter.get('/students', asyncHandler(async (req, res) => {
  const doctorId = doctorIdOf(req);
  const search = String(req.query.search || '').trim();
  const params = [doctorId];
  let where = `WHERE EXISTS (
      SELECT 1 FROM lecture_schedules sch
      WHERE sch.doctor_id = ? AND sch.department_id = st.department_id
        AND sch.level_id = st.level_id AND sch.study_mode = st.study_mode
    ) AND st.profile_completed = 1`;
  if (search) {
    where += ' AND (st.full_name LIKE ? OR st.university_number LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  const rows = await query(
    `SELECT st.id, st.full_name, st.university_number, st.study_mode,
            dep.name AS department_name, lvl.name AS level_name,
            (SELECT COUNT(*) FROM attendance_records ar WHERE ar.student_id = st.id) AS present_count
     FROM students st
     JOIN users u ON u.id = st.user_id AND u.is_active = 1
     LEFT JOIN departments dep ON dep.id = st.department_id
     LEFT JOIN levels lvl ON lvl.id = st.level_id
     ${where} ORDER BY st.full_name LIMIT 300`,
    params,
  );
  res.json({ students: rows });
}));

doctorRouter.get('/students/:id', asyncHandler(async (req, res) => {
  const file = await getStudentAcademicFile(Number(req.params.id), { role: 'doctor', doctor_id: doctorIdOf(req) });
  res.json(file);
}));

doctorRouter.get('/schedule', asyncHandler(async (req, res) => {
  const from = parseDate(String(req.query.from || toDateString()));
  const to = parseDate(String(req.query.to || addDays(from, 30)));
  res.json({ sessions: await getDoctorSessions(doctorIdOf(req), { from, to, limit: 300 }) });
}));

doctorRouter.get('/profile', asyncHandler(async (req, res) => {
  const doctor = await queryOne(
    `SELECT d.*, u.username, u.is_active, dep.name AS department_name
     FROM doctors d JOIN users u ON u.id = d.user_id
     LEFT JOIN departments dep ON dep.id = d.department_id
     WHERE d.user_id = ?`,
    [req.user.id],
  );
  res.json({ doctor });
}));

// --- إدارة المحاضرات الخاصة بالدكتور فقط ------------------------------------

const studyMode = z.enum(['morning', 'evening']);
const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

async function doctorDepartment(req) {
  const doctor = await queryOne('SELECT id, department_id FROM doctors WHERE id = ?', [doctorIdOf(req)]);
  if (!doctor) throw new AppError(403, 'حساب الدكتور غير مكتمل', 'DOCTOR_PROFILE_MISSING');
  if (!doctor.department_id) throw new AppError(400, 'لا يوجد قسم مسند إلى حسابك، راجع الإدارة');
  return doctor;
}

// المواد المتاحة للدكتور حسب قسمه والمرحلة التي يختارها
doctorRouter.get('/subjects', asyncHandler(async (req, res) => {
  const doctor = await doctorDepartment(req);
  const levelId = z.coerce.number().int().positive().parse(req.query.levelId);
  const subjects = await query(
    `SELECT s.id, s.name, s.code, s.level_id, lvl.name AS level_name
     FROM subjects s JOIN levels lvl ON lvl.id = s.level_id
     WHERE s.department_id = ? AND s.level_id = ? AND s.is_active = 1
     ORDER BY s.name`,
    [doctor.department_id, levelId],
  );
  res.json({ subjects });
}));

const lectureCreateSchema = z.object({
  subjectId: z.number().int().positive(),
  levelId: z.number().int().positive(),
  studyMode,
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: timeString,
  endTime: timeString,
  classroom: z.string().trim().min(1).max(100),
});

doctorRouter.post('/lectures', asyncHandler(async (req, res) => {
  const doctor = await doctorDepartment(req);
  const data = lectureCreateSchema.parse(req.body);
  if (data.startTime >= data.endTime) throw new AppError(400, 'وقت النهاية يجب أن يكون بعد وقت البداية');

  const subject = await queryOne(
    `SELECT id FROM subjects
     WHERE id = ? AND department_id = ? AND level_id = ? AND is_active = 1`,
    [data.subjectId, doctor.department_id, data.levelId],
  );
  if (!subject) throw new AppError(400, 'المادة غير متاحة للقسم أو المرحلة المختارة');

  const result = await query(
    `INSERT INTO lecture_schedules
       (subject_id, doctor_id, department_id, level_id, study_mode, day_of_week, start_time, end_time, classroom, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [data.subjectId, doctor.id, doctor.department_id, data.levelId, data.studyMode,
      data.dayOfWeek, parseTime(data.startTime), parseTime(data.endTime), data.classroom],
  );
  await ensureSessionsAround();
  publish('lecture:created', { lectureId: result.insertId, levelId: data.levelId, studyMode: data.studyMode, departmentId: doctor.department_id });
  await audit(req, 'LECTURE_CREATED', 'lecture_schedule', result.insertId, { ...data, createdBy: 'doctor' });
  res.status(201).json({ id: result.insertId });
}));

// جدول المحاضرات التي أنشأها الدكتور (لإمكانية حذفها)
doctorRouter.get('/lectures', asyncHandler(async (req, res) => {
  const doctorId = doctorIdOf(req);
  const lectures = await query(
    `SELECT sch.*, subj.name AS subject_name, subj.code AS subject_code,
            dep.name AS department_name, lvl.name AS level_name,
            sm.label_ar AS study_mode_label,
            (SELECT COUNT(*) FROM lecture_sessions ls WHERE ls.schedule_id = sch.id) AS session_count
     FROM lecture_schedules sch
     JOIN subjects subj ON subj.id = sch.subject_id
     JOIN departments dep ON dep.id = sch.department_id
     JOIN levels lvl ON lvl.id = sch.level_id
     JOIN study_modes sm ON sm.code = sch.study_mode
     WHERE sch.doctor_id = ?
     ORDER BY sch.day_of_week, sch.start_time`,
    [doctorId],
  );
  res.json({ lectures });
}));

doctorRouter.delete('/lectures/:id', asyncHandler(async (req, res) => {
  const doctorId = doctorIdOf(req);
  const lectureId = Number(req.params.id);
  const lecture = await queryOne('SELECT id, subject_id FROM lecture_schedules WHERE id = ? AND doctor_id = ?', [lectureId, doctorId]);
  if (!lecture) throw new AppError(404, 'المحاضرة غير موجودة أو لا تخص حسابك', 'NOT_FOUND');
  await removeSchedules([lectureId]);
  publish('lecture:deleted', { lectureId });
  await audit(req, 'LECTURE_DELETED', 'lecture_schedule', lectureId, { createdBy: 'doctor' });
  res.json({ ok: true });
}));

// حذف حساب الدكتور نفسه مع كل بياناته المرتبطة
doctorRouter.delete('/account', asyncHandler(async (req, res) => {
  const doctorId = doctorIdOf(req);
  const doctor = await queryOne('SELECT id, user_id FROM doctors WHERE id = ?', [doctorId]);
  if (!doctor) throw new AppError(404, 'حساب الدكتور غير موجود', 'NOT_FOUND');
  await removeDoctors([{ id: doctor.id, user_id: doctor.user_id }]);
  await audit(req, 'ACCOUNT_DELETED', 'doctor', doctorId);
  clearAuthCookie(res);
  res.json({ ok: true });
}));

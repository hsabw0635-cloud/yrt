import { query, queryOne } from './db.mjs';
import {
  addDays,
  attendanceDisplayStatus,
  dayOfWeek,
  DAY_NAMES,
  sessionDisplayStatus,
  toDateString,
} from './utils.mjs';

export async function ensureSessionsForRange(fromDate, toDate) {
  const schedules = await query(
    'SELECT id, day_of_week FROM lecture_schedules WHERE is_active = 1',
  );
  if (!schedules.length) return 0;

  const values = [];
  for (let date = fromDate; date <= toDate; date = addDays(date, 1)) {
    const day = dayOfWeek(date);
    for (const schedule of schedules) {
      if (Number(schedule.day_of_week) === day) values.push([schedule.id, date]);
    }
  }
  if (!values.length) return 0;

  const chunks = [];
  for (let i = 0; i < values.length; i += 400) chunks.push(values.slice(i, i + 400));
  let inserted = 0;
  for (const chunk of chunks) {
    const placeholders = chunk.map(() => '(?, ?, NOW())').join(',');
    await query(
      `INSERT INTO lecture_sessions (schedule_id, session_date, created_at)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE id = id`,
      chunk.flat(),
    );
    inserted += chunk.length;
  }
  return inserted;
}

export async function ensureSessionsAround(date = toDateString(), days = 30) {
  return ensureSessionsForRange(addDays(date, -7), addDays(date, days));
}

const studentSessionSelect = `
  SELECT ls.id AS session_id, ls.session_date, ls.status AS session_status,
         ls.opened_at, ls.closed_at,
         sch.id AS schedule_id, sch.day_of_week, sch.start_time, sch.end_time,
         sch.classroom, sch.study_mode,
         subj.id AS subject_id, subj.name AS subject_name, subj.code AS subject_code,
         d.id AS doctor_id, d.full_name AS doctor_name,
         dep.id AS department_id, dep.name AS department_name,
         lvl.id AS level_id, lvl.name AS level_name,
         ar.id AS attendance_id, ar.marked_at
  FROM lecture_sessions ls
  JOIN lecture_schedules sch ON sch.id = ls.schedule_id
  JOIN subjects subj ON subj.id = sch.subject_id
  JOIN doctors d ON d.id = sch.doctor_id
  JOIN departments dep ON dep.id = sch.department_id
  JOIN levels lvl ON lvl.id = sch.level_id
  LEFT JOIN attendance_records ar ON ar.session_id = ls.id AND ar.student_id = ?
`;

export function mapStudentSession(row, now = new Date()) {
  return {
    sessionId: Number(row.session_id),
    scheduleId: Number(row.schedule_id),
    date: row.session_date,
    dayName: DAY_NAMES[Number(row.day_of_week)] || '',
    startTime: String(row.start_time).slice(0, 5),
    endTime: String(row.end_time).slice(0, 5),
    status: sessionDisplayStatus({ ...row, status: row.session_status }, now),
    rawStatus: row.session_status,
    subject: { id: Number(row.subject_id), name: row.subject_name, code: row.subject_code },
    doctor: { id: Number(row.doctor_id), name: row.doctor_name },
    department: { id: Number(row.department_id), name: row.department_name },
    level: { id: Number(row.level_id), name: row.level_name },
    studyMode: row.study_mode,
    classroom: row.classroom,
    attendance: row.attendance_id
      ? { markedAt: row.marked_at }
      : null,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
  };
}

export async function getStudentSessions(studentId, date, now = new Date()) {
  const student = await queryOne(
    'SELECT department_id, level_id, study_mode FROM students WHERE id = ?',
    [studentId],
  );
  if (!student) return [];
  await ensureSessionsAround(date, 2);
  const rows = await query(
    `${studentSessionSelect}
     WHERE ls.session_date = ?
       AND sch.department_id = ? AND sch.level_id = ? AND sch.study_mode = ?
       AND sch.is_active = 1
     ORDER BY sch.start_time`,
    [studentId, date, student.department_id, student.level_id, student.study_mode],
  );
  return rows.map((row) => mapStudentSession(row, now));
}

export async function getStudentSession(sessionId, studentId, now = new Date()) {
  const rows = await query(
    `${studentSessionSelect} WHERE ls.id = ?`,
    [studentId, sessionId],
  );
  const row = rows[0];
  if (!row) return null;

  const eligible = await queryOne(
    `SELECT 1 FROM lecture_sessions ls
     JOIN lecture_schedules sch ON sch.id = ls.schedule_id
     JOIN students st ON st.id = ?
     WHERE ls.id = ?
       AND st.department_id = sch.department_id
       AND st.level_id = sch.level_id
       AND st.study_mode = sch.study_mode
       AND st.profile_completed = 1
       AND sch.is_active = 1
     LIMIT 1`,
    [studentId, sessionId],
  );
  if (!eligible) return null;

  return mapStudentSession(row, now);
}

const doctorSessionSelect = `
  SELECT ls.id AS session_id, ls.session_date, ls.status AS session_status,
         ls.opened_at, ls.closed_at,
         sch.id AS schedule_id, sch.day_of_week, sch.start_time, sch.end_time,
         sch.classroom, sch.study_mode,
         subj.id AS subject_id, subj.name AS subject_name, subj.code AS subject_code,
         d.id AS doctor_id, d.full_name AS doctor_name,
         dep.id AS department_id, dep.name AS department_name,
         lvl.id AS level_id, lvl.name AS level_name,
         (SELECT COUNT(*) FROM students st
            JOIN users u ON u.id = st.user_id
           WHERE st.department_id = sch.department_id
             AND st.level_id = sch.level_id
             AND st.study_mode = sch.study_mode
             AND st.profile_completed = 1
             AND u.is_active = 1) AS total_students,
         (SELECT COUNT(*) FROM attendance_records ar
           WHERE ar.session_id = ls.id) AS present_count
  FROM lecture_sessions ls
  JOIN lecture_schedules sch ON sch.id = ls.schedule_id
  JOIN subjects subj ON subj.id = sch.subject_id
  JOIN doctors d ON d.id = sch.doctor_id
  JOIN departments dep ON dep.id = sch.department_id
  JOIN levels lvl ON lvl.id = sch.level_id
`;

export function mapDoctorSession(row, now = new Date()) {
  const total = Number(row.total_students || 0);
  const present = Number(row.present_count || 0);
  const status = row.session_status || row.status;
  const expired = status === 'closed' || now > new Date(`${row.session_date}T${row.end_time}`);
  return {
    sessionId: Number(row.session_id),
    scheduleId: Number(row.schedule_id),
    date: row.session_date,
    dayName: DAY_NAMES[Number(row.day_of_week)] || '',
    startTime: String(row.start_time).slice(0, 5),
    endTime: String(row.end_time).slice(0, 5),
    status: status === 'open' && !expired ? 'open' : status === 'closed' ? 'closed' : expired ? 'expired' : 'scheduled',
    subject: { id: Number(row.subject_id), name: row.subject_name, code: row.subject_code },
    doctor: { id: Number(row.doctor_id), name: row.doctor_name },
    department: { id: Number(row.department_id), name: row.department_name },
    level: { id: Number(row.level_id), name: row.level_name },
    studyMode: row.study_mode,
    classroom: row.classroom,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    counts: { total, present, absent: Math.max(total - present, 0), pending: status === 'open' && !expired ? Math.max(total - present, 0) : 0 },
  };
}

export async function getDoctorSessions(doctorId, { date = toDateString(), from, to, limit = 50 } = {}, now = new Date()) {
  await ensureSessionsAround(date, 2);
  const params = [doctorId];
  let where = 'WHERE sch.doctor_id = ?';
  if (from && to) {
    where += ' AND ls.session_date BETWEEN ? AND ?';
    params.push(from, to);
  } else if (from) {
    where += ' AND ls.session_date >= ?';
    params.push(from);
  } else {
    where += ' AND ls.session_date = ?';
    params.push(date);
  }
  params.push(limit);
  const rows = await query(`${doctorSessionSelect} ${where} ORDER BY ls.session_date, sch.start_time LIMIT ?`, params);
  return rows.map((row) => mapDoctorSession(row, now));
}

export async function getDoctorSession(doctorId, sessionId, now = new Date()) {
  const rows = await query(`${doctorSessionSelect} WHERE sch.doctor_id = ? AND ls.id = ?`, [doctorId, sessionId]);
  return rows[0] ? mapDoctorSession(rows[0], now) : null;
}

export async function getSessionAttendance(sessionId, search = '') {
  const params = [sessionId];
  let searchSql = '';
  if (search) {
    searchSql = ' AND (st.full_name LIKE ? OR st.university_number LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  const rows = await query(
    `SELECT st.id AS student_id, st.full_name, st.university_number,
            dep.name AS department_name, lvl.name AS level_name, sm.label_ar AS study_mode_label,
            ar.id AS attendance_id, ar.marked_at,
            ar.photo_attachment_id, ar.verification_status, ar.verification_source,
            ar.scene_score, ar.anomaly_reason,
            a.sha256 AS photo_sha256
     FROM lecture_sessions ls
     JOIN lecture_schedules sch ON sch.id = ls.schedule_id
     JOIN students st ON st.department_id = sch.department_id
       AND st.level_id = sch.level_id AND st.study_mode = sch.study_mode
       AND st.profile_completed = 1
     JOIN users u ON u.id = st.user_id AND u.is_active = 1
     JOIN departments dep ON dep.id = st.department_id
     JOIN levels lvl ON lvl.id = st.level_id
     JOIN study_modes sm ON sm.code = st.study_mode
     LEFT JOIN attendance_records ar ON ar.session_id = ls.id AND ar.student_id = st.id
     LEFT JOIN attachments a ON a.id = ar.photo_attachment_id
     WHERE ls.id = ? ${searchSql}
     ORDER BY (ar.verification_status = 'suspicious') DESC, ar.marked_at IS NULL, st.full_name`,
    params,
  );
  return rows.map((row) => ({
    studentId: Number(row.student_id),
    fullName: row.full_name,
    universityNumber: row.university_number,
    department: row.department_name,
    level: row.level_name,
    studyMode: row.study_mode_label,
    status: row.attendance_id ? 'present' : 'absent',
    attendance: row.attendance_id
      ? {
          id: Number(row.attendance_id),
          markedAt: row.marked_at,
          photoAttachmentId: row.photo_attachment_id ? Number(row.photo_attachment_id) : null,
          verificationStatus: row.verification_status || 'verified',
          verificationSource: row.verification_source || 'local',
          sceneScore: row.scene_score == null ? null : Number(row.scene_score),
          anomalyReason: row.anomaly_reason || null,
        }
      : null,
  }));
}

export async function getStudentStats(studentId, date, now = new Date()) {
  const sessions = await getStudentSessions(studentId, date, now);
  const attended = sessions.filter((item) => item.status === 'registered').length;
  const absent = sessions.filter((item) => item.status === 'expired' || item.status === 'closed').length;
  return {
    total: sessions.length,
    attended,
    absent: Math.max(absent, 0),
    rate: sessions.length ? Math.round((attended / sessions.length) * 100) : 0,
  };
}

export { attendanceDisplayStatus };

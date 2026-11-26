import { query, queryOne } from './db.mjs';
import { AppError } from './errors.mjs';
import { attendanceDisplayStatus, DAY_NAMES } from './utils.mjs';

export async function getStudentAcademicFile(studentId, viewer = null) {
  const student = await queryOne(
    `SELECT st.*, u.username, u.is_active, u.last_login_at,
            dep.name AS department_name, lvl.name AS level_name,
            sm.label_ar AS study_mode_label, a.storage_path AS profile_photo_path
     FROM students st
     JOIN users u ON u.id = st.user_id
     LEFT JOIN departments dep ON dep.id = st.department_id
     LEFT JOIN levels lvl ON lvl.id = st.level_id
     LEFT JOIN study_modes sm ON sm.code = st.study_mode
     LEFT JOIN attachments a ON a.id = st.profile_photo_id
     WHERE st.id = ?`,
    [studentId],
  );
  if (!student) throw new AppError(404, 'الطالب غير موجود', 'NOT_FOUND');

  if (viewer?.role === 'doctor') {
    const allowed = await queryOne(
      `SELECT 1 FROM lecture_schedules sch
       WHERE sch.doctor_id = ? AND sch.department_id = ? AND sch.level_id = ? LIMIT 1`,
      [viewer.doctor_id, student.department_id, student.level_id],
    );
    if (!allowed) throw new AppError(403, 'لا يمكنك الاطلاع على ملف هذا الطالب', 'FORBIDDEN');
  }

  const subjects = await query(
    `SELECT subj.id, subj.name, subj.code,
            COUNT(ls.id) AS total_sessions,
            SUM(CASE WHEN ar.id IS NOT NULL THEN 1 ELSE 0 END) AS present_count
     FROM subjects subj
     JOIN lecture_schedules sch ON sch.subject_id = subj.id
       AND sch.department_id = ? AND sch.level_id = ? AND sch.study_mode = ?
     LEFT JOIN lecture_sessions ls ON ls.schedule_id = sch.id
     LEFT JOIN attendance_records ar ON ar.session_id = ls.id AND ar.student_id = ?
     GROUP BY subj.id, subj.name, subj.code
     ORDER BY subj.name`,
    [student.department_id, student.level_id, student.study_mode, studentId],
  );

  const sessions = await query(
    `SELECT ls.session_date, ls.status AS session_status, sch.start_time, sch.end_time,
            sch.day_of_week, subj.name AS subject_name, subj.code AS subject_code,
            d.full_name AS doctor_name, sch.classroom,
            ar.id AS attendance_id, ar.marked_at,
            ar.photo_attachment_id, a.mime AS photo_mime
     FROM lecture_sessions ls
     JOIN lecture_schedules sch ON sch.id = ls.schedule_id
     JOIN subjects subj ON subj.id = sch.subject_id
     JOIN doctors d ON d.id = sch.doctor_id
     LEFT JOIN attendance_records ar ON ar.session_id = ls.id AND ar.student_id = ?
     LEFT JOIN attachments a ON a.id = ar.photo_attachment_id
     WHERE sch.department_id = ? AND sch.level_id = ? AND sch.study_mode = ?
     ORDER BY ls.session_date DESC, sch.start_time DESC
     LIMIT 500`,
    [studentId, student.department_id, student.level_id, student.study_mode],
  );

  const now = new Date();
  const subjectStats = subjects.map((subject) => {
    const total = Number(subject.total_sessions || 0);
    const present = Number(subject.present_count || 0);
    return {
      id: Number(subject.id),
      name: subject.name,
      code: subject.code,
      total,
      present,
      absent: Math.max(total - present, 0),
      rate: total ? Math.round((present / total) * 100) : 0,
    };
  });

  const sessionRows = sessions.map((session) => {
    const status = attendanceDisplayStatus(session, now);
    return {
      date: session.session_date,
      dayName: DAY_NAMES[Number(session.day_of_week)] || '',
      startTime: String(session.start_time).slice(0, 5),
      endTime: String(session.end_time).slice(0, 5),
      subject: session.subject_name,
      subjectCode: session.subject_code,
      doctor: session.doctor_name,
      classroom: session.classroom,
      status,
      statusLabel: { present: 'حاضر', absent: 'غائب', not_marked: 'لم يسجل بعد' }[status],
      markedAt: session.marked_at,
      photoAttachmentId: session.photo_attachment_id ? Number(session.photo_attachment_id) : null,
    };
  });

  const total = sessionRows.length;
  const present = sessionRows.filter((item) => item.status === 'present').length;
  const absent = sessionRows.filter((item) => item.status === 'absent').length;

  return {
    profile: {
      id: Number(student.id),
      fullName: student.full_name,
      universityNumber: student.university_number,
      username: student.username,
      department: student.department_name,
      level: student.level_name,
      studyMode: student.study_mode_label,
      studyModeCode: student.study_mode,
      profileCompleted: Boolean(student.profile_completed),
      isActive: Boolean(student.is_active),
      profilePhotoAttachmentId: student.profile_photo_id ? Number(student.profile_photo_id) : null,
      lastLoginAt: student.last_login_at,
    },
    summary: {
      totalSessions: total,
      present,
      absent,
      pending: total - present - absent,
      rate: total ? Math.round((present / total) * 100) : 0,
    },
    subjects: subjectStats,
    sessions: sessionRows,
  };
}

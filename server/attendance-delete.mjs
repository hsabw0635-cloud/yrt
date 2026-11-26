/** حذف سجل حضور واحد يدوياً مع صورته، مع التحقق من صلاحية الدكتور على الجلسة. */

import fs from 'node:fs/promises';
import { query, queryOne } from './db.mjs';
import { AppError } from './errors.mjs';

export async function deleteAttendanceRecord(recordId, viewer) {
  const id = Number(recordId);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(400, 'معرّف سجل الحضور غير صالح', 'INVALID_ID');

  const row = await queryOne(
    `SELECT ar.id, ar.photo_attachment_id,
            a.storage_path, st.full_name AS student_name,
            sch.doctor_id, ls.session_date
     FROM attendance_records ar
     JOIN lecture_sessions ls ON ls.id = ar.session_id
     JOIN lecture_schedules sch ON sch.id = ls.schedule_id
     JOIN students st ON st.id = ar.student_id
     LEFT JOIN attachments a ON a.id = ar.photo_attachment_id
     WHERE ar.id = ?`,
    [id],
  );
  if (!row) throw new AppError(404, 'سجل الحضور غير موجود', 'NOT_FOUND');

  if (viewer.role === 'doctor' && Number(row.doctor_id) !== Number(viewer.doctor_id)) {
    throw new AppError(403, 'لا يمكنك حذف حضور طالب خارج محاضراتك', 'FORBIDDEN');
  }

  await query('DELETE FROM attendance_records WHERE id = ?', [id]);

  if (row.photo_attachment_id) {
    await query('DELETE FROM attachments WHERE id = ?', [row.photo_attachment_id]);
    if (row.storage_path) await fs.unlink(row.storage_path).catch(() => {});
  }

  return { id, studentName: row.student_name, sessionDate: row.session_date };
}

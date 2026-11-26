import fs from 'node:fs/promises';
import { query, queryOne } from './db.mjs';

/** حذف متسلسل للسجلات المرتبطة. الجداول/Arrays داخلية فقط، لا مدخلات مستخدم. */

const idsOf = (rows, key = 'id') => [...new Set((rows || [])
  .map((row) => Number(row?.[key]))
  .filter((value) => Number.isFinite(value) && value > 0))];

const marks = (values) => values.map(() => '?').join(',');

async function removeRows(table, column, values) {
  const clean = [...new Set(values.map(Number).filter((value) => Number.isFinite(value) && value > 0))];
  if (!clean.length) return;
  await query(`DELETE FROM ${table} WHERE ${column} IN (${marks(clean)})`, clean);
}

async function removeAttachments(values) {
  const clean = [...new Set(values.map(Number).filter((value) => Number.isFinite(value) && value > 0))];
  if (!clean.length) return;
  const rows = await query(`SELECT storage_path FROM attachments WHERE id IN (${marks(clean)})`, clean);
  await removeRows('attachments', 'id', clean);
  await Promise.all(rows.map((row) => row.storage_path && fs.unlink(row.storage_path).catch(() => {})));
}

export async function removeSchedules(scheduleIds) {
  const schedules = idsOf(scheduleIds.map((value) => ({ id: value })));
  if (!schedules.length) return;
  const sessions = await query(`SELECT id FROM lecture_sessions WHERE schedule_id IN (${marks(schedules)})`, schedules);
  const sessionIds = idsOf(sessions);
  if (sessionIds.length) {
    const records = await query(
      `SELECT photo_attachment_id FROM attendance_records WHERE session_id IN (${marks(sessionIds)})`,
      sessionIds,
    );
    await removeAttachments(records.map((row) => row.photo_attachment_id));
    await removeRows('attendance_records', 'session_id', sessionIds);
    await removeRows('lecture_sessions', 'id', sessionIds);
  }
  await removeRows('lecture_schedules', 'id', schedules);
}

export async function removeStudents(students) {
  const studentIds = idsOf(students, 'id');
  if (!studentIds.length) return;
  const records = await query(
    `SELECT photo_attachment_id FROM attendance_records WHERE student_id IN (${marks(studentIds)})`,
    studentIds,
  );
  await removeAttachments([
    ...students.map((student) => student.profile_photo_id),
    ...records.map((record) => record.photo_attachment_id),
  ]);
  await removeRows('attendance_records', 'student_id', studentIds);
  await removeRows('students', 'id', studentIds);
  await removeRows('users', 'id', idsOf(students, 'user_id'));
}

export async function removeDoctors(doctors) {
  const doctorIds = idsOf(doctors, 'id');
  if (!doctorIds.length) return;
  const schedules = await query(`SELECT id FROM lecture_schedules WHERE doctor_id IN (${marks(doctorIds)})`, doctorIds);
  await removeSchedules(idsOf(schedules));
  await removeRows('doctors', 'id', doctorIds);
  await removeRows('users', 'id', idsOf(doctors, 'user_id'));
}

export async function removeSubjects(subjectIds) {
  const clean = idsOf(subjectIds.map((value) => ({ id: value })));
  if (!clean.length) return;
  const schedules = await query(`SELECT id FROM lecture_schedules WHERE subject_id IN (${marks(clean)})`, clean);
  await removeSchedules(idsOf(schedules));
  await removeRows('subjects', 'id', clean);
}

export async function removeDepartments(departmentIds) {
  const clean = idsOf(departmentIds.map((value) => ({ id: value })));
  if (!clean.length) return;
  const subjects = await query(`SELECT id FROM subjects WHERE department_id IN (${marks(clean)})`, clean);
  await removeSubjects(idsOf(subjects));
  const doctors = await query(`SELECT id, user_id FROM doctors WHERE department_id IN (${marks(clean)})`, clean);
  await removeDoctors(doctors);
  const students = await query(`SELECT id, user_id, profile_photo_id FROM students WHERE department_id IN (${marks(clean)})`, clean);
  await removeStudents(students);
  await removeRows('department_levels', 'department_id', clean);
  await removeRows('departments', 'id', clean);
}

export async function removeLevels(levelIds) {
  const clean = idsOf(levelIds.map((value) => ({ id: value })));
  if (!clean.length) return;
  const subjects = await query(`SELECT id FROM subjects WHERE level_id IN (${marks(clean)})`, clean);
  await removeSubjects(idsOf(subjects));
  const students = await query(`SELECT id, user_id, profile_photo_id FROM students WHERE level_id IN (${marks(clean)})`, clean);
  await removeStudents(students);
  await removeRows('department_levels', 'level_id', clean);
  await removeRows('levels', 'id', clean);
}

export async function removeUser(userId) {
  const user = await queryOne('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) return false;
  if (user.role === 'student') {
    const student = await queryOne('SELECT id, user_id, profile_photo_id FROM students WHERE user_id = ?', [userId]);
    if (student) await removeStudents([student]);
  } else if (user.role === 'doctor') {
    const doctor = await queryOne('SELECT id, user_id FROM doctors WHERE user_id = ?', [userId]);
    if (doctor) await removeDoctors([doctor]);
  } else {
    await removeRows('users', 'id', [userId]);
  }
  return true;
}

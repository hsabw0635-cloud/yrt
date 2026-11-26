import { AppError } from './errors.mjs';

export const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function pad(value) {
  return String(value).padStart(2, '0');
}

export function toDateString(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toDateString(date);
}

export function parseDate(value, fieldName = 'التاريخ') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError(400, `${fieldName} غير صالح`);
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime()) || toDateString(date) !== value) {
    throw new AppError(400, `${fieldName} غير صالح`);
  }
  return value;
}

export function parseTime(value, fieldName = 'الوقت') {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new AppError(400, `${fieldName} غير صالح`);
  }
  return `${value}:00`;
}

export function dayOfWeek(dateString) {
  return new Date(`${dateString}T00:00:00`).getDay();
}

export function dateTime(date, time) {
  const normalized = String(time || '00:00:00').slice(0, 8);
  return new Date(`${date}T${normalized}`);
}

export function sessionDisplayStatus(session, now = new Date()) {
  if (session.attendance_id) return 'registered';
  if (session.status === 'closed') return 'closed';
  if (now > dateTime(session.session_date, session.end_time)) return 'expired';
  if (session.status === 'open') return 'open';
  return 'locked';
}

export function attendanceDisplayStatus(session, now = new Date()) {
  if (session.attendance_id) return 'present';
  if (session.status === 'closed' || now > dateTime(session.session_date, session.end_time)) {
    return 'absent';
  }
  return 'not_marked';
}

export function safeJsonParse(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

import 'dotenv/config';
import { query, syncDatabase } from '../db.mjs';

const studyModes = [
  ['morning', 'صباحي'],
  ['evening', 'مسائي'],
];

const permissions = [
  ['users.manage', 'إدارة المستخدمين والحسابات'],
  ['structure.manage', 'إدارة الأقسام والمراحل والمواقع'],
  ['subjects.manage', 'إدارة المواد والمحاضرات'],
  ['attendance.view_all', 'مشاهدة جميع سجلات الحضور'],
  ['reports.export', 'تصدير التقارير'],
  ['lectures.open', 'فتح وإغلاق تسجيل الحضور'],
  ['attendance.create', 'تسجيل حضور الطالب'],
];

for (const [code, label] of studyModes) {
  await query(
    `INSERT INTO study_modes (code, label_ar) VALUES (?, ?)
     ON CONFLICT(code) DO UPDATE SET label_ar = excluded.label_ar`,
    [code, label],
  );
}

for (const [key, description] of permissions) {
  await query(
    `INSERT INTO permissions (permission_key, description) VALUES (?, ?)
     ON CONFLICT(permission_key) DO UPDATE SET description = excluded.description`,
    [key, description],
  );
}

const rows = await query('SELECT id, permission_key FROM permissions');
const ids = new Map(rows.map((row) => [row.permission_key, row.id]));
const grants = {
  admin: permissions.map(([key]) => key),
  doctor: ['lectures.open', 'attendance.view_all', 'reports.export'],
  student: ['attendance.create'],
};

for (const [role, keys] of Object.entries(grants)) {
  for (const key of keys) {
    await query('INSERT OR IGNORE INTO role_permissions (role, permission_id) VALUES (?, ?)', [role, ids.get(key)]);
  }
}

await syncDatabase();
console.log('تم تجهيز مخطط البيانات والبيانات الأساسية في Firebase Realtime Database بنجاح.');

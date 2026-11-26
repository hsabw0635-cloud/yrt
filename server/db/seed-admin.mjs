import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { query } from '../db.mjs';

const username = process.env.ADMIN_USERNAME || 'admin';
const password = process.env.ADMIN_PASSWORD;
const fullName = process.env.ADMIN_FULL_NAME || 'مدير النظام';

if (!password) {
  throw new Error('ADMIN_PASSWORD مطلوب في ملف .env');
}
if (password.length < 8) {
  throw new Error('يجب ألا تقل كلمة مرور المدير عن 8 أحرف');
}

const hash = await bcrypt.hash(password, 12);
await query(
  `INSERT INTO users (username, full_name, password_hash, role, is_active, password_changed_at, created_at, updated_at)
   VALUES (?, ?, ?, 'admin', 1, datetime('now','localtime'), datetime('now','localtime'), datetime('now','localtime'))
   ON CONFLICT(username) DO UPDATE SET
     full_name = excluded.full_name,
     password_hash = excluded.password_hash,
     role = 'admin',
     is_active = 1,
     password_changed_at = excluded.password_changed_at,
     updated_at = excluded.updated_at`,
  [username, fullName, hash],
);

const admin = await query('SELECT id FROM users WHERE username = ?', [username]);
await query(
  `INSERT INTO audit_logs (user_id, action, entity_type, details, ip)
   VALUES (?, 'ADMIN_SEEDED', 'user', ?, 'setup')`,
  [admin[0]?.id || null, JSON.stringify({ username })],
);

console.log(`تم إنشاء/تحديث حساب المدير: ${username}`);

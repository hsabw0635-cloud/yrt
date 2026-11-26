/**
 * قاعدة البيانات: Firebase Realtime Database + محرك SQL محلي (sql.js)
 *
 * - البيانات الحقيقية تُحفظ في Firebase Realtime Database تحت العقدة campusAttendance.
 * - محرك SQLite داخل الذاكرة يوفّر نفس واجهة mysql2 (query / queryOne / transaction)
 *   حتى تعمل مسارات الخادم الحالية دون تعديل، مع دعم Joins والتجميعات.
 * - بعد كل تعديل تُنسخ الجداول المتأثرة إلى Firebase تلقائياً.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import initSqlJs from 'sql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = (process.env.FIREBASE_DATABASE_URL || '').replace(/\/+$/, '');
const ROOT = (process.env.FIREBASE_ROOT || 'campusAttendance').replace(/^\/+|\/+$/g, '');
const BASE_URL = DATABASE_URL ? `${DATABASE_URL}/${ROOT}` : '';

function firebaseUrl(node = '') {
  if (!BASE_URL) throw new Error('FIREBASE_DATABASE_URL غير مضبوط في ملف .env');
  return `${BASE_URL}${node}.json`;
}

const TABLES = [
  'users',
  'permissions',
  'role_permissions',
  'departments',
  'levels',
  'department_levels',
  'study_modes',
  'attachments',
  'students',
  'doctors',
  'subjects',
  'lecture_schedules',
  'lecture_sessions',
  'attendance_records',
  'audit_logs',
];

const PERMISSION_KEYS = [
  'users.manage',
  'structure.manage',
  'subjects.manage',
  'attendance.view_all',
  'reports.export',
  'lectures.open',
  'attendance.create',
];

const ROLE_GRANTS = {
  admin: PERMISSION_KEYS,
  doctor: ['lectures.open', 'attendance.view_all', 'reports.export'],
  student: ['attendance.create'],
};

let SQL = null;
let db = null;
let initPromise = null;
let opQueue = Promise.resolve();
let firebaseSyncFailed = false;

function fetchOptions(method = 'GET', body) {
  const options = { method, headers: {} };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body === null ? null : body);
  }
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    options.signal = AbortSignal.timeout(20000);
  }
  return options;
}

async function firebaseGet(node = '') {
  const response = await fetch(firebaseUrl(node), fetchOptions());
  if (!response.ok) throw new Error(`Firebase read failed (${response.status}) on ${node || 'root'}`);
  return response.json();
}

async function firebaseSet(node, value) {
  const response = await fetch(firebaseUrl(node), fetchOptions('PUT', value ?? null));
  if (!response.ok) throw new Error(`Firebase write failed (${response.status}) on ${node}`);
}

function safeIdentifier(name) {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) ? name : null;
}

function sanitizeValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  if (typeof value === 'bigint') return Number(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (/[.#$/\[\]]/.test(key)) continue;
      out[key] = sanitizeValue(item);
    }
    return out;
  }
  return value;
}

function tableRows(table) {
  const result = db.exec(`SELECT * FROM ${table}`);
  if (!result.length) return [];
  const { columns, values } = result[0];
  return values.map((row) => {
    const record = {};
    columns.forEach((column, index) => { record[column] = row[index]; });
    return record;
  });
}

function tableColumns(table) {
  const result = db.exec(`PRAGMA table_info(${table})`);
  return new Set((result[0]?.values || []).map((row) => row[1]));
}

async function syncTable(table) {
  const rows = tableRows(table);
  const node = {};
  for (const row of rows) {
    const key = table === 'study_modes'
      ? row.code
      : (row.id ?? row.row_key ?? `${row.role}_${row.permission_id ?? ''}`);
    node[String(key)] = sanitizeValue(row);
  }
  try {
    await firebaseSet(`/${table}`, Object.keys(node).length ? node : null);
    firebaseSyncFailed = false;
  } catch (error) {
    // لا نُفشل العملية محلياً؛ تُعاد المحاولة تلقائياً في الدورة القادمة
    if (!firebaseSyncFailed) {
      console.warn('[firebase] تعذّر حفظ البيانات، ستتم إعادة المحاولة لاحقاً:', error.message);
      firebaseSyncFailed = true;
    }
  }
}

async function syncAll() {
  await Promise.all(TABLES.map((table) => syncTable(table)));
}

async function loadFromFirebase() {
  let snapshot;
  try {
    snapshot = await firebaseGet();
  } catch (error) {
    console.warn('[firebase] تعذّر تحميل البيانات، سيبدأ النظام ببيانات فارغة:', error.message);
    return;
  }
  if (!snapshot || typeof snapshot !== 'object') return;

  for (const table of TABLES) {
    const records = snapshot[table];
    if (!records || typeof records !== 'object') continue;
    for (const [key, record] of Object.entries(records)) {
      if (!record || typeof record !== 'object') continue;
      const allowedColumns = tableColumns(table);
      const columns = Object.keys(record).filter((column) => safeIdentifier(column) && allowedColumns.has(column));
      if (!columns.length) continue;
      const values = columns.map((column) => record[column]);
      if (table === 'role_permissions' || table === 'department_levels') {
        if (columns.includes('row_key')) {
          values[columns.indexOf('row_key')] = key;
        } else {
          columns.push('row_key');
          values.push(key);
        }
      } else if (table !== 'study_modes') {
        if (!columns.includes('id')) {
          columns.unshift('id');
          values.unshift(/^\d+$/.test(key) ? Number(key) : key);
        }
      } else if (columns.includes('code')) {
        values[columns.indexOf('code')] = key;
      }
      const placeholders = columns.map(() => '?').join(', ');
      try {
        runSql(`INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`, values);
      } catch (error) {
        console.warn(`[firebase] تخطي سجل غير صالح في ${table}/${key}:`, error.message);
      }
    }
  }
}

function runSql(sql, params = []) {
  const statement = db.prepare(sql);
  try {
    const bound = params.map((value) => {
      if (value === undefined) return null;
      if (typeof value === 'boolean') return value ? 1 : 0;
      if (value instanceof Date) return value.toISOString();
      if (typeof value === 'number' && !Number.isFinite(value)) return null;
      return value;
    });
    if (bound.length) statement.bind(bound);
    if (/^\s*(SELECT|PRAGMA|EXPLAIN)\b/i.test(sql)) {
      const rows = [];
      while (statement.step()) rows.push(statement.getAsObject());
      return rows;
    }
    statement.step();
    return null;
  } catch (error) {
    const message = /UNIQUE constraint failed/i.test(error.message)
      ? Object.assign(new Error(error.message), { code: 'ER_DUP_ENTRY' })
      : error;
    throw message;
  } finally {
    statement.free();
  }
}

function translateSql(sql) {
  return sql
    .replace(/\bON\s+DUPLICATE\s+KEY\s+UPDATE\s+id\s*=\s*id\b/gi, 'ON CONFLICT DO NOTHING')
    .replace(/\bON\s+DUPLICATE\s+KEY\s+UPDATE\b/gi, 'ON CONFLICT DO UPDATE SET')
    .replace(/\bVALUES\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/g, 'excluded.$1')
    .replace(/\bINSERT\s+IGNORE\b/gi, 'INSERT OR IGNORE')
    .replace(/\bNOW\(\)/gi, "datetime('now','localtime')")
    .replace(/\bCURDATE\(\)/gi, "date('now','localtime')");
}

function statementType(sql) {
  const match = sql.match(/^\s*([a-zA-Z]+)/);
  return match ? match[1].toUpperCase() : '';
}

function tableName(sql) {
  const match = sql.match(/\b(?:INTO|FROM|UPDATE)\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
  return match && TABLES.includes(match[1]) ? match[1] : null;
}

function lastInsertId() {
  const result = db.exec('SELECT last_insert_rowid() AS id');
  return Number(result[0]?.values?.[0]?.[0] || 0);
}

function writeResult() {
  return { affectedRows: db.getRowsModified(), insertId: lastInsertId() };
}

function withLock(task) {
  const run = opQueue.then(task, task);
  opQueue = run.catch(() => {});
  return run;
}

async function ensureSeedData() {
  runSql("INSERT OR IGNORE INTO study_modes (code, label_ar) VALUES ('morning', 'صباحي')");
  runSql("INSERT OR IGNORE INTO study_modes (code, label_ar) VALUES ('evening', 'مسائي')");

  // المراحل الأربع المعتمدة. الأسماء موجودة مسبقاً في البيانات الحقيقية
  // فيُترك رمزها كما هو، ويُضاف فقط ما ينقص من مراحل.
  // إزالة نسخة مكررة قديمة من المرحلة الثانية إن وُجدت ولا تشير إليها بيانات أخرى
  for (const row of runSql("SELECT id FROM levels WHERE name = 'ثانية'")) {
    const references = runSql(
      `SELECT (SELECT COUNT(*) FROM students WHERE level_id = ?)
            + (SELECT COUNT(*) FROM subjects WHERE level_id = ?)
            + (SELECT COUNT(*) FROM department_levels WHERE level_id = ?) AS total`,
      [row.id, row.id, row.id],
    );
    if (!Number(references[0]?.total || 0)) runSql('DELETE FROM levels WHERE id = ?', [row.id]);
  }

  const canonicalLevels = [['1', 'اولى'], ['2', 'ثانيه'], ['3', 'ثالثة'], ['4', 'رابعة']];
  for (const [code, name] of canonicalLevels) {
    runSql('INSERT OR IGNORE INTO levels (code, name) VALUES (?, ?)', [code, name]);
  }
  for (const [code, name] of canonicalLevels) {
    runSql(
      `UPDATE levels SET code = ? WHERE name = ? AND code <> ?
       AND NOT EXISTS (SELECT 1 FROM levels other WHERE other.code = ? AND other.id <> levels.id)`,
      [code, name, code, code],
    );
  }

  for (const key of PERMISSION_KEYS) {
    runSql('INSERT OR IGNORE INTO permissions (permission_key, description) VALUES (?, ?)', [key, key]);
  }
  const permissions = tableRows('permissions');
  const byKey = new Map(permissions.map((row) => [row.permission_key, row.id]));
  for (const [role, keys] of Object.entries(ROLE_GRANTS)) {
    for (const key of keys) {
      const id = byKey.get(key);
      if (id) runSql('INSERT OR IGNORE INTO role_permissions (role, permission_id) VALUES (?, ?)', [role, id]);
    }
  }

  const admins = runSql("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (!admins.length) {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const fullName = process.env.ADMIN_FULL_NAME || 'مدير النظام';
    const password = process.env.ADMIN_PASSWORD || 'Admin@12345';
    const hash = await bcrypt.hash(password, 12);
    const now = "datetime('now','localtime')";
    runSql(
      `INSERT INTO users (username, full_name, password_hash, role, is_active, password_changed_at, created_at, updated_at)
       VALUES (?, ?, ?, 'admin', 1, ${now}, ${now}, ${now})`,
      [username, fullName, hash],
    );
  }

  await syncAll();
}

async function init() {
  if (!initPromise) {
    initPromise = (async () => {
      SQL = await initSqlJs();
      db = new SQL.Database();
      db.run('PRAGMA foreign_keys = OFF;');
      const schema = await fs.readFile(path.join(__dirname, 'db', 'sqlite-schema.sql'), 'utf8');
      db.run(schema);
      await loadFromFirebase();
      await ensureSeedData();
    })().catch((error) => {
      initPromise = null;
      throw error;
    });
  }
  return initPromise;
}

export async function query(sql, params = []) {
  await init();
  return withLock(async () => {
    const translated = translateSql(sql);
    const type = statementType(translated);
    if (type === 'SELECT' || type === 'PRAGMA' || type === 'EXPLAIN') {
      return runSql(translated, params);
    }
    runSql(translated, params);
    const result = writeResult();
    const table = tableName(translated);
    if (table) await syncTable(table);
    return result;
  });
}

export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

export async function transaction(callback) {
  await init();
  return withLock(async () => {
    const touched = new Set();
    db.run('BEGIN TRANSACTION');
    try {
      const connection = {
        execute: async (sql, params = []) => {
          const translated = translateSql(sql);
          const type = statementType(translated);
          if (type === 'SELECT' || type === 'PRAGMA' || type === 'EXPLAIN') {
            return [runSql(translated, params), []];
          }
          runSql(translated, params);
          const table = tableName(translated);
          if (table) touched.add(table);
          return [writeResult(), []];
        },
        beginTransaction: async () => {},
        commit: async () => {},
        rollback: async () => {},
        release: async () => {},
      };
      const result = await callback(connection);
      db.run('COMMIT');
      for (const table of touched) await syncTable(table);
      return result;
    } catch (error) {
      db.run('ROLLBACK');
      throw error;
    }
  });
}

export const pool = {
  query,
  queryOne,
  transaction,
  end: async () => {
    if (db) {
      db.close();
      db = null;
      SQL = null;
      initPromise = null;
    }
  },
};

export async function syncDatabase() {
  await init();
  return withLock(() => syncAll());
}

export { DATABASE_URL, ROOT };

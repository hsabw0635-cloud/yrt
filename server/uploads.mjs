import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { query, queryOne } from './db.mjs';
import { AppError } from './errors.mjs';

const allowedTypes = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const storageDir = path.resolve(process.env.STORAGE_DIR || './storage');

export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!allowedTypes[file.mimetype]) {
      return callback(new AppError(400, 'نوع الصورة غير مدعوم. استخدم JPG أو PNG أو WEBP', 'INVALID_IMAGE'));
    }
    callback(null, true);
  },
});

export async function saveAttachment(userId, kind, file) {
  if (!file?.buffer) throw new AppError(400, 'الصورة مطلوبة', 'IMAGE_REQUIRED');

  const extension = allowedTypes[file.mimetype];
  if (!extension) throw new AppError(400, 'نوع الصورة غير مدعوم', 'INVALID_IMAGE');

  const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const folder = path.join(storageDir, new Date().toISOString().slice(0, 10), kind);
  await fs.mkdir(folder, { recursive: true });
  const filename = `${crypto.randomUUID()}${extension}`;
  const fullPath = path.join(folder, filename);
  await fs.writeFile(fullPath, file.buffer, { flag: 'wx' });

  try {
    const result = await query(
      `INSERT INTO attachments (owner_user_id, kind, mime, original_name, size, sha256, storage_path)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, kind, file.mimetype, file.originalname || null, file.size, sha256, fullPath],
    );
    return queryOne('SELECT * FROM attachments WHERE id = ?', [result.insertId]);
  } catch (error) {
    await fs.unlink(fullPath).catch(() => {});
    throw error;
  }
}

export async function findAttachmentForViewer(attachmentId, viewer) {
  const attachment = await queryOne(
    `SELECT a.*, u.role AS owner_role,
            sch.doctor_id AS attendance_doctor_id,
            stp.department_id AS profile_department_id,
            stp.level_id AS profile_level_id,
            stp.study_mode AS profile_study_mode
     FROM attachments a
     JOIN users u ON u.id = a.owner_user_id
     LEFT JOIN attendance_records ar ON ar.photo_attachment_id = a.id
     LEFT JOIN lecture_sessions ls ON ls.id = ar.session_id
     LEFT JOIN lecture_schedules sch ON sch.id = ls.schedule_id
     LEFT JOIN students stp ON stp.profile_photo_id = a.id
     WHERE a.id = ?`,
    [attachmentId],
  );

  if (!attachment) throw new AppError(404, 'المرفق غير موجود', 'NOT_FOUND');

  const isOwner = attachment.owner_user_id === viewer.id;
  const isAdmin = viewer.role === 'admin';
  const isDoctorOfAttendance = viewer.role === 'doctor' && attachment.attendance_doctor_id === viewer.doctor_id;

  let isDoctorOfProfile = false;
  if (viewer.role === 'doctor' && attachment.profile_department_id && attachment.profile_level_id) {
    const allowed = await queryOne(
      `SELECT 1 FROM lecture_schedules
       WHERE doctor_id = ? AND department_id = ? AND level_id = ? AND study_mode = ? LIMIT 1`,
      [viewer.doctor_id, attachment.profile_department_id, attachment.profile_level_id, attachment.profile_study_mode],
    );
    isDoctorOfProfile = Boolean(allowed);
  }

  if (!isOwner && !isAdmin && !isDoctorOfAttendance && !isDoctorOfProfile) {
    throw new AppError(403, 'لا تملك صلاحية لعرض هذه الصورة', 'FORBIDDEN');
  }

  return attachment;
}

/**
 * تنظيف دوري لصور الحضور فقط بعد 5 ساعات من تسجيل الحضور.
 * تُحذف الملفات وصفوف المرفقات، وتبقى سجلات الحضور ودرجات المطابقة
 * وحالات المخالفة دون تغيير.
 */

import fs from 'node:fs/promises';
import { query } from './db.mjs';

export async function cleanupAttendancePhotos({ includeToday = false } = {}) {
  const rows = await query(
    `SELECT ar.id AS record_id, ar.photo_attachment_id, ar.marked_at,
            a.storage_path, a.created_at AS photo_created_at
     FROM attendance_records ar
     JOIN attachments a ON a.id = ar.photo_attachment_id
     WHERE ar.photo_attachment_id IS NOT NULL`,
  );

  // الصور التي مضى على تسجيلها 5 ساعات، أو كل الصور عند التنظيف اليدوي
  const targets = includeToday
    ? rows
    : rows.filter((row) => {
        const verifiedAt = row.marked_at || row.photo_created_at;
        if (!verifiedAt) return false;
        const time = new Date(String(verifiedAt).replace(' ', 'T')).getTime();
        return Number.isFinite(time) && Date.now() - time >= 5 * 60 * 60 * 1000;
      });

  if (!targets.length) return { records: 0, files: 0 };

  const attachmentIds = [...new Set(targets.map((row) => Number(row.photo_attachment_id)).filter(Boolean))];
  const placeholders = attachmentIds.map(() => '?').join(',');

  await query(
    `UPDATE attendance_records SET photo_attachment_id = NULL
     WHERE photo_attachment_id IN (${placeholders})`,
    attachmentIds,
  );
  await query(`DELETE FROM attachments WHERE id IN (${placeholders})`, attachmentIds);
  await Promise.all(targets.map((row) => row.storage_path && fs.unlink(row.storage_path).catch(() => {})));

  return { records: targets.length, files: attachmentIds.length };
}

/** يعمل عند بدء التشغيل للتدارك، ثم كل دقيقة لمراعاة مرور 5 ساعات على أي صورة. */
export function startPhotoCleanup() {
  const run = async (all = false) => {
    try {
      const result = await cleanupAttendancePhotos({ includeToday: all });
      if (result.files) console.log(`[cleanup] حُذفت ${result.files} صورة حضور من ${result.records} سجل`);
    } catch (error) {
      console.warn('[cleanup] تعذّر تنظيف الصور:', error.message);
    }
  };

  run();
  const timer = setInterval(() => run(), 60 * 1000);
  timer.unref?.();
}

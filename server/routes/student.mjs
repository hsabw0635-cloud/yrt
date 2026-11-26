import fs from 'node:fs/promises';
import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.mjs';
import { authRequired, requireRole } from '../auth.mjs';
import { asyncHandler, AppError } from '../errors.mjs';
import { audit } from '../audit.mjs';
import { uploadImage, saveAttachment } from '../uploads.mjs';
import { getStudentSession, getStudentSessions, getStudentStats } from '../sessions.mjs';
import { getStudentAcademicFile } from '../student-file.mjs';
import { publish } from '../realtime.mjs';
import { verifyScene } from '../scene.mjs';
import { aiEnabled, verifyImagesWithAI } from '../ai.mjs';
import { addDays, dateTime, parseDate, toDateString } from '../utils.mjs';

export const studentRouter = Router();
studentRouter.use(authRequired, requireRole('student'));

function studentIdOf(req) {
  if (!req.user.student_id) throw new AppError(400, 'يرجى إكمال الملف الشخصي أولاً', 'PROFILE_INCOMPLETE');
  return Number(req.user.student_id);
}

const profileSchema = z.object({
  fullName: z.string().trim().min(3, 'الاسم الرباعي مطلوب').max(200),
  universityNumber: z.string().trim().min(3, 'الرقم الجامعي مطلوب').max(50),
  departmentId: z.coerce.number().int().positive(),
  levelId: z.coerce.number().int().positive(),
  studyMode: z.enum(['morning', 'evening']),
});

studentRouter.get('/profile', asyncHandler(async (req, res) => {
  if (!req.user.student_id) return res.json({ profile: null });
  const row = await queryOne(
    `SELECT st.*, dep.name AS department_name, lvl.name AS level_name, sm.label_ar AS study_mode_label,
            a.id AS profile_photo_id
     FROM students st
     LEFT JOIN departments dep ON dep.id = st.department_id
     LEFT JOIN levels lvl ON lvl.id = st.level_id
     LEFT JOIN study_modes sm ON sm.code = st.study_mode
     LEFT JOIN attachments a ON a.id = st.profile_photo_id
     WHERE st.id = ?`,
    [studentIdOf(req)],
  );
  res.json({ profile: row });
}));

studentRouter.put('/profile', uploadImage.single('photo'), asyncHandler(async (req, res) => {
  const data = profileSchema.parse(req.body);
  const link = await queryOne(
    'SELECT 1 FROM department_levels WHERE department_id = ? AND level_id = ?',
    [data.departmentId, data.levelId],
  );
  if (!link) throw new AppError(400, 'المرحلة غير مرتبطة بالقسم المختار');

  const duplicate = await queryOne(
    'SELECT id FROM students WHERE university_number = ? AND id <> ?',
    [data.universityNumber, req.user.student_id || 0],
  );
  if (duplicate) throw new AppError(409, 'الرقم الجامعي مستخدم مسبقاً', 'DUPLICATE_UNIVERSITY_NUMBER');

  let photoId = null;
  if (req.file) {
    const attachment = await saveAttachment(req.user.id, 'profile', req.file);
    photoId = attachment.id;
  }

  let studentId = req.user.student_id;
  if (!studentId) {
    const result = await query(
      `INSERT INTO students (user_id, university_number, full_name, department_id, level_id, study_mode, profile_photo_id, profile_completed)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [req.user.id, data.universityNumber, data.fullName, data.departmentId, data.levelId, data.studyMode, photoId],
    );
    studentId = result.insertId;
  } else {
    await query(
      `UPDATE students
       SET university_number = ?, full_name = ?, department_id = ?, level_id = ?, study_mode = ?,
           profile_completed = 1 ${photoId ? ', profile_photo_id = ?' : ''}
       WHERE id = ?`,
      photoId
        ? [data.universityNumber, data.fullName, data.departmentId, data.levelId, data.studyMode, photoId, studentId]
        : [data.universityNumber, data.fullName, data.departmentId, data.levelId, data.studyMode, studentId],
    );
  }

  await audit(req, 'PROFILE_COMPLETED', 'student', studentId, data);
  publish('student:profile-updated', { studentId });
  res.json({ ok: true, studentId });
}));

studentRouter.get('/dashboard', asyncHandler(async (req, res) => {
  const studentId = studentIdOf(req);
  const date = req.query.date ? parseDate(String(req.query.date)) : toDateString();
  const [sessions, stats] = await Promise.all([
    getStudentSessions(studentId, date),
    getStudentStats(studentId, date),
  ]);
  res.json({ sessions, stats, date });
}));

studentRouter.get('/sessions/:id', asyncHandler(async (req, res) => {
  const session = await getStudentSession(Number(req.params.id), studentIdOf(req));
  if (!session) throw new AppError(404, 'المحاضرة غير موجودة أو غير مرتبطة بك', 'NOT_FOUND');
  res.json({ session });
}));

const checkInSchema = z.object({
  sessionId: z.coerce.number().int().positive(),
  sceneSignature: z.string().max(20000).optional(),
});

studentRouter.post('/attendance', uploadImage.single('photo'), asyncHandler(async (req, res) => {
  const data = checkInSchema.parse(req.body);
  const studentId = studentIdOf(req);
  const session = await getStudentSession(data.sessionId, studentId);

  if (!session) throw new AppError(403, 'هذه المحاضرة غير مرتبطة ببياناتك الدراسية', 'NOT_ELIGIBLE');
  if (session.status === 'registered') throw new AppError(409, 'تم تسجيل حضورك لهذه المحاضرة مسبقاً', 'ALREADY_MARKED');
  if (session.status !== 'open') {
    throw new AppError(403, session.status === 'expired' ? 'انتهى وقت التسجيل لهذه المحاضرة' : 'لم يفتح الدكتور تسجيل الحضور بعد', 'SESSION_NOT_OPEN');
  }
  if (new Date() > dateTime(session.date, session.endTime)) {
    throw new AppError(400, 'انتهى وقت المحاضرة', 'SESSION_EXPIRED');
  }
  if (!req.file) throw new AppError(400, 'يجب التقاط صورة فورية عبر الكاميرا', 'PHOTO_REQUIRED');

  const peers = await query(
    `SELECT ar.scene_signature, ar.photo_attachment_id, a.storage_path, a.mime
     FROM attendance_records ar
     LEFT JOIN attachments a ON a.id = ar.photo_attachment_id
     WHERE ar.session_id = ? AND ar.scene_signature IS NOT NULL
       AND ar.verification_status <> 'suspicious'`,
    [data.sessionId],
  );

  // الفحص المحلي هو الأساس، ثم يحاول Gemini رفع الدقة إن كان مهيّأً
  let verification = verifyScene(data.sceneSignature, peers.map((row) => row.scene_signature));
  verification.source = 'local';
  if (aiEnabled() && peers.length >= 2) {
    const peerImages = [];
    for (const peer of peers) {
      if (!peer.storage_path) continue;
      try {
        peerImages.push({ buffer: await fs.readFile(peer.storage_path), mime: peer.mime || 'image/jpeg' });
      } catch { /* صورة محذوفة أو غير متاحة */ }
    }
    if (peerImages.length >= 2) {
      const aiResult = await verifyImagesWithAI(req.file.buffer, req.file.mimetype, peerImages);
      if (aiResult) verification = aiResult;
    }
  }

  const attachment = await saveAttachment(req.user.id, 'attendance', req.file);
  try {
    await query(
      `INSERT INTO attendance_records
        (session_id, student_id, photo_attachment_id, verification_status, verification_source, scene_signature, scene_score, anomaly_reason, marked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        data.sessionId,
        studentId,
        attachment.id,
        verification.status,
        verification.source || 'local',
        data.sceneSignature || null,
        verification.score,
        verification.reason,
      ],
    );
  } catch (error) {
    await query('DELETE FROM attachments WHERE id = ?', [attachment.id]);
    await fs.unlink(attachment.storage_path).catch(() => {});
    if (error.code === 'ER_DUP_ENTRY') {
      throw new AppError(409, 'تم تسجيل حضورك لهذه المحاضرة مسبقاً', 'ALREADY_MARKED');
    }
    throw error;
  }

  publish('attendance:created', {
    sessionId: Number(data.sessionId),
    subject: session.subject.name,
    studentName: null,
    counts: {
      total: null,
    },
  });
  await audit(req, 'ATTENDANCE_MARKED', 'attendance', Number(data.sessionId), {
    sessionId: Number(data.sessionId),
    verification: verification.status,
  });

  if (verification.status === 'suspicious') {
    publish('attendance:violation', {
      sessionId: Number(data.sessionId),
      studentId,
      subject: session.subject.name,
      reason: 'SCENE_MISMATCH',
      score: verification.score,
      source: verification.source,
      detail: verification.detail || null,
    });
    await audit(req, 'ATTENDANCE_VIOLATION', 'attendance', Number(data.sessionId), {
      sessionId: Number(data.sessionId),
      studentId,
      reason: verification.reason,
      score: verification.score,
      source: verification.source,
      detail: verification.detail || null,
    });
  }

  res.status(201).json({
    message: verification.status === 'suspicious'
      ? 'تم تسجيل حضورك، وجارٍ مراجعة الصورة من قبل الدكتور ⚠️'
      : 'تم تسجيل حضورك بنجاح ✅',
    attendance: { markedAt: new Date().toISOString() },
    verification: { status: verification.status, score: verification.score, source: verification.source, detail: verification.detail || null },
  });
}));

studentRouter.get('/history', asyncHandler(async (req, res) => {
  const studentId = studentIdOf(req);
  const to = req.query.to ? parseDate(String(req.query.to)) : toDateString();
  const from = req.query.from ? parseDate(String(req.query.from)) : addDays(to, -30);
  if (from > to) throw new AppError(400, 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
  const days = Math.min(Math.round((new Date(to) - new Date(from)) / 86400000) + 1, 180);
  const all = [];
  for (let index = 0; index < days; index += 1) {
    all.push(...await getStudentSessions(studentId, addDays(from, index)));
  }
  const attended = all.filter((item) => item.status === 'registered').length;
  const absent = all.filter((item) => item.status === 'expired' || item.status === 'closed').length;
  res.json({
    sessions: all,
    summary: {
      total: all.length,
      attended,
      absent: Math.max(absent, 0),
      rate: all.length ? Math.round((attended / all.length) * 100) : 0,
    },
  });
}));

studentRouter.get('/academic-file', asyncHandler(async (req, res) => {
  res.json(await getStudentAcademicFile(studentIdOf(req), req.user));
}));

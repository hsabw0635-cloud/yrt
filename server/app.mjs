import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { AppError } from './errors.mjs';
import { sseHandler } from './realtime.mjs';
import { authRouter } from './routes/auth.mjs';
import { sharedRouter } from './routes/shared.mjs';
import { attachmentsRouter } from './routes/attachments.mjs';
import { adminRouter } from './routes/admin.mjs';
import { doctorRouter } from './routes/doctor.mjs';
import { studentRouter } from './routes/student.mjs';
import { reportsRouter } from './routes/reports.mjs';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-origin' },
}));
app.use(compression());
app.use(express.json({ limit: '6mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get('/api/events', sseHandler);
app.use('/api/auth', authRouter);
app.use('/api/lookups', sharedRouter);
app.use('/api/attachments', attachmentsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/doctor', doctorRouter);
app.use('/api/student', studentRouter);
app.use('/api/reports', reportsRouter);

app.use('/api', (_req, res) => res.status(404).json({ error: { message: 'مسار API غير موجود', code: 'NOT_FOUND' } }));

const distDir = path.resolve('dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { index: false }));
  app.use((_req, res) => res.sendFile(path.join(distDir, 'index.html')));
} else {
  app.get('/', (_req, res) => res.type('text').send('واجهة الويب غير مبنية. شغّل npm run dev أو npm run build.'));
}

app.use((error, _req, res, _next) => {
  if (error instanceof ZodError) {
    const message = error.issues?.map((issue) => issue.message).filter(Boolean).join('، ') || 'بيانات غير صحيحة';
    return res.status(400).json({ error: { message, code: 'VALIDATION_ERROR' } });
  }
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({ error: { message: error.message, code: error.code } });
  }
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: { message: 'حجم الصورة كبير جداً (الحد الأقصى 6MB)', code: 'FILE_TOO_LARGE' } });
  }
  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: { message: 'هذه القيمة موجودة مسبقاً', code: 'DUPLICATE_ENTRY' } });
  }
  console.error(error);
  return res.status(500).json({ error: { message: 'حدث خطأ غير متوقع في السيرفر', code: 'INTERNAL_ERROR' } });
});

export default app;

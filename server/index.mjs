import 'dotenv/config';
import app from './app.mjs';
import { pool, syncDatabase } from './db.mjs';
import { ensureSessionsAround } from './sessions.mjs';
import { startPhotoCleanup } from './cleanup.mjs';

const port = Number(process.env.PORT || 4000);

try {
  await ensureSessionsAround();
  console.log('تم تجهيز جلسات المحاضرات.');
} catch (error) {
  console.error('تعذر تجهيز جلسات المحاضرات:', error.message);
}

const timer = setInterval(() => {
  ensureSessionsAround().catch((error) => console.error('Session generation failed:', error.message));
}, 60 * 60 * 1000);

startPhotoCleanup();

// إعادة مزامنة Firebase دورياً حتى لو تعذّر الاتصال عند التشغيل
const firebaseTimer = setInterval(() => {
  syncDatabase().catch((error) => console.error('Firebase sync failed:', error.message));
}, 60 * 1000);

const server = app.listen(port, () => {
  console.log(`السيرفر يعمل على http://localhost:${port}`);
});

async function shutdown() {
  clearInterval(timer);
  clearInterval(firebaseTimer);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

# 🎯 جامعة إدارة حضور الطلاب - ملف البدء السريع

## نظرة عامة
هذا المشروع هو **نظام إدارة حضور الطلاب الجامعي** تم تطويره بـ:
- ** frontend:** React + Vite + TypeScript
- ** backend:** Node.js + Express + MySQL 8
- ** الميزات:** حضور geo-fenced، صور فورية، تقارير Excel/PDF، أدوار (admin/doctor/student)

---

## ✅ التعديلات الأخيرة (آخر 4 أخطاء تم إصلاحها)

### 1. `server/sessions.mjs` - خطأ `getStudentSessions` حاسم
**المشكلة:** كان `studentId` يُستخدم خطأً للأعمدة `sch.department_id`, `sch.level_id`, `sch.study_mode` في جملة WHERE.
**الحل:** الآن يقوم الوظيفة باستعلام بيانات الطالب (department_id, level_id, study_mode) أولاً، ثم تستخدم القيم الصحيحة في الفلتر.

### 2. `server/reports.mjs` - مسار خط PDF
**المشكلة:** `process.cwd()` قد لا resolves بشكل صحيح في جميع سياقات النشر.
**الحل:** تم تغيير المسار إلى `path.resolve(path.dirname(new URL(import.meta.url).pathname || '', 'assets', 'fonts', 'NotoSansArabic.ttf'))` للموثوقية.

### 3. `server/app.mjs` - عدم تطابق حد الحجم
**المشكلة:** `express.json({ limit: '1mb' })` كان أقل من حد multer file upload 6MB.
**الحل:** تم تحديث الحد إلى `'6mb'` لتطابق حد multer.

### 4. `server/index.mjs` - استدعاءات مكررة
**المشكلة:** `ensureSessionsAround()` تم استدعاؤه مرتين (في index.mjs AND server/index.mjs).
**الحل:** تم تعليق الاستدعاء الثنائي في interval، kept only startup call.

---

## 🚀 كيفية التشغيل (التشغيل)

### الطريقة المحلية (Local)

```bash
# 1. تثبيت الحزم
npm install

# 2. إنشاء ملف الإعدادات
copy .env.example .env

# 3. تعديل ملف .env بمعلومات قاعدة البيانات
# - JWT_SECRET=قيمة-عشوائية-طويلة- جداً
# - DB_USER=root
# - DB_PASSWORD=كلمة-مرور-MySQL
# - DB_NAME=campus_attendance
# - ADMIN_USERNAME=admin
# - ADMIN_PASSWORD=كلمة-مرور-Strong

# 4. تجهيز قاعدة البيانات وحساب المدير
npm run setup

# 5. تحميل خط PDF العربي (للتقارير)
npm run download:font

# 6. التشغيل
npm run dev
```

النواتج:
- **الواجهة:** `http://localhost:5173`
- **API:** `http://localhost:4000`

سجّل الدخول بحساب المدير الذي ضبطته في `.env`.

### الطريقة عبر Docker

```bash
copy .env.example .env
docker compose up -d --build
docker compose exec app npm run migrate
docker compose exec app npm run seed:admin
docker compose exec app npm run download:font
# ثم افتح http://localhost:4000
```

---

## 📁 هيكل الملفات الهام

```
server/            #backend
  sessions.mjs     #← تم إصلاح خطأ getStudentSessions هنا
  reports.mjs      #← تم إصلاح مسار خط PDF هنا
  app.mjs          #← تم تطابق حد JSON size
  index.mjs        #← تم إزالة الاستدعاء المكرر
  auth.mjs         ## JWT authentication
  utils.mjs        ##utilities (dates, math, etc.)
  routes/          ##API routes (admin, student, doctor)
  db/              ##database schema & migrations

web/             #frontend
  src/             ##React components & pages
  package.json     ## frontend dependencies
```

---

## ⚡ أوامر مفيدة

| الأمر | الوصف |
|------|--------|
| `npm run dev` |running dev mode (backend + frontend) |
| `npm run build` |بناء الواجهة للإنتاج |
| `npm run typecheck` |فحص TypeScript errors |
| `npm run start` |التشغيل للإنتاج |
| `npm run setup` |تجهيز قاعدة البيانات و seeding admin |
| `npm run download:font` |تحميل خط PDF العربي |

---

## 🛠️ المطورون

تم تطوير هذا المشروع من قبل باحثين لتصميم وتنفيذ نظام إدارة حضور الطلاب الجامعي بشاشة عربية komplett.

**ملاحظات مهمة:**
- كلمات المرور مشفّرة بـ bcrypt
- الجلسات عبارة عن JWT inside HttpOnly cookies
- لكل دور (admin/doctor/student) صلاحيات منفصلة
- وقت الحضور يسجل من السيرفر (`NOW()`) وليس من المتصفح
- الصور تُحفظ في مجلد `storage/` خارج قاعدة البيانات

---

## 🆘 الدعم

إذا واجهت أي مشاكل:
1. تأكد من أن MySQL يعمل ويعتمد `.env` الملف
2. شغل `npm run setup` لتجهيز قاعدة البيانات
3. تأكد من تحميل خط `NotoSansArabic.ttf` لـ PDF reports
4. راجع سجل الأخطاء: `console.error` in the terminal

---
*آخر تعديل: 2026-11-24*
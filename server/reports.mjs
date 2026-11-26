import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { query } from './db.mjs';
import { AppError } from './errors.mjs';

// Resolve font path relative to this file's directory for robustness
const FONT_PATH = path.resolve(path.dirname(new URL(import.meta.url).pathname || '', 'assets', 'fonts', 'NotoSansArabic.ttf'));

import { attendanceDisplayStatus, parseDate, toDateString } from './utils.mjs';

const scopeConfig = {
  student: { label: 'تقرير حضور طالب', column: 'st.id' },
  subject: { label: 'تقرير حضور مادة', column: 'subj.id' },
  department: { label: 'تقرير حضور قسم', column: 'dep.id' },
  level: { label: 'تقرير حضور مرحلة', column: 'lvl.id' },
  daily: { label: 'تقرير حضور يومي', column: null },
  weekly: { label: 'تقرير حضور أسبوعي', column: null },
  monthly: { label: 'تقرير حضور شهري', column: null },
};

export async function buildReport(filters, viewer) {
  const scope = scopeConfig[filters.scope] ? filters.scope : 'monthly';
  const today = new Date();
  const fallbackFrom = new Date(today.getFullYear(), today.getMonth(), 1);
  const dateFrom = parseDate(filters.dateFrom || toDateString(fallbackFrom), 'تاريخ البداية');
  const dateTo = parseDate(filters.dateTo || toDateString(today), 'تاريخ النهاية');
  if (dateFrom > dateTo) throw new AppError(400, 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية');

  const params = [dateFrom, dateTo];
  let extra = '';
  const config = scopeConfig[scope];
  if (config.column && filters.entityId) {
    extra += ` AND ${config.column} = ?`;
    params.push(Number(filters.entityId));
  }
  if (viewer.role === 'doctor') {
    extra += ' AND sch.doctor_id = ?';
    params.push(viewer.doctor_id);
  }

  const rows = await query(
    `SELECT ls.session_date, ls.status AS session_status,
            sch.start_time, sch.end_time,
            subj.name AS subject_name, subj.code AS subject_code,
            d.full_name AS doctor_name,
            st.full_name AS student_name, st.university_number,
            dep.name AS department_name, lvl.name AS level_name,
            sm.label_ar AS study_mode_label,
            ar.id AS attendance_id, ar.marked_at, ar.photo_attachment_id
     FROM lecture_sessions ls
     JOIN lecture_schedules sch ON sch.id = ls.schedule_id
     JOIN subjects subj ON subj.id = sch.subject_id
     JOIN doctors d ON d.id = sch.doctor_id
     JOIN departments dep ON dep.id = sch.department_id
     JOIN levels lvl ON lvl.id = sch.level_id
     JOIN study_modes sm ON sm.code = sch.study_mode
     JOIN students st ON st.department_id = sch.department_id
       AND st.level_id = sch.level_id AND st.study_mode = sch.study_mode
       AND st.profile_completed = 1
     JOIN users u ON u.id = st.user_id AND u.is_active = 1
     LEFT JOIN attendance_records ar ON ar.session_id = ls.id AND ar.student_id = st.id
     WHERE ls.session_date BETWEEN ? AND ? ${extra}
     ORDER BY ls.session_date DESC, sch.start_time, st.full_name`,
    params,
  );

  const now = new Date();
  return rows.map((row) => ({
    date: row.session_date,
    subject: row.subject_name,
    subjectCode: row.subject_code,
    doctor: row.doctor_name,
    student: row.student_name,
    universityNumber: row.university_number,
    department: row.department_name,
    level: row.level_name,
    studyMode: row.study_mode_label,
    status: attendanceDisplayStatus(row, now),
    statusLabel: { present: 'حاضر', absent: 'غائب', not_marked: 'لم يسجل بعد' }[attendanceDisplayStatus(row, now)],
    attendanceId: row.attendance_id ? Number(row.attendance_id) : null,
    markedAt: row.marked_at,
    hasPhoto: Boolean(row.photo_attachment_id),
  }));
}

export function summarize(rows) {
  const present = rows.filter((row) => row.status === 'present').length;
  const absent = rows.filter((row) => row.status === 'absent').length;
  const pending = rows.filter((row) => row.status === 'not_marked').length;
  return {
    total: rows.length,
    present,
    absent,
    pending,
    rate: rows.length ? Math.round((present / rows.length) * 100) : 0,
  };
}

const reportColumns = [
  { header: 'التاريخ', key: 'date', width: 14 },
  { header: 'الطالب', key: 'student', width: 28 },
  { header: 'الرقم الجامعي', key: 'universityNumber', width: 18 },
  { header: 'القسم', key: 'department', width: 22 },
  { header: 'المرحلة', key: 'level', width: 14 },
  { header: 'الدراسة', key: 'studyMode', width: 12 },
  { header: 'المادة', key: 'subject', width: 26 },
  { header: 'الدكتور', key: 'doctor', width: 24 },
  { header: 'الحالة', key: 'statusLabel', width: 14 },
  { header: 'وقت الحضور', key: 'markedAt', width: 20 },
];

export async function exportExcel(rows, title) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Campus Attendance';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('التقرير', { views: [{ rtl: true }] });
  sheet.columns = reportColumns;
  sheet.addRow([]);
  const titleRow = sheet.insertRow(1, [title]);
  titleRow.font = { bold: true, size: 14, color: { argb: 'FF12315A' } };
  titleRow.alignment = { horizontal: 'right' };

  const summary = summarize(rows);
  sheet.insertRow(2, [
    `الإجمالي: ${summary.total}`,
    `الحاضر: ${summary.present}`,
    `الغائب: ${summary.absent}`,
    `النسبة: ${summary.rate}%`,
  ]);

  rows.forEach((row) => sheet.addRow(row));
  sheet.getRow(4).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF12315A' } };
    cell.alignment = { horizontal: 'right' };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function exportPdf(rows, title) {
  try {
    await fs.access(FONT_PATH);
  } catch {
    throw new AppError(503, 'خط PDF العربي غير مثبت. شغّل: npm run download:font', 'PDF_FONT_MISSING');
  }

  const summary = summarize(rows);
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.registerFont('Arabic', FONT_PATH);
      doc.font('Arabic');

      const text = (value, x, y, options = {}) =>
        doc.text(String(value ?? ''), x, y, { features: ['rtl'], ...options });

      text(title, doc.page.width - doc.page.margin, 36, { width: doc.page.width - 72, align: 'right', fontSize: 18, bold: true });
      text(
        `الإجمالي: ${summary.total}   |   الحاضر: ${summary.present}   |   الغائب: ${summary.absent}   |   نسبة الحضور: ${summary.rate}%`,
        doc.page.width - doc.page.margin,
        68,
        { width: doc.page.width - 72, align: 'right', fontSize: 10 },
      );
      text(`تاريخ التقرير: ${toDateString(new Date())}`, doc.page.width - doc.page.margin, 86, {
        width: doc.page.width - 72,
        align: 'right',
        fontSize: 9,
      });

      let y = 112;
      const headers = ['التاريخ', 'الطالب', 'المادة', 'القسم', 'المرحلة', 'الحالة', 'وقت الحضور'];
      const cols = [90, 150, 140, 130, 90, 80, 100];
      const startX = doc.page.width - doc.page.margin;

      const drawLine = (values, isHeader = false) => {
        if (isHeader) doc.rect(30, y - 3, doc.page.width - 60, 20).fill('#12315A');
        doc.fillColor(isHeader ? '#FFFFFF' : '#1F2937');
        let cursor = startX;
        values.forEach((value, index) => {
          text(value, cursor - cols[index] + 4, y, { width: cols[index] - 8, fontSize: 8 });
          cursor -= cols[index];
        });
        y += isHeader ? 24 : 18;
        doc.fillColor('#1F2937');
      };

      drawLine(headers, true);
      rows.forEach((row, index) => {
        if (y > doc.page.height - 60) {
          doc.addPage();
          doc.font('Arabic');
          y = 40;
          drawLine(headers, true);
        }
        drawLine([
          row.date,
          row.student,
          row.subject,
          row.department,
          row.level,
          row.statusLabel,
          row.markedAt || '—',
        ]);
        if (index % 2 === 1) {
          doc.rect(30, y - 18, doc.page.width - 60, 18).fillOpacity(0.05).fill('#0F766E').fillOpacity(1);
        }
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
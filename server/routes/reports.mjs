import { Router } from 'express';
import { z } from 'zod';
import { authRequired, requireRole } from '../auth.mjs';
import { asyncHandler } from '../errors.mjs';
import { buildReport, exportExcel, exportPdf, summarize } from '../reports.mjs';
import { audit } from '../audit.mjs';
import { deleteAttendanceRecord } from '../attendance-delete.mjs';
import { publish } from '../realtime.mjs';

export const reportsRouter = Router();
reportsRouter.use(authRequired, requireRole('admin', 'doctor'));

const querySchema = z.object({
  scope: z.enum(['student', 'subject', 'department', 'level', 'daily', 'weekly', 'monthly']).optional(),
  entityId: z.coerce.number().int().positive().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  format: z.enum(['json', 'excel', 'pdf']).optional(),
});

reportsRouter.get('/', asyncHandler(async (req, res) => {
  const filters = querySchema.parse(req.query);
  const rows = await buildReport({ ...filters, scope: filters.scope || 'monthly' }, req.user);
  const summary = summarize(rows);

  if (filters.format === 'excel' || filters.format === 'pdf') {
    const title = `تقرير الحضور - ${new Date().toLocaleDateString('ar')}`;
    const buffer = filters.format === 'excel' ? await exportExcel(rows, title) : await exportPdf(rows, title);
    const filename = filters.format === 'excel' ? 'attendance-report.xlsx' : 'attendance-report.pdf';
    await audit(req, 'REPORT_EXPORTED', 'report', null, { ...filters, rows: rows.length });
    res.setHeader('Content-Type', filters.format === 'excel'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  }

  res.json({ rows, summary });
}));

reportsRouter.delete('/attendance/:id', asyncHandler(async (req, res) => {
  const record = await deleteAttendanceRecord(req.params.id, req.user);
  publish('attendance:deleted', record);
  await audit(req, 'ATTENDANCE_DELETED', 'attendance', record.id, record);
  res.json({ ok: true, ...record });
}));

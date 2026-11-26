import { Router } from 'express';
import { query } from '../db.mjs';
import { authRequired } from '../auth.mjs';
import { asyncHandler } from '../errors.mjs';

export const sharedRouter = Router();

sharedRouter.get('/', authRequired, asyncHandler(async (_req, res) => {
  const [departments, levels, departmentLevels, subjects, doctors, studyModes] = await Promise.all([
    query('SELECT id, name, code, is_active FROM departments ORDER BY name'),
    query('SELECT id, name, code FROM levels ORDER BY CAST(code AS INTEGER), id'),
    query('SELECT department_id, level_id FROM department_levels'),
    query(`SELECT s.id, s.name, s.code, s.department_id, s.level_id, s.is_active,
                  dep.name AS department_name, lvl.name AS level_name
           FROM subjects s
           JOIN departments dep ON dep.id = s.department_id
           JOIN levels lvl ON lvl.id = s.level_id
           ORDER BY s.name`),
    query(`SELECT d.id, d.full_name, d.department_id, dep.name AS department_name, u.username, u.is_active
           FROM doctors d JOIN users u ON u.id = d.user_id
           LEFT JOIN departments dep ON dep.id = d.department_id
           ORDER BY d.full_name`),
    query('SELECT code, label_ar FROM study_modes ORDER BY code'),
  ]);
  res.json({ departments, levels, departmentLevels, subjects, doctors, studyModes });
}));

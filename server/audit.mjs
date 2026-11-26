import { query } from './db.mjs';

export async function audit(req, action, entityType = null, entityId = null, details = null) {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.user?.id || null,
        action,
        entityType,
        entityId,
        details ? JSON.stringify(details) : null,
        req.ip || null,
      ],
    );
  } catch (error) {
    console.error('Audit log failed:', error.message);
  }
}

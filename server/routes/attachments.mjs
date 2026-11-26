import fs from 'node:fs/promises';
import { Router } from 'express';
import { authRequired } from '../auth.mjs';
import { asyncHandler } from '../errors.mjs';
import { findAttachmentForViewer } from '../uploads.mjs';

export const attachmentsRouter = Router();

attachmentsRouter.get('/:id', authRequired, asyncHandler(async (req, res) => {
  const attachment = await findAttachmentForViewer(Number(req.params.id), req.user);
  const file = await fs.readFile(attachment.storage_path);
  res.setHeader('Content-Type', attachment.mime);
  res.setHeader('Content-Length', file.length);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(file);
}));

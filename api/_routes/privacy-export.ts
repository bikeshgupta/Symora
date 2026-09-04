/**
 * GET /api/privacy/export — everything Symora holds about the caller, as one JSON file
 * (PROGRESS.md Phase 8).
 *
 * Scoped entirely to the verified user id. The download is served as an attachment so a
 * browser saves it rather than rendering it, and it opens with a plain statement of what
 * Symora does and does not collect.
 */

import { getSupabaseServiceClient, privacyService, type DataExport } from '@symora/core';
import { ApiError } from '../_middleware/errors';
import { withApiHandler } from '../_middleware/handler';

export default withApiHandler(async (req, res, ctx) => {
  if (req.method !== 'GET') {
    throw new ApiError('METHOD_NOT_ALLOWED', `${req.method} is not allowed on /api/privacy/export.`);
  }

  const now = new Date();
  const data: DataExport = await privacyService.exportData(getSupabaseServiceClient(), ctx.user, now);

  const filename = `symora-export-${now.toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // Deliberately the bare document rather than the { data } envelope: this is a file the
  // user keeps, and an API wrapper around it would just be noise in their download.
  res.status(200).send(JSON.stringify(data, null, 2));
});

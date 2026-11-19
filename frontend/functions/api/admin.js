// Cloudflare Pages Function: POST /api/admin — the admin portal's API (admins only).
import { createAdminHandler } from '../../shared/admin.js';
import { makeAdminDeps } from '../../shared/deps.js';
import { toCloudflare } from '../../shared/cf-adapter.js';

export const onRequest = toCloudflare(env => createAdminHandler(makeAdminDeps(env)));

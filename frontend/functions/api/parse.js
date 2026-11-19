// Cloudflare Pages Function: POST /api/parse — bank SMS from a phone automation.
// Same pipeline as Vercel's api/parse.js (shared/ingest.js).
import { createIngestHandler } from '../../shared/ingest.js';
import { makeIngestDeps } from '../../shared/deps.js';
import { toCloudflare } from '../../shared/cf-adapter.js';

export const onRequest = toCloudflare(env => createIngestHandler(makeIngestDeps(env)));

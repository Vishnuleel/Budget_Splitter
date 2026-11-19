// Cloudflare Pages Function: POST /api/receipt — receipt photo → items (Gemini vision, nothing stored).
import { createReceiptHandler } from '../../shared/receiptAi.js';
import { makeReceiptDeps } from '../../shared/deps.js';
import { toCloudflare } from '../../shared/cf-adapter.js';

export const onRequest = toCloudflare(env => createReceiptHandler(makeReceiptDeps(env)));

// Cloudflare Pages Function: POST /api/bill — "pick your items" links for shared receipts.
import { createBillShareHandler } from '../../shared/billShare.js';
import { makeBillShareDeps } from '../../shared/deps.js';
import { toCloudflare } from '../../shared/cf-adapter.js';

export const onRequest = toCloudflare(env => createBillShareHandler(makeBillShareDeps(env)));

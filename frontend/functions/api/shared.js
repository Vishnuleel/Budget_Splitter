// Cloudflare Pages Function: POST /api/shared — friends and bills sent into friends' accounts.
import { createSharedHandler } from '../../shared/friends.js';
import { makeSharedDeps } from '../../shared/deps.js';
import { toCloudflare } from '../../shared/cf-adapter.js';

export const onRequest = toCloudflare(env => createSharedHandler(makeSharedDeps(env)));

// Adapts a Node-style (req, res) handler to a Cloudflare Pages Function.
// Cloudflare hands us a Fetch Request + per-request env; our shared handlers expect
// { method, headers, query, body } and res.status().json().

async function readBody(request) {
  if (request.method !== 'POST' && request.method !== 'PATCH' && request.method !== 'PUT') return undefined;
  const type = request.headers.get('content-type') || '';
  const raw = await request.text();
  if (type.includes('application/json')) {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  if (type.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
  return raw; // text/plain (MacroDroid) — handlers also sniff JSON strings
}

/** @param {(env: Record<string, string>) => (req: any, res: any) => any} makeHandler */
export function toCloudflare(makeHandler) {
  let cached; // reuse clients across requests on the same isolate
  const handlerFor = env => {
    if (!cached || cached.env !== env) cached = { env, handler: makeHandler(env) };
    return cached.handler;
  };

  return async function onRequest({ request, env }) {
    const url = new URL(request.url);
    const headers = Object.fromEntries([...request.headers].map(([k, v]) => [k.toLowerCase(), v]));
    if (!headers['x-forwarded-for']) headers['x-forwarded-for'] = request.headers.get('cf-connecting-ip') || 'cf';
    const req = { method: request.method, headers, query: Object.fromEntries(url.searchParams), body: await readBody(request) };

    return new Promise(resolve => {
      const res = {
        code: 200,
        status(c) { this.code = c; return this; },
        json(payload) {
          resolve(new Response(JSON.stringify(payload), {
            status: this.code,
            headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
          }));
          return this;
        },
      };
      Promise.resolve(handlerFor(env)(req, res)).catch(err => {
        console.error(err);
        resolve(new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { 'content-type': 'application/json' } }));
      });
    });
  };
}

// SMS ingestion pipeline behind POST /api/parse. Database access is injected so it can be tested
// without Supabase (scripts/test-ingest.mjs). Each person has a personal SMS key (Settings → Use on
// your phone); we only ever store its SHA-256 hash, and look the person up by that hash.
import { createHash } from 'node:crypto';
import { parseSms, findAmounts } from './sms.js';

export const SMS_KEY_PREFIX = 'bs_';

export function hashSmsKey(key) {
  return createHash('sha256').update(String(key)).digest('hex');
}

/** Texts we never want to log as transactions. */
const JUNK = [
  [/\b(otp|one[- ]time password|verification code|passcode)\b/i, 'otp'],
  [/\b(do not share|never share).{0,40}\b(code|otp|pin|cvv)\b/i, 'otp'],
  [/\b(pre-?approved|eligible for|apply now|offer|cashback offer|win|lucky|congratulations|limited period|emi offer|personal loan of)\b/i, 'promo'],
  [/\b(is due on|due date|minimum amount due|total amount due|statement (?:for|generated))\b/i, 'statement'],
  [/\b(request(?:ed)? money|collect request|has requested)\b/i, 'request'],
  [/\b(declined|failed|unsuccessful|not processed|insufficient)\b/i, 'declined'],
];

export function classifyJunk(text) {
  for (const [re, reason] of JUNK) if (re.test(text)) return reason;
  if (findAmounts(text).length === 0) return 'no-amount';
  return null;
}

/** Pull text + key out of whatever the phone sent: JSON, form data, or plain text. */
export function readRequest(req) {
  const headers = req.headers || {};
  let body = req.body;
  if (typeof body === 'string') {
    const trimmed = body.trim();
    if (trimmed.startsWith('{')) {
      try { body = JSON.parse(trimmed); } catch { body = { text: body }; }
    } else {
      body = { text: body };
    }
  }
  body = body && typeof body === 'object' ? body : {};
  const auth = headers.authorization || headers.Authorization || '';
  const secret = body.secret ?? body.key
    ?? headers['x-api-secret'] ?? headers['x-sms-key']
    ?? (auth.startsWith('Bearer ') ? auth.slice(7) : undefined)
    ?? req.query?.secret;
  // Shortcuts sometimes sends the message as {text: {…}} or an array; normalise to a string.
  let text = body.text ?? body.message ?? body.sms ?? body.body;
  if (Array.isArray(text)) text = text.join('\n');
  if (text != null && typeof text !== 'string') text = String(text);
  return { text: text?.trim(), secret: typeof secret === 'string' ? secret.trim() : undefined };
}

function summary({ amount, currency, merchant, category }) {
  let money;
  try {
    money = new Intl.NumberFormat(currency === 'SEK' ? 'sv-SE' : currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: amount % 1 ? 2 : 0,
    }).format(amount);
  } catch {
    money = `${amount} ${currency}`;
  }
  const cat = category.replace(/^Suggested: /, '');
  return `Saved ${money} · ${merchant}${cat && cat !== 'Uncategorized' ? ` · ${cat}` : ''}`;
}

// Very small per-instance limiter (serverless instances are short-lived; this just stops floods).
const hits = new Map();
function rateLimited(key, limit = 30, windowMs = 60_000) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter(t => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  return list.length > limit;
}

/**
 * @param {{
 *   configured: boolean,
 *   resolveUser: (keyHash: string) => Promise<{ id: string, disabled?: boolean } | null>,
 *   loadRules: (userId: string) => Promise<{merchant:string, category:string}[]>,
 *   findRecentDuplicate: (userId: string, text: string) => Promise<object | null>,
 *   insert: (row: object) => Promise<{ data: any, error: { message: string } | null }>,
 *   suggest?: (draft: object, text: string, userId: string) => Promise<{ category?: string, accountId?: number | null } | null>,
 * }} deps
 */
export function createIngestHandler(deps) {
  return async function handler(req, res) {
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, hint: 'POST {"text": "<bank SMS>", "secret": "<your personal SMS key>"}' });
    }
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }
    // Fail closed: without the service-role key we can't look people up safely.
    if (!deps.configured) {
      console.error('SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_URL missing. Refusing SMS until configured.');
      return res.status(503).json({ error: 'Server not configured: set SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_URL.' });
    }

    const ip = String(req.headers?.['x-forwarded-for'] || 'local').split(',')[0].trim();
    if (rateLimited(ip)) return res.status(429).json({ error: 'Too many requests, slow down.' });

    const { text, secret } = readRequest(req);
    if (!secret || !secret.startsWith(SMS_KEY_PREFIX) || secret.length < 20) {
      return res.status(401).json({ error: 'Unauthorized: missing or invalid SMS key' });
    }
    const user = await deps.resolveUser(hashSmsKey(secret));
    if (!user) return res.status(401).json({ error: 'Unauthorized: unknown SMS key (was it replaced?)' });
    if (user.disabled) return res.status(403).json({ error: 'This account is paused by the admin.' });

    if (!text) return res.status(400).json({ error: 'No text provided' });
    if (text.length > 2000) return res.status(413).json({ error: 'Text too long' });

    // 200 (not an error) so phone automations stay quiet for OTPs, offers, statements, etc.
    const junk = classifyJunk(text);
    if (junk) return res.status(200).json({ ignored: true, reason: junk, message: `Ignored (${junk})` });

    // The same SMS can arrive twice (two automations, a retry, iOS re-running). Log it once.
    const dup = await deps.findRecentDuplicate(user.id, text);
    if (dup) return res.status(200).json({ duplicate: true, data: [dup], message: 'Already saved' });

    const parsed = parseSms(text);
    let { category } = parsed;
    const { amount, currency, merchant, isIncome } = parsed;
    let accountId = null;

    // Your saved merchant rules (set in the app when you confirm a category) beat everything else.
    const rules = await deps.loadRules(user.id).catch(() => []);
    const rule = rules.find(r => r?.merchant && merchant.toLowerCase().includes(String(r.merchant).toLowerCase()));
    if (rule && !isIncome) category = rule.category;

    if (!rule && deps.suggest) {
      try {
        const s = await deps.suggest({ amount, currency, merchant, category }, text, user.id);
        if (s?.category && category === 'Uncategorized') category = s.category;
        if (s?.accountId) accountId = s.accountId;
      } catch (err) {
        console.error('Suggestion failed:', err);
      }
    }

    const row = { user_id: user.id, amount, currency, merchant, category, raw_text: text, account_id: accountId };
    const { data, error } = await deps.insert(row);
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ success: true, data, message: summary(row) });
  };
}

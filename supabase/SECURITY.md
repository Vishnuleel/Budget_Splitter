# Security model

| Layer | What protects it |
| --- | --- |
| **Who can sign in** | Supabase Auth (email + password, or email link). Public sign-up is **off**: only the admin creates accounts. Paused accounts are banned in Auth. |
| **Whose rows you can read/write** | Row Level Security on every table (`user_id = auth.uid()` and the account isn't paused). Enforced by Postgres, so the public anon key can't bypass it. |
| **Profiles** | Each person can read their own profile and change only their display name and SMS-key hash (column-level grants). Roles and pausing can only be changed by the admin API. |
| **Admin portal** | `/api/admin` verifies the caller's session and requires `role = admin` and not paused. It runs with the service-role key **on the server only**. It never returns transactions or amounts. |
| **Bank SMS** | `/api/parse` needs a personal SMS key (`bs_…`). Only its SHA-256 hash is stored. The endpoint maps the hash to one person and refuses paused accounts. Keys can be replaced or revoked any time. |
| **This device** | Optional app-lock PIN per person and device, stored as a hash, with auto-lock after 5 minutes in the background. |
| **AI** | The SMS goes to Gemini as delimited, untrusted data (prompt-injection resistant), and only when no rule or known merchant matched. |

## Keys

- `VITE_SUPABASE_ANON_KEY` is **public by design**. It's in the browser bundle. RLS is what makes that safe.
- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. Keep it **only** in Cloudflare Pages / Vercel encrypted variables. **Never** prefix it with `VITE_`, and never commit it.

## Housekeeping

- `frontend/.env` was committed in the early single-user days (before `.gitignore` worked). Stop tracking it with `git rm --cached frontend/.env`, and use **new** keys for the new Supabase project.
- If a phone is lost: the admin portal → **Unlink phone**, or the owner makes a new SMS key.
- If a password leaks: **New temporary password** in the admin portal, or **Pause** first.

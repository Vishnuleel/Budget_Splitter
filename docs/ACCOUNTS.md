# Accounts and the admin portal

Budget Splitter is one app with separate accounts. Everyone signs in with their own email and password, and **each person only ever sees their own data**. The database enforces this with Row Level Security, so it doesn't depend on the app behaving.

You (the admin) manage accounts at **`/admin`**: add people, reset passwords, pause, unlink phones, or delete. The portal shows activity counts, **never anyone's transactions or amounts**.

---

## First-time setup (about 15 minutes)

### 1 · Supabase project
1. Create a project at [supabase.com](https://supabase.com). The EU (Stockholm or Frankfurt) region is closest to you.
2. **Authentication → Sign In / Providers**
   - Keep **Email** enabled.
   - Turn **off** "Allow new users to sign up". Accounts are invite-only; you create them from the admin portal.
3. **Authentication → URL Configuration**
   - Site URL: `https://<your-app>.pages.dev`
   - Redirect URLs: add `https://<your-app>.pages.dev/**` (and `http://localhost:5173/**` for local testing).
4. **Authentication → Users → Add user → Create new user**: enter **your own** email and a password, and tick *Auto Confirm User*.
5. **SQL Editor → New query**: paste [`supabase/schema.sql`](../supabase/schema.sql) and run it.
   The first account (you) becomes **admin**. Rows from the old single-user version, if any, are moved into your account.

### 2 · Cloudflare Pages
Set these in **Workers & Pages → your project → Settings → Variables and Secrets** (Production):

| Name | Value | Where it's used |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Project URL (Supabase → Project Settings → API) | app + server |
| `VITE_SUPABASE_ANON_KEY` | `anon` public key | app |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key, **encrypt it** | server only: SMS endpoint + admin portal |
| `GEMINI_API_KEY` | optional | server: AI category suggestions |

Then **Retry deployment** so the `VITE_` values are built in. There's no shared PIN or API secret any more: each person has their own password, optional app-lock PIN, and SMS key.

### 3 · Sign in
Open your app, sign in with the account from step 1.4, then go to **Settings → Admin portal**.

---

## Adding your friend

1. **Admin portal → Add person**: enter their name and email.
2. Choose how they'll sign in:
   - **Temporary password** (recommended): the portal shows a password once, with **Copy message** / **Share**. Send it on WhatsApp. On first sign-in they must choose their own password.
   - **Email invite**: Supabase emails them a link. The built-in email service only sends a few emails per hour; add your own SMTP in Supabase if you need more.
3. They open the app, sign in, set a password, then follow **Settings → Use on your phone** to install it and connect their bank SMS with **their own SMS key**.

## Splitting bills with friends who have an account

1. **Update the database once:** Supabase → SQL Editor → paste the latest [`supabase/schema.sql`](../supabase/schema.sql) → Run. It's safe to re-run; it adds the `friendships` and `shared_bills` tables.
2. **Connect:** Splits → *Friends with the app* → type their email → they tap **Accept** in their app.
3. **Send a bill:** split a receipt as usual with you as the payer, pick connected friends (✓ badge), then **Send to …'s app**.
4. **They review it:** they open it, untick anything that isn't theirs, and **Accept** or **Decline**. Unticks come back to you to **Approve** (the item is re-split among whoever's still on it) or **Keep them on it**.
5. **Paid:** they tap **I've paid**, and it's settled for both of you only when you **Confirm**. For cash, you can tap **Mark as received** yourself.

Everything goes through `/api/shared` with the service-role key; signed-in users can't read or change these tables directly.

## Managing people

Open **Manage** on anyone:

| Action | What happens |
| --- | --- |
| **Rename / change role** | Make someone an admin (or back to member). |
| **Pause** (Account active → off) | They can't sign in, their SMS are refused, and the database blocks their data immediately. Nothing is deleted. Turn it back on any time. |
| **New temporary password** | Generates one to send them. They must change it at next sign-in. |
| **Email reset link** | Supabase emails them a reset link. |
| **Unlink phone** | Their SMS key stops working (lost phone, leaked key). They create a new one in the app. |
| **Delete** | Type their email to confirm. Removes their sign-in and **all** their data. Can't be undone. |

Built-in safety rules (also enforced on the server):
- You can't remove your own admin role, pause yourself, or delete yourself.
- There is always at least one active admin.
- Only admins can call the admin API. Members get "Admins only".

## Each person's security

- **Password:** their own, chosen at first sign-in. "Forgot password?" on the sign-in screen sends a reset email.
- **App lock PIN** (optional, per device): *Settings → App lock*. Only a hash is stored on that device. "Forgot PIN? Sign out" on the lock screen.
- **SMS key:** *Settings → Use on your phone → Create key*. Shown once, and only its hash is stored. Making a new key instantly retires the old one.

## Try it without a database

`/admin?demo=1` runs the real admin rules on sample people, and `/?demo=1` runs the app on sample data. Nothing is saved.

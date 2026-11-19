# Budget Splitter

A mobile-first personal finance app for an Indian living abroad (set up for **Sweden**). Card payments and transfers from your Indian bank turn into categorised transactions on their own, amounts are shown in **kronor** with each payment keeping its own currency, you can split bills with friends, and your net worth is tracked in one place, all inside a motion-rich UI that installs as a PWA.

> **Try it without a database:** open the app with `?demo=1` (or go to Settings → *Explore with demo data*). It loads two months of realistic sample data, and nothing is saved. `/admin?demo=1` shows the admin portal with sample people.

## Accounts and admin portal

- **One app, separate accounts.** Everyone signs in with their own email and password. Row Level Security in Postgres guarantees each person only sees and changes their own rows.
- **Invite-only.** Public sign-up is off. The admin adds people at **`/admin`** with a temporary password (shown once, with a ready-to-send message) or an email invite. First sign-in forces a new password.
- **Admin portal:** rename, make admin, **pause** (blocks sign-in, SMS and data instantly; keeps data), new temporary password, email reset link, **unlink phone**, and **delete** (type the email to confirm). Safety rules stop you removing the last admin or yourself. The admin sees activity counts, **never anyone's transactions or amounts**.
- **Personal SMS keys.** Each person's phone automation sends their own `bs_…` key; only its hash is stored, and it can be replaced or revoked any time.
- **Optional app-lock PIN** per person and device, with auto-lock after 5 minutes in the background.

Setup: **[docs/ACCOUNTS.md](docs/ACCOUNTS.md)**.

## Living in Sweden with an Indian bank

- **Multi-currency.** Totals, budgets and charts show in SEK (or INR/EUR/USD… in Settings → Money). Every payment, account, goal, FD, debt and bill keeps its own currency; ₹ rows show "≈ 1 234 kr" underneath. Rates are live ECB reference rates (frankfurter.dev), cached for 12 hours, with an offline fallback.
- **Indian card used abroad.** Parses HDFC/ICICI/Axis/SBI-style SMS like `Txn of SEK 245.00 … at ICA SUPERMARKET`, `USD 11.99 spent … on SPOTIFY`, and `Spent SEK 89.00 … IST ESPRESSO HOUSE Avl Lmt INR …`. It picks the foreign amount, not the converted INR or your available limit.
- **Transfers and fees.** SWIFT/outward remittance and NEFT/IMPS become *Transfers* (or *Housing* when it's your landlord). Cross-currency markup charges become *Bank fees*.
- **Forex cost insight.** "Your Indian card added roughly 148 kr in forex markup this month (3.5% on 4 224 kr spent abroad)." Set your card's markup % in Settings.
- **Swedish merchants auto-categorised.** ICA/Willys/Lidl/Coop, SL/Västtrafik/Voi/Bolt, Espresso House/Max/Foodora, Telia/Tre, Heimstaden/SGS, H&M, IKEA, Systembolaget and more need no review.
- Swedish number formats (`1 245 kr`, `15 tkr`), and decimal commas (`49,90`) accepted when typing amounts.

## Features

**Everyday**
- **Automatic SMS capture.** An iOS Shortcut posts bank SMS to `/api/parse`, which pulls out the amount, currency and merchant. UPI VPAs are cleaned up too (`swiggy@icici` → *Swiggy*). Gemini suggests a category only when the merchant isn't already known. The parser lives in `frontend/shared/sms.js`, shared by the app and the API.
- **Paste SMS.** Paste any bank message in the app for an instant on-device preview before saving.
- **One-tap review.** AI suggestions show inline ("Looks like Groceries? Yes / Change").
- **Merchant rules.** Confirm a category once and every future payment to that merchant is filed automatically, both in the app and in the parse API.
- **Quick add.** A large amount-entry sheet with recent-merchant chips, a category grid, and an animated payment-success screen.
- **Swipe to delete with undo**, live updates through Supabase Realtime, search, filters and sorting.

**Insights**
- A month switcher with spent, received and kept totals, each compared with last month
- A **budget pace** chart: cumulative spend against an on-budget line
- A category donut with optional **per-category caps**
- A **spending calendar** heatmap and top merchants
- Plain-language insights ("At this pace you'll spend ₹38K, ₹2K under budget")
- Bills and subscriptions with due-date badges and **Mark paid**, which rolls the due date forward and logs the expense

**Wealth**
- Net-worth bar (accounts + FDs − debts) and swipeable account cards
- Savings goals with top-ups and a celebration when a goal is reached
- FDs with estimated maturity value (quarterly compounding)
- Debts sorted by APR with a "Pay first" hint

**Splits**
- **Split a receipt item by item:** scan the receipt (Gemini vision via `/api/receipt`) or paste its text. Everyone shares every item by default; tap a face to take someone off (no mushrooms for Rahul), or mark items *Only me*, or split unevenly. Discounts follow what each person bought, bags are shared equally, pant follows its drink, and totals match the receipt to the öre. Each roommate gets a copy-ready message listing their items and what they were **not** charged for.
- **Let roommates pick their own items:** *Save & let them pick* creates one link (no account needed). Each roommate picks their name, unticks what isn't theirs and sees their estimated share; you tap **Apply picks** in Split history. Links expire after 30 days and only a hash of the link is stored (`/api/bill`, table `bill_shares`).
- Add friends, split any bill equally, see who owes whom, and settle up
- Start a split from any transaction

**Polish**
- "Sorbet Nord" design: puffy pastel clay shapes on Nord frost blues, Nunito, matching light and dark themes (Settings → Appearance: Auto / Light / Dark). Tokens live at the top of `frontend/src/index.css`.
- Light, dark and system themes; hide-balances privacy mode; optional per-device PIN lock
- Spring physics throughout (Motion): shared-layout tab bar, drag-to-dismiss sheets, 3D tilt on the balance card, and number roll-ups. All motion respects *reduce motion*.

## Tech stack

React 19 · TypeScript · Vite · Motion · Recharts · Lucide · Supabase (Postgres + Realtime) · Supabase Auth + Row Level Security · Cloudflare Pages + Pages Functions (`frontend/functions/api/*`) · Gemini 2.5 Flash

## Running locally

```bash
cd frontend
cp .env.example .env   # fill in your Supabase URL + anon key
npm install
npm run dev
```

Then open http://localhost:5173 (or http://localhost:5173/?demo=1 for sample data).
Sign in with an account you created in Supabase (see [docs/ACCOUNTS.md](docs/ACCOUNTS.md)). There's no shared PIN; each person can set an optional app-lock PIN per device.

### Database

Follow [docs/ACCOUNTS.md](docs/ACCOUNTS.md): turn off public sign-ups, create your own user, then run [`supabase/schema.sql`](supabase/schema.sql) once in the Supabase SQL editor. It creates every table with a `user_id` and Row Level Security, the `profiles` table (roles, paused flag, SMS-key hash), and realtime. The first user becomes admin. It also upgrades a database from the old single-user version, moving existing rows into the admin's account.

### On your phone (iPhone + Android)

The app installs to the home screen (manifest, icons, offline service worker), and bank SMS can be logged automatically with an iPhone Shortcut or Android MacroDroid automation. Step-by-step: **[docs/PHONE_SETUP.md](docs/PHONE_SETUP.md)**, also in the app under *Settings → Use on your phone*. Run `npm test` to test the SMS endpoint and the admin API (no database needed).

### SMS pipeline (API)

POST JSON to `https://<your-app>.pages.dev/api/parse`:

```json
{ "text": "<the SMS>", "secret": "<your personal SMS key, bs_…>" }
```

Each person creates their own SMS key in *Settings → Use on your phone*. Set `SUPABASE_SERVICE_ROLE_KEY` (and optionally `GEMINI_API_KEY`) in Cloudflare Pages → Settings → Variables (see [docs/PHONE_SETUP.md](docs/PHONE_SETUP.md)). The endpoint refuses all requests until `SUPABASE_SERVICE_ROLE_KEY` is set.

## Security

Supabase Auth for sign-in, Row Level Security for data, server-only service-role key for the admin and SMS endpoints, hashed SMS keys. Details: [`supabase/SECURITY.md`](supabase/SECURITY.md).

## Project layout

```
frontend/
  functions/api/          Cloudflare Pages endpoints: parse (SMS), admin, receipt (photo reading), bill (pick-your-items links), shared (friends + shared bills)
  shared/ingest.js        SMS pipeline (per-person key, junk filter, dedupe)
  shared/admin.js         admin API rules (create, pause, reset, delete; last-admin guards)
  shared/deps.js          Supabase + Gemini wiring (service role, server only)
  wrangler.toml           Cloudflare config (nodejs_compat)
  shared/sms.js           SMS parser + Swedish merchant hints, used by the API and the app
  src/
    App.tsx               sign-in → optional app lock → app or /admin; tabs, sheets, transitions
    admin/                admin portal (people list, add/manage sheets)
    components/auth/      sign-in, choose-password and status screens
    pages/                Home · Activity · Insights · Wealth
    components/           BalanceCard, TabBar, TransactionRow, LockScreen…
    components/sheets/    Add, Paste SMS, Transaction, Splits, Settings, Budgets, generic forms
    components/ui/        motion primitives (Sheet, Ring, Bar, AnimatedNumber…) + toasts/celebration
    store/                DataContext (Supabase + realtime + demo mode), UIContext
    lib/                  auth, admin API client, money (currencies + FX), settings sync, SMS keys, splits, CSV, demo data
supabase/                 schema.sql (multi-user + RLS), SECURITY.md
docs/                     ACCOUNTS.md (setup + admin), PHONE_SETUP.md (home screen + SMS)
```

## License

Personal use and portfolio demonstration.

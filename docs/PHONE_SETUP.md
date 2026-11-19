# Phone setup: home-screen app + automatic bank SMS

This works on **iPhone** (Shortcuts app) and **Android** (MacroDroid), for every person with an account.
Every bank SMS goes to your app's `/api/parse` endpoint together with **your personal SMS key**, so it lands in your account only. The endpoint reads the amount, currency and merchant, ignores OTPs, offers, statements, declined payments and duplicates, and replies with a short line like `Saved 245 kr · ICA Supermarket · Groceries` that your phone shows as a notification.

> **The SMS has to reach the phone.** Indian banks text your Indian number, so keep that SIM or eSIM active on roaming in your phone. Receiving SMS on roaming is usually free; check with your carrier (Jio/Airtel/Vi).

---

## 0 · Deploy once to Cloudflare Pages (admin only, about 15 minutes)

Phones need an `https://` address, so `localhost` won't work. Friends skip this section; they just sign in to your app.

1. **Supabase:** follow *First-time setup* in [ACCOUNTS.md](ACCOUNTS.md) (disable public sign-ups, create your user, run [`supabase/schema.sql`](../supabase/schema.sql)).
2. **Push this repo to GitHub** (private is fine).
3. **Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git**, then pick the repo:
   - Root directory: `frontend`
   - Build command: `npm run build`
   - Build output directory: `dist`

   The `/api/parse` and `/api/admin` endpoints deploy automatically from `frontend/functions/`, and `frontend/wrangler.toml` turns on the `nodejs_compat` flag they need.
4. **Settings → Variables and Secrets** (add them for *Production*; use **Encrypt** for the secret ones):

   | Name | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
   | `VITE_SUPABASE_ANON_KEY` | the `anon` key |
   | `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` key (server only, **never** prefix with `VITE_`, **encrypt** it) |
   | `GEMINI_API_KEY` | optional, for AI category suggestions |

   The `VITE_` values are baked into the app at build time, so **retry the deployment** after adding them.
5. Open `https://<your-app>.pages.dev/api/parse` in a browser: you should see `{"ok":true,...}`.

Test it from a computer with your SMS key (see step 2):

```bash
curl -X POST https://<your-app>.pages.dev/api/parse -H "Content-Type: application/json" -d "{\"text\":\"Txn of SEK 245.00 done using HDFC Bank Card x1234 at ICA SUPERMARKET on 17-11-26\",\"secret\":\"YOUR_SMS_KEY\"}"
```

**Deploying from your computer instead of Git:** `npx wrangler login` once, then `npm run cf:deploy` in `frontend`. Set the variables in the dashboard as above.
**Testing locally:** copy `frontend/.dev.vars.example` to `.dev.vars`, fill it in, then run `npm run cf:dev` and open http://localhost:8788.

---

## 1 · Put the app on your home screen

**iPhone (Safari only):** open your app URL → **Share** → **Add to Home Screen** → **Add**.
**Android (Chrome):** open your app URL → **⋮ → Install app**, or tap **Install** in *Settings → Use on your phone*.

It opens full-screen with its own icon, works offline, and long-pressing the icon gives **Add expense** and **Paste bank SMS** shortcuts on Android.
The in-app guide (*Settings → Use on your phone*) shows the same steps, with copy buttons for the URL and body.

---

## 2 · Get your personal SMS key

In the app: **Settings → Use on your phone → Create key**. Copy the `bs_…` key; it's shown only once.
Only a hash is stored, so if you lose it, make a new key (the old one stops working immediately). Each person makes their own.

## 2a · iPhone: Shortcuts automation

1. Open **Shortcuts → Automation → + → Message**.
2. Set **Message Contains** to `debited`. (Make extra automations for `spent` and `Txn of`, or whatever words your bank uses.)
   Optionally set **Sender** if your bank's sender ID is saved as a contact.
3. Choose **Run Immediately** and turn **off** *Notify When Run* (iOS 17 or later). Tap **Next**.
4. Add the action **Get Contents of URL**:
   - URL: `https://<your-app>.pages.dev/api/parse`
   - Method: **POST**
   - Request Body: **JSON**
     - `text` (Text) → tap and choose the **Shortcut Input** variable
     - `secret` (Text) → your SMS key (`bs_…`)
5. Add **Get Dictionary Value** → key `message` from *Contents of URL*.
6. Add **Show Notification** → *Dictionary Value*.
7. Done. Send yourself a test SMS containing `debited Rs 1.00 at TEST` and you should get a "Saved ₹1 · Test" notification.

## 2b · Android: MacroDroid automation

1. Install **MacroDroid** (free) from the Play Store.
2. **Add Macro → Trigger → Phone/SMS → SMS Received**:
   - Number: *Any number*, or your bank's sender (e.g. `HDFCBK`, `ICICIB`, `AXISBK`, `SBIINB`)
   - Content: *Matches* → `*debited*` (add another trigger for `*spent*` and `*Txn*`)
   - Grant the SMS permission when asked.
3. **Action → Connectivity → HTTP Request**:
   - Method **POST**, URL `https://<your-app>.pages.dev/api/parse`
   - Header: `x-api-secret` = your SMS key (`bs_…`)
   - Content type `text/plain`, body: `[sms_message]` (insert it with the **…** magic-text button).
     Plain text avoids broken JSON when an SMS has line breaks or quotes.
   - Optional: **Save response to variable** → `reply`.
4. Optional: **Action → Notification**, text `[lv=reply]`.
5. Save, then send yourself a test SMS.

*Prefer no third-party app?* The next step would be wrapping this web app with **Capacitor** into a small Android app that reads SMS itself (sideloaded, about a day's work). Apple doesn't allow apps to read SMS, so on iPhone the Shortcut is the only way.

---

## Troubleshooting

| Reply / symptom | Fix |
| --- | --- |
| `401 … unknown SMS key` | The key in the automation is wrong or was replaced. Make a new one in the app and paste it (watch for spaces). |
| `403 This account is paused` | The admin paused this account. |
| `503 Server not configured` | `SUPABASE_SERVICE_ROLE_KEY` / `VITE_SUPABASE_URL` aren't set in Cloudflare Pages, or the deployment wasn't retried after adding them. |
| `Ignored (otp / promo / statement / declined / no-amount)` | Working as intended for that kind of SMS. If a real payment was ignored, send me the text (mask the card number). |
| `Already saved` | Duplicate SMS; it was logged the first time. |
| Nothing happens on iPhone | Check *Run Immediately* is on, and the trigger word really is in the SMS. |
| Nothing happens on Android | Turn off battery optimisation for MacroDroid and check its system log. |
| Wrong category | Fix it once in the app with "Always use this for …" switched on. Future SMS from that merchant follow your rule. |

## Friends

Add them in the admin portal (see [ACCOUNTS.md](ACCOUNTS.md)). They sign in on their own phone, follow steps 1–2 with **their own** SMS key, and only ever see their own data.

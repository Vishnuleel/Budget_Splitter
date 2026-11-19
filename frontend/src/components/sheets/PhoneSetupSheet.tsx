import { useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Copy, Check, Smartphone, MessageSquareText, Share, PlusSquare, Download, KeyRound, RefreshCw } from 'lucide-react';
import { isStandalone, parseEndpoint, platform, promptInstall, useCanPromptInstall } from '../../lib/pwa';
import { useFeedback } from '../ui/Feedback';
import { useAuth } from '../../lib/auth';
import { createSmsKey } from '../../lib/secure';
import { Segmented, Sheet } from '../ui/primitives';

type OS = 'ios' | 'android';

function CopyField({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  const { toast } = useFeedback();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      window.setTimeout(() => setDone(false), 1500);
    } catch {
      toast({ message: 'Copy blocked — long-press the text to copy it.' });
    }
  };
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="row" style={{ gap: 8 }}>
        <code className="input grow" style={{ fontSize: '0.78rem', fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all', whiteSpace: 'pre-wrap', userSelect: 'all' }}>{value}</code>
        <motion.button type="button" className="icon-btn" whileTap={{ scale: 0.88 }} onClick={copy} aria-label={`Copy ${label}`} style={{ flexShrink: 0 }}>
          {done ? <Check size={16} color="var(--jade)" /> : <Copy size={16} />}
        </motion.button>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 10, padding: '8px 0' }}>
      <span className="tile num" style={{ width: 24, height: 24, borderRadius: 8, background: 'var(--ink)', color: 'var(--surface)', fontSize: '0.72rem', fontWeight: 800 }}>{n}</span>
      <div className="grow" style={{ fontSize: '0.86rem', lineHeight: 1.45 }}>
        <div style={{ fontWeight: 800 }}>{title}</div>
        <div className="muted" style={{ fontWeight: 600 }}>{children}</div>
      </div>
    </div>
  );
}

const B = ({ children }: { children: ReactNode }) => <b style={{ color: 'var(--ink)' }}>{children}</b>;

function Body() {
  const detected = platform();
  const [os, setOs] = useState<OS>(detected === 'android' ? 'android' : 'ios');
  const canPrompt = useCanPromptInstall();
  const installed = isStandalone();
  const endpoint = parseEndpoint();
  const local = /localhost|127\.0\.0\.1/.test(endpoint);
  const { profile, user, demo, refreshProfile } = useAuth();
  const { toast } = useFeedback();
  const [key, setKey] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const linkedAt = profile?.sms_token_created_at;
  const shownKey = key ?? 'YOUR_SMS_KEY';
  const iosBody = `{ "text": <Shortcut Input>, "secret": "${shownKey}" }`;
  const androidBody = '[sms_message]';

  const makeKey = async () => {
    if (linkedAt && !key && !window.confirm('Make a new key? Phones using your current key will stop logging until you paste the new one.')) return;
    setMaking(true);
    try {
      setKey(await createSmsKey(user?.id ?? profile?.id ?? '', demo));
      await refreshProfile();
    } catch (err) {
      toast({ message: `Couldn’t create a key: ${(err as Error).message}` });
    } finally {
      setMaking(false);
    }
  };

  return (
    <div className="form-stack">
      <Segmented id="phone-os" value={os} onChange={setOs} options={[{ value: 'ios', label: 'iPhone' }, { value: 'android', label: 'Android' }]} />

      {local && (
        <p className="badge warn" style={{ whiteSpace: 'normal', padding: '8px 10px', lineHeight: 1.4 }}>
          You’re on localhost. Phones need the deployed https:// address. Deploy to Cloudflare Pages first, then open this guide there.
        </p>
      )}

      <section className="card">
        <div className="row" style={{ gap: 8, marginBottom: 4 }}><Smartphone size={18} /><h3 style={{ fontSize: '0.98rem' }}>1 · Put it on your home screen</h3></div>
        {installed ? (
          <p className="badge good">You’re already using the installed app.</p>
        ) : os === 'ios' ? (
          <>
            <Step n={1} title="Open this page in Safari">Other iPhone browsers can’t install web apps.</Step>
            <Step n={2} title="Tap Share"><span className="row" style={{ gap: 4, display: 'inline-flex' }}>The <Share size={14} /> button in the toolbar.</span></Step>
            <Step n={3} title="Add to Home Screen"><span className="row" style={{ gap: 4, display: 'inline-flex' }}>Scroll the sheet, tap <PlusSquare size={14} /> <B>Add to Home Screen</B>, then <B>Add</B>.</span></Step>
          </>
        ) : canPrompt ? (
          <motion.button type="button" className="btn btn-primary btn-block" whileTap={{ scale: 0.97 }} onClick={() => promptInstall()}>
            <Download size={16} /> Install Budget Splitter
          </motion.button>
        ) : (
          <>
            <Step n={1} title="Open this page in Chrome">Samsung Internet works too.</Step>
            <Step n={2} title="Tap ⋮ → Install app">Some phones call it <B>Add to Home screen</B>.</Step>
          </>
        )}
      </section>

      <section className="card">
        <div className="row" style={{ gap: 8, marginBottom: 4 }}><MessageSquareText size={18} /><h3 style={{ fontSize: '0.98rem' }}>2 · Log bank SMS automatically</h3></div>
        <p className="faint" style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 6 }}>
          Your Indian SIM/eSIM must be active (roaming) so the bank SMS reaches this phone.
        </p>

        <div className="sms-key">
          <div className="row" style={{ gap: 10 }}>
            <span className="tile" style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--marigold-soft)', color: 'var(--marigold-ink)' }}><KeyRound size={16} /></span>
            <div className="grow">
              <div style={{ fontWeight: 800, fontSize: '0.88rem' }}>Your personal SMS key</div>
              <div className="faint" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                {key ? 'Copy it now. It won’t be shown again.' : linkedAt ? `Linked ${new Date(linkedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · only you can see your SMS` : 'Tells the app the SMS is yours'}
              </div>
            </div>
            <motion.button type="button" className={`btn btn-sm ${linkedAt || key ? 'btn-ghost' : 'btn-primary'}`} whileTap={{ scale: 0.94 }} onClick={makeKey} disabled={making}>
              {linkedAt || key ? <><RefreshCw size={13} /> New key</> : 'Create key'}
            </motion.button>
          </div>
          {key && <div style={{ marginTop: 10 }}><CopyField label="SMS key" value={key} /></div>}
        </div>
        {os === 'ios' ? (
          <>
            <Step n={1} title="Shortcuts → Automation → + → Message">Set <B>Message Contains</B> to <B>debited</B>. Make another automation for <B>spent</B> and one for <B>Txn</B> — or anything else your bank writes.</Step>
            <Step n={2} title="Choose “Run Immediately”">and turn off <B>Notify When Run</B> (iOS 17+), so it works without a tap.</Step>
            <Step n={3} title="Add action: Get Contents of URL">Paste the URL below. Method <B>POST</B>, Request Body <B>JSON</B>. Add field <B>text</B> → pick the <B>Shortcut Input</B> variable (the message), and field <B>secret</B> → your SMS key.</Step>
            <Step n={4} title="Add: Get Dictionary Value → Show Notification">Get value for key <B>message</B> from <B>Contents of URL</B>, then show it, so you see “Saved 245 kr · ICA · Groceries”.</Step>
          </>
        ) : (
          <>
            <Step n={1} title="Install MacroDroid (free) from Play Store">Allow the SMS permission when asked.</Step>
            <Step n={2} title="Trigger: SMS Received">Choose <B>Any number</B> and <B>Content matches</B> <B>*debited*</B> (repeat for *spent*, *Txn*), or pick your bank’s sender like <B>HDFCBK</B>.</Step>
            <Step n={3} title="Action: HTTP Request">Method <B>POST</B>, the URL below. Add header <B>x-api-secret</B> = your SMS key. Content type <B>text/plain</B>, body <B>[sms_message]</B> (plain text never breaks on line breaks or quotes).</Step>
            <Step n={4} title="Optional: show the reply">Save the response to a variable and add a <B>Notification</B> action with it.</Step>
          </>
        )}
        <div className="form-stack" style={{ marginTop: 8 }}>
          <CopyField label="URL" value={endpoint} />
          {os === 'ios' ? (
            <CopyField label="JSON body" value={iosBody} />
          ) : (
            <>
              <CopyField label="Header" value={`x-api-secret: ${shownKey}`} />
              <CopyField label="Body (text/plain)" value={androidBody} />
            </>
          )}
        </div>
        <p className="faint" style={{ fontSize: '0.76rem', fontWeight: 600, marginTop: 10, lineHeight: 1.45 }}>
          OTPs, offers and duplicate messages are ignored automatically. Keep your key private: anyone with it can add transactions to your account. Lost a phone? Make a new key and the old one stops working.
        </p>
      </section>
    </div>
  );
}

export default function PhoneSetupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Use on your phone">
      <Body />
    </Sheet>
  );
}

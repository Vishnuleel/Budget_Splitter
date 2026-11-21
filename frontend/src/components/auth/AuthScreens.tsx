import { useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Eye, EyeOff, Mail, KeyRound, ArrowLeft, LogOut, Database, PauseCircle, FlaskConical } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../lib/auth';
import Logo from '../Logo';

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <div className="hero-blob a" style={{ top: -60, right: -80 }} />
      <div className="hero-blob b" style={{ bottom: 40, left: -100 }} />
      <motion.div className="auth-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
        {children}
      </motion.div>
    </div>
  );
}

function Brand({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 22 }}>
      <div className="auth-logo"><Logo size={40} animate /></div>
      <h1 style={{ fontSize: '1.45rem', marginTop: 14 }}>{title}</h1>
      {sub && <p style={{ color: 'var(--hero-ink-2)', marginTop: 6, fontWeight: 600, fontSize: '0.88rem', lineHeight: 1.45 }}>{sub}</p>}
    </div>
  );
}

function Notice({ tone, children }: { tone: 'ok' | 'err'; children: ReactNode }) {
  return (
    <motion.p role={tone === 'err' ? 'alert' : 'status'} className={`auth-msg ${tone}`} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
      {children}
    </motion.p>
  );
}

function friendly(message: string) {
  if (/invalid login credentials/i.test(message)) return 'That email and password don’t match. Check both, or use “Forgot password”.';
  if (/email not confirmed/i.test(message)) return 'This email isn’t confirmed yet. Ask your admin to resend the invite.';
  if (/banned|user is banned/i.test(message)) return 'This account is paused. Ask your admin to turn it back on.';
  if (/signups not allowed|not allowed for otp/i.test(message)) return 'No account for that email. Ask your admin to add you.';
  if (/rate limit|too many/i.test(message)) return 'Too many tries. Wait a minute and try again.';
  if (/failed to fetch|network/i.test(message)) return 'Can’t reach the server. Check your connection.';
  return message;
}

export function LoginScreen() {
  const [mode, setMode] = useState<'password' | 'link' | 'forgot'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const redirectTo = location.origin;
    try {
      if (mode === 'password') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else if (mode === 'link') {
        const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: redirectTo } });
        if (error) throw error;
        setMsg({ tone: 'ok', text: `Check ${email.trim()} for a sign-in link. Open it on this device.` });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
        if (error) throw error;
        setMsg({ tone: 'ok', text: 'If that email has an account, a reset link is on its way.' });
      }
    } catch (err) {
      setMsg({ tone: 'err', text: friendly((err as Error).message) });
    } finally {
      setBusy(false);
    }
  };

  const titles = {
    password: ['Welcome back', 'Sign in to your Splitkvitto account.'],
    link: ['Sign in by email', 'We’ll email you a one-tap sign-in link.'],
    forgot: ['Reset your password', 'We’ll email you a link to choose a new one.'],
  } as const;

  return (
    <Shell>
      <Brand title={titles[mode][0]} sub={titles[mode][1]} />
      <form className="form-stack" onSubmit={submit}>
        <label className="auth-field">
          <span>Email</span>
          <input className="auth-input" type="email" autoComplete="email" inputMode="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
        </label>
        <AnimatePresence initial={false}>
          {mode === 'password' && (
            <motion.label key="pw" className="auth-field" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              <span>Password</span>
              <div style={{ position: 'relative' }}>
                <input className="auth-input" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} style={{ paddingRight: 44 }} />
                <button type="button" className="auth-eye" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </motion.label>
          )}
        </AnimatePresence>

        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

        <motion.button type="submit" className="btn btn-block btn-marigold" disabled={busy} whileTap={{ scale: 0.97 }}>
          {busy ? 'One moment…' : mode === 'password' ? 'Sign in' : mode === 'link' ? 'Email me a link' : 'Send reset link'}
        </motion.button>
      </form>

      <div className="auth-links">
        {mode === 'password' ? (
          <>
            <button type="button" className="auth-link" onClick={() => { setMode('link'); setMsg(null); }}><Mail size={14} /> Email me a link instead</button>
            <button type="button" className="auth-link" onClick={() => { setMode('forgot'); setMsg(null); }}><KeyRound size={14} /> Forgot password?</button>
          </>
        ) : (
          <button type="button" className="auth-link" onClick={() => { setMode('password'); setMsg(null); }}><ArrowLeft size={14} /> Back to password sign-in</button>
        )}
      </div>

      <p className="auth-foot">
        Accounts are invite-only. Ask the person who runs this app to add you.
        <br />
        <a className="auth-link" href="/?demo=1"><FlaskConical size={14} /> Look around with demo data</a>
      </p>
    </Shell>
  );
}

export function SetPasswordScreen() {
  const { user, signOut, passwordUpdated } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const firstTime = !!user?.user_metadata?.must_change_password;
  const strong = pw.length >= 8;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!strong) return setErr('Use at least 8 characters.');
    if (pw !== pw2) return setErr('The two passwords don’t match.');
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.updateUser({ password: pw, data: { must_change_password: false } });
    setBusy(false);
    if (error) return setErr(friendly(error.message));
    passwordUpdated();
  };

  return (
    <Shell>
      <Brand
        title={firstTime ? 'Choose your password' : 'Set a new password'}
        sub={firstTime ? `Welcome${user?.user_metadata?.display_name ? `, ${user.user_metadata.display_name}` : ''}! Replace the temporary password with one only you know.` : 'Pick something you don’t use anywhere else.'}
      />
      <form className="form-stack" onSubmit={submit}>
        <label className="auth-field">
          <span>New password</span>
          <input className="auth-input" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} required />
        </label>
        <div className="auth-meter" aria-hidden="true">
          <motion.div animate={{ width: `${Math.min(100, (pw.length / 14) * 100)}%`, backgroundColor: strong ? '#4ade80' : '#f59e0b' }} />
        </div>
        <label className="auth-field">
          <span>Type it again</span>
          <input className="auth-input" type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} required />
        </label>
        {err && <Notice tone="err">{err}</Notice>}
        <motion.button type="submit" className="btn btn-block btn-marigold" disabled={busy} whileTap={{ scale: 0.97 }}>
          {busy ? 'Saving…' : 'Save password'}
        </motion.button>
      </form>
      <div className="auth-links">
        <button type="button" className="auth-link" onClick={signOut}><LogOut size={14} /> Sign out</button>
      </div>
    </Shell>
  );
}

export function StatusScreen({ kind }: { kind: 'disabled' | 'needs-setup' | 'not-configured' }) {
  const { signOut, user } = useAuth();
  const copy = {
    disabled: {
      icon: <PauseCircle size={28} />,
      title: 'Your account is paused',
      body: 'The admin has paused this account, so nothing can be viewed or added right now. Ask them to turn it back on.',
    },
    'needs-setup': {
      icon: <Database size={28} />,
      title: 'Almost there',
      body: 'You’re signed in, but the database isn’t set up yet. The admin needs to run supabase/schema.sql in the Supabase SQL editor (see docs/ACCOUNTS.md).',
    },
    'not-configured': {
      icon: <Database size={28} />,
      title: 'Not connected yet',
      body: 'This build has no Supabase settings. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your Cloudflare Pages variables and redeploy.',
    },
  }[kind];
  return (
    <Shell>
      <div style={{ textAlign: 'center' }}>
        <div className="auth-logo" style={{ color: 'var(--marigold)' }}>{copy.icon}</div>
        <h1 style={{ fontSize: '1.4rem', marginTop: 14 }}>{copy.title}</h1>
        <p style={{ color: 'var(--hero-ink-2)', marginTop: 8, fontWeight: 600, lineHeight: 1.5, fontSize: '0.9rem' }}>{copy.body}</p>
      </div>
      <div className="auth-links" style={{ marginTop: 22 }}>
        {user && <button type="button" className="auth-link" onClick={signOut}><LogOut size={14} /> Sign out {user.email}</button>}
        {kind === 'not-configured' && <a className="auth-link" href="/?demo=1"><FlaskConical size={14} /> Try the demo instead</a>}
      </div>
    </Shell>
  );
}

export function Splash() {
  return (
    <div className="auth" aria-busy="true" aria-label="Loading">
      <motion.div animate={{ scale: [1, 1.08, 1], opacity: [0.8, 1, 0.8] }} transition={{ duration: 1.4, repeat: Infinity }}>
        <Logo size={54} />
      </motion.div>
    </div>
  );
}

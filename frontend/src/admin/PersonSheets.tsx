import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Copy, Check, KeyRound, Mail, Unlink, Trash2, Share2, UserPlus } from 'lucide-react';
import { adminCall, type AdminUser } from '../lib/adminApi';
import { avatarColor } from '../lib/splits';
import { initials } from '../lib/format';
import { useFeedback } from '../components/ui/Feedback';
import { Field, Segmented, Sheet, Switch } from '../components/ui/primitives';

export type Credentials = { name: string; email: string; password?: string; invited?: boolean; reset?: boolean };

export function Avatar({ user, size = 36 }: { user: Pick<AdminUser, 'id' | 'displayName' | 'email'>; size?: number }) {
  return (
    <div className="avatar" style={{ width: size, height: size, background: avatarColor(user.id), fontSize: size * 0.36 }}>
      {initials(user.displayName || user.email)}
    </div>
  );
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const { toast } = useFeedback();
  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied(c => (c === id ? null : c)), 1500);
    } catch {
      toast({ message: 'Copy blocked — select the text and copy it manually.' });
    }
  };
  return { copied, copy };
}

/** "Send this to Rahul" card shown after creating someone or resetting their password. */
export function CredentialsCard({ creds }: { creds: Credentials }) {
  const { copied, copy } = useCopy();
  const url = location.origin;
  const first = creds.name.split(' ')[0];
  const message = creds.invited
    ? `Hi ${first}! I've invited you to Budget Splitter. Check ${creds.email} for the invite email, then open ${url} and add it to your home screen.`
    : creds.reset
      ? `Hi ${first}, here's a temporary password for Budget Splitter: ${creds.password}\nSign in at ${url} with ${creds.email}. You'll be asked to choose a new one.`
      : `Hi ${first}! Your Budget Splitter account is ready.\nOpen: ${url}\nEmail: ${creds.email}\nTemporary password: ${creds.password}\nYou'll choose your own password when you first sign in, then add the app to your home screen (Settings → Use on your phone).`;
  const canShare = typeof navigator.share === 'function';

  const Line = ({ k, v, id }: { k: string; v: string; id: string }) => (
    <div className="cred-line">
      <span className="faint">{k}</span>
      <code>{v}</code>
      <button type="button" onClick={() => copy(id, v)} aria-label={`Copy ${k}`}>{copied === id ? <Check size={14} color="var(--jade)" /> : <Copy size={14} />}</button>
    </div>
  );

  return (
    <motion.div className="cred" initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>
        {creds.invited ? `Invite emailed to ${creds.email}` : creds.reset ? `New temporary password for ${first}` : `${first}’s account is ready`}
      </div>
      {!creds.invited && (
        <>
          <Line k="App" v={url} id="url" />
          <Line k="Email" v={creds.email} id="email" />
          {creds.password && <Line k="Password" v={creds.password} id="pw" />}
          <p className="faint" style={{ fontSize: '0.75rem', fontWeight: 600, margin: '8px 0 0' }}>
            Shown once. They’ll be asked to pick their own password when they sign in.
          </p>
        </>
      )}
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <motion.button type="button" className="btn btn-sm btn-primary grow" whileTap={{ scale: 0.96 }} onClick={() => copy('msg', message)}>
          {copied === 'msg' ? <Check size={14} /> : <Copy size={14} />} {copied === 'msg' ? 'Copied' : 'Copy message'}
        </motion.button>
        {canShare && (
          <motion.button type="button" className="btn btn-sm btn-ghost" whileTap={{ scale: 0.96 }} onClick={() => navigator.share({ text: message }).catch(() => {})}>
            <Share2 size={14} /> Share
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

// ── Add a person ─────────────────────────────────────────────
function AddBody({ onCreated }: { onCreated: (u: AdminUser) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [mode, setMode] = useState<'password' | 'invite'>('password');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [creds, setCreds] = useState<Credentials | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await adminCall<{ user: AdminUser; tempPassword?: string; invited?: boolean }>('create', { email, displayName: name, role, mode });
      onCreated(r.user);
      setCreds({ name: r.user.displayName, email: r.user.email, password: r.tempPassword, invited: r.invited });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (creds) return <CredentialsCard creds={creds} />;

  return (
    <form className="form-stack" onSubmit={e => { e.preventDefault(); submit(); }}>
      <div className="form-grid">
        <Field label="Name">
          <input className="input" placeholder="Rahul" value={name} onChange={e => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Email">
          <input className="input" type="email" inputMode="email" placeholder="rahul@gmail.com" value={email} onChange={e => setEmail(e.target.value)} required />
        </Field>
      </div>
      <div className="field">
        <span className="field-label">Role</span>
        <Segmented id="add-role" value={role} onChange={setRole} options={[{ value: 'member', label: 'Member' }, { value: 'admin', label: 'Admin' }]} />
      </div>
      <div className="field">
        <span className="field-label">How will they sign in?</span>
        <Segmented id="add-mode" value={mode} onChange={setMode} options={[{ value: 'password', label: 'Temporary password' }, { value: 'invite', label: 'Email invite' }]} />
        <span className="faint" style={{ fontSize: '0.76rem', fontWeight: 600, lineHeight: 1.45 }}>
          {mode === 'password'
            ? 'We create a password you send them (WhatsApp, SMS). Works without any email setup.'
            : 'Supabase emails them a link. Its built-in mail service only sends a few emails per hour.'}
        </span>
      </div>
      {err && <p className="badge bad" style={{ whiteSpace: 'normal', padding: '8px 10px' }}>{err}</p>}
      <motion.button type="submit" className="btn btn-primary btn-block" disabled={busy || !email.trim()} whileTap={{ scale: 0.97 }}>
        <UserPlus size={16} /> {busy ? 'Creating…' : mode === 'invite' ? 'Send invite' : 'Create account'}
      </motion.button>
    </form>
  );
}

export function AddPersonSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (u: AdminUser) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Add a person">
      <AddBody onCreated={onCreated} />
    </Sheet>
  );
}

// ── Manage a person ──────────────────────────────────────────
function Section({ title, children, danger }: { title: string; children: ReactNode; danger?: boolean }) {
  return (
    <section className="card" style={{ padding: 14, borderColor: danger ? 'color-mix(in srgb, var(--rose) 35%, transparent)' : undefined }}>
      <div className="field-label" style={{ marginBottom: 10, color: danger ? 'var(--rose)' : undefined }}>{title}</div>
      {children}
    </section>
  );
}

function ManageBody({ user, isYou, onChanged, onDeleted }: {
  user: AdminUser; isYou: boolean; onChanged: (u: AdminUser) => void; onDeleted: (id: string) => void;
}) {
  const { toast } = useFeedback();
  const [name, setName] = useState(user.displayName);
  const [role, setRole] = useState(user.role);
  const [active, setActive] = useState(!user.disabled);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [confirm, setConfirm] = useState('');
  const dirty = name.trim() !== user.displayName || role !== user.role || active === user.disabled;

  const run = async <T,>(label: string, fn: () => Promise<T>) => {
    setBusy(label);
    setErr(null);
    try { return await fn(); } catch (e) { setErr((e as Error).message); return undefined; } finally { setBusy(null); }
  };

  const save = () => run('save', async () => {
    const r = await adminCall<{ user: AdminUser }>('update', { id: user.id, displayName: name, role, disabled: !active });
    onChanged(r.user);
    toast({ message: `Saved ${r.user.displayName}` });
  });

  return (
    <div className="form-stack">
      <div className="row" style={{ gap: 12 }}>
        <Avatar user={user} size={48} />
        <div className="grow">
          <div style={{ fontWeight: 800 }} className="ellipsis">{user.displayName}{isYou && <span className="badge neutral" style={{ marginLeft: 6 }}>You</span>}</div>
          <div className="faint ellipsis" style={{ fontSize: '0.8rem', fontWeight: 600 }}>{user.email}</div>
        </div>
      </div>

      {err && <p className="badge bad" style={{ whiteSpace: 'normal', padding: '8px 10px' }}>{err}</p>}

      <Section title="Profile">
        <div className="form-stack">
          <Field label="Name"><input className="input" value={name} onChange={e => setName(e.target.value)} /></Field>
          <div className="field">
            <span className="field-label">Role</span>
            <Segmented id={`role-${user.id}`} value={role} onChange={setRole} options={[{ value: 'member', label: 'Member' }, { value: 'admin', label: 'Admin' }]} />
          </div>
          <div className="row">
            <div className="grow">
              <div style={{ fontWeight: 800, fontSize: '0.88rem' }}>Account active</div>
              <div className="faint" style={{ fontSize: '0.76rem', fontWeight: 600 }}>{active ? 'Can sign in and log SMS' : 'Paused: can’t sign in, SMS are refused, data kept'}</div>
            </div>
            <Switch checked={active} onChange={setActive} label="Account active" />
          </div>
          {isYou && <p className="faint" style={{ fontSize: '0.76rem', fontWeight: 600 }}>You can’t remove your own admin role or pause yourself.</p>}
          <motion.button type="button" className="btn btn-primary btn-block" disabled={!dirty || !!busy} whileTap={{ scale: 0.97 }} onClick={save}>
            {busy === 'save' ? 'Saving…' : dirty ? 'Save changes' : 'No changes'}
          </motion.button>
        </div>
      </Section>

      <Section title="Sign-in">
        <AnimatePresence>{creds && <CredentialsCard creds={creds} />}</AnimatePresence>
        <div className="row" style={{ gap: 8, marginTop: creds ? 12 : 0, flexWrap: 'wrap' }}>
          <motion.button type="button" className="btn btn-sm btn-ghost grow" disabled={!!busy} whileTap={{ scale: 0.96 }}
            onClick={() => run('pw', async () => {
              const r = await adminCall<{ tempPassword: string }>('resetPassword', { id: user.id });
              setCreds({ name: user.displayName, email: user.email, password: r.tempPassword, reset: true });
            })}>
            <KeyRound size={14} /> {busy === 'pw' ? 'Working…' : 'New temporary password'}
          </motion.button>
          <motion.button type="button" className="btn btn-sm btn-ghost grow" disabled={!!busy} whileTap={{ scale: 0.96 }}
            onClick={() => run('mail', async () => {
              await adminCall('resetPassword', { id: user.id, mode: 'email' });
              toast({ message: `Reset link emailed to ${user.email}` });
            })}>
            <Mail size={14} /> {busy === 'mail' ? 'Sending…' : 'Email reset link'}
          </motion.button>
        </div>
      </Section>

      <Section title="Phone">
        {user.smsLinkedAt ? (
          <div className="row">
            <div className="grow faint" style={{ fontSize: '0.82rem', fontWeight: 600 }}>
              SMS key linked {new Date(user.smsLinkedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}. Unlink it if their phone was lost or the key leaked.
            </div>
            <motion.button type="button" className="btn btn-sm btn-ghost" disabled={!!busy} whileTap={{ scale: 0.96 }}
              onClick={() => run('unlink', async () => {
                await adminCall('revokeSmsKey', { id: user.id });
                onChanged({ ...user, smsLinkedAt: null });
                toast({ message: `${user.displayName}’s phone unlinked` });
              })}>
              <Unlink size={14} /> Unlink
            </motion.button>
          </div>
        ) : (
          <p className="faint" style={{ fontSize: '0.82rem', fontWeight: 600 }}>No phone linked. They create their own key in Settings → Use on your phone.</p>
        )}
      </Section>

      {!isYou && (
        <Section title="Delete account" danger>
          <p className="faint" style={{ fontSize: '0.8rem', fontWeight: 600, lineHeight: 1.5, marginBottom: 10 }}>
            Permanently deletes {user.displayName}’s sign-in and <b>all of their data</b> ({user.txCount} transactions, accounts, budgets, splits). This can’t be undone. To keep their data, pause the account instead.
          </p>
          <Field label={`Type ${user.email} to confirm`}>
            <input className="input" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="off" />
          </Field>
          <motion.button type="button" className="btn btn-danger btn-block" style={{ marginTop: 10 }}
            disabled={confirm.trim().toLowerCase() !== user.email.toLowerCase() || !!busy} whileTap={{ scale: 0.97 }}
            onClick={() => run('delete', async () => {
              await adminCall('delete', { id: user.id, confirmEmail: confirm });
              onDeleted(user.id);
              toast({ message: `Deleted ${user.displayName}` });
            })}>
            <Trash2 size={15} /> {busy === 'delete' ? 'Deleting…' : 'Delete permanently'}
          </motion.button>
        </Section>
      )}
    </div>
  );
}

export function ManagePersonSheet({ user, isYou, onClose, onChanged, onDeleted }: {
  user: AdminUser | null; isYou: boolean; onClose: () => void; onChanged: (u: AdminUser) => void; onDeleted: (id: string) => void;
}) {
  return (
    <Sheet open={!!user} onClose={onClose} title="Manage account">
      {user && <ManageBody key={user.id} user={user} isYou={isYou} onChanged={onChanged} onDeleted={id => { onDeleted(id); onClose(); }} />}
    </Sheet>
  );
}

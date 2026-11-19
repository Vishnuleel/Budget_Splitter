import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../supabaseClient';
import { isDemoMode } from './demo';
import { setSettingsUser } from './settings';

export type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: 'admin' | 'member';
  disabled: boolean;
  sms_token_created_at: string | null;
};

export type AuthStatus =
  | 'loading'
  | 'not-configured' // no Supabase env vars in this build
  | 'signed-out'
  | 'set-password' // first sign-in with a temporary password, or a reset link
  | 'disabled' // paused by the admin
  | 'needs-setup' // database schema not installed yet
  | 'ready';

type Ctx = {
  status: AuthStatus;
  demo: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  passwordUpdated: () => void;
};

const AuthContext = createContext<Ctx | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

const DEMO = isDemoMode();
const DEMO_PROFILE: Profile = {
  id: 'demo-you', email: 'you@example.com', display_name: 'You', role: 'admin', disabled: false,
  sms_token_created_at: null,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(DEMO ? 'ready' : isSupabaseConfigured ? 'loading' : 'not-configured');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(DEMO ? DEMO_PROFILE : null);
  const recovery = useRef(false);
  const loadedFor = useRef<string | null>(null);

  const decide = useCallback(async (s: Session | null, force = false) => {
    setSession(s);
    if (!s) {
      loadedFor.current = null;
      setProfile(null);
      setSettingsUser(null);
      setStatus('signed-out');
      return;
    }
    if (!force && loadedFor.current === s.user.id) return; // token refresh etc.
    loadedFor.current = s.user.id;
    setSettingsUser(s.user.id);

    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, display_name, role, disabled, sms_token_created_at')
      .eq('id', s.user.id)
      .maybeSingle();

    if (error) {
      // Usually the profiles table is missing (schema.sql not run yet) → explain instead of failing silently.
      console.error('Could not load profile', error);
      setStatus('needs-setup');
      return;
    }
    if (!data) { setStatus('needs-setup'); return; }
    setProfile(data as Profile);
    if (data.disabled) { setStatus('disabled'); return; }
    if (recovery.current || s.user.user_metadata?.must_change_password) { setStatus('set-password'); return; }
    setStatus('ready');
  }, []);

  useEffect(() => {
    if (DEMO || !isSupabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => decide(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') recovery.current = true;
      // supabase-js warns against awaiting other calls inside this callback — defer.
      window.setTimeout(() => decide(s, event === 'PASSWORD_RECOVERY' || event === 'USER_UPDATED'), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [decide]);

  const signOut = useCallback(async () => {
    if (DEMO) return;
    try { sessionStorage.removeItem(`bs:unlocked:${loadedFor.current}`); } catch { /* ignore */ }
    await supabase.auth.signOut();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (DEMO) return;
    const { data } = await supabase.auth.getSession();
    await decide(data.session, true);
  }, [decide]);

  const passwordUpdated = useCallback(() => {
    recovery.current = false;
    refreshProfile();
  }, [refreshProfile]);

  const value = useMemo<Ctx>(() => ({
    status,
    demo: DEMO,
    session,
    user: session?.user ?? null,
    profile,
    isAdmin: profile?.role === 'admin' && !profile.disabled,
    signOut,
    refreshProfile,
    passwordUpdated,
  }), [status, session, profile, signOut, refreshProfile, passwordUpdated]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** The user id rows belong to ('demo-you' in demo mode). */
export function useUserId() {
  const { user, profile } = useAuth();
  return user?.id ?? profile?.id ?? null;
}

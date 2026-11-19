import { useSyncExternalStore } from 'react';

/** Tiny pushState router: the app lives at "/", the admin portal at "/admin". */
const listeners = new Set<() => void>();
window.addEventListener('popstate', () => listeners.forEach(l => l()));

export function navigate(path: string) {
  const url = new URL(location.href);
  url.pathname = path;
  url.searchParams.delete('action');
  history.pushState(null, '', url.toString());
  listeners.forEach(l => l());
  window.scrollTo({ top: 0 });
}

export function usePath() {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => location.pathname);
}

export const isAdminPath = (p: string) => p === '/admin' || p.startsWith('/admin/');

import { createContext, useContext } from 'react';
import type { TabType } from '../lib/types';

export type SheetState =
  | { kind: 'add'; mode: 'expense' | 'income' }
  | { kind: 'sms' }
  | { kind: 'splits'; prefill?: { title: string; amount: number } }
  | { kind: 'settings' }
  | { kind: 'budgets' }
  | { kind: 'phone' }
  | { kind: 'bill'; prefill?: { store?: string; total?: number; currency?: string } }
  | { kind: 'tx'; id: number }
  | { kind: 'shared'; id: string }
  | null;

export type ActivityFilter = 'all' | 'review' | 'expense' | 'income' | string;

export type UICtx = {
  tab: TabType;
  setTab: (t: TabType) => void;
  sheet: SheetState;
  openSheet: (s: Exclude<SheetState, null>) => void;
  closeSheet: () => void;
  activityFilter: ActivityFilter;
  setActivityFilter: (f: ActivityFilter) => void;
  lock: () => void;
};

export const UIContext = createContext<UICtx | null>(null);

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI outside provider');
  return ctx;
}

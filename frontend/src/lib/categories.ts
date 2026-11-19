import {
  UtensilsCrossed, ShoppingBasket, Wrench, Shirt, Bus, Sparkles, Dumbbell, GraduationCap,
  Clapperboard, ArrowDownLeft, PiggyBank, CircleHelp, House, Zap, ArrowLeftRight, BadgePercent,
  type LucideIcon,
} from 'lucide-react';
import type { Transaction } from './types';
import { EXPENSE_CATEGORIES } from '../../shared/sms.js';

export const CATEGORIES = EXPENSE_CATEGORIES;

type Meta = { icon: LucideIcon; color: string; short: string };

export const CATEGORY_META: Record<string, Meta> = {
  'Food & Dining': { icon: UtensilsCrossed, color: '#e0702b', short: 'Food' },
  Groceries: { icon: ShoppingBasket, color: '#4c9a2a', short: 'Groceries' },
  Housing: { icon: House, color: '#8b5e34', short: 'Housing' },
  'Bills & utilities': { icon: Zap, color: '#0891b2', short: 'Bills' },
  Transport: { icon: Bus, color: '#2f6fd6', short: 'Transport' },
  Clothing: { icon: Shirt, color: '#c2417f', short: 'Clothing' },
  'Appliances or tools': { icon: Wrench, color: '#64748b', short: 'Home & tech' },
  Personal: { icon: Sparkles, color: '#8e5cd9', short: 'Personal' },
  Sports: { icon: Dumbbell, color: '#0f9d9a', short: 'Sports' },
  'Education/Stationery': { icon: GraduationCap, color: '#b7791f', short: 'Education' },
  Entertainment: { icon: Clapperboard, color: '#e0475b', short: 'Fun' },
  Transfers: { icon: ArrowLeftRight, color: '#475569', short: 'Transfers' },
  'Bank fees': { icon: BadgePercent, color: '#9f1239', short: 'Bank fees' },
  Income: { icon: ArrowDownLeft, color: '#0b8457', short: 'Income' },
  Savings: { icon: PiggyBank, color: '#d4900f', short: 'Savings' },
  Uncategorized: { icon: CircleHelp, color: '#8a948f', short: 'Other' },
};

export const SUGGESTED_PREFIX = 'Suggested: ';

export function suggestionOf(category: string) {
  return category.startsWith(SUGGESTED_PREFIX) ? category.slice(SUGGESTED_PREFIX.length) : null;
}

export function needsReview(tx: Transaction) {
  return tx.category === 'Uncategorized' || tx.category.startsWith(SUGGESTED_PREFIX);
}

/** The category used for charts/budgets (a pending suggestion counts as its suggested category). */
export function effectiveCategory(tx: Transaction) {
  return suggestionOf(tx.category) ?? tx.category;
}

export function categoryMeta(category: string): Meta {
  return CATEGORY_META[suggestionOf(category) ?? category] ?? CATEGORY_META.Uncategorized;
}

export const isIncome = (tx: Transaction) => tx.category === 'Income';
export const isExpense = (tx: Transaction) => tx.category !== 'Income' && tx.category !== 'Savings';

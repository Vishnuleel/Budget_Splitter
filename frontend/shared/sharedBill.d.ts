import type { BillItem, BillExtra, splitBill } from './billSplit.js';

export type SharedBillDoc = {
  title: string; store?: string | null; date?: string; currency: string; payer: string;
  people: { id: string; name: string }[]; items: BillItem[]; extras: BillExtra[];
};
export type MemberStatus = 'pending' | 'change_requested' | 'accepted' | 'declined';
export type Member = {
  user_id: string; status: MemberStatus; removed: string[]; note: string | null; reply: string | null;
  paid: 'none' | 'claimed' | 'confirmed'; ack_total: number | null;
};
export type SharedBillRow = { id: string; owner: string; bill: SharedBillDoc; members: Member[]; version: number; created_at: string };
export type Todo =
  | { kind: 'review' | 'approve' | 'confirm'; bill: SharedBillRow; member: Member }
  | { kind: 'changed'; bill: SharedBillRow; member: Member; from: number; to: number };
export type Action = 'accept' | 'decline' | 'request_change' | 'approve_change' | 'keep' | 'ack' | 'claim_paid' | 'confirm_paid';

export declare function personKey(userId: string): string;
export declare function computeShares(bill: SharedBillDoc): ReturnType<typeof splitBill>;
export declare function shareOf(bill: SharedBillDoc, key: string): number;
export declare function applyRemoval(bill: SharedBillDoc, key: string, itemIds: string[]): SharedBillDoc;
export declare function changePreview(bill: SharedBillDoc, key: string, itemIds: string[]): { id: string; name: string; before: number; after: number; delta: number }[];
export declare function counts(m: Member): boolean;
export declare function sharedBalances(rows: SharedBillRow[], me: string, convert?: (n: number, currency: string) => number): Map<string, number>;
export declare function todo(rows: SharedBillRow[], me: string): Todo[];
export declare function transition(row: SharedBillRow, actor: string, action: Action, args?: Record<string, unknown>): { bill: SharedBillDoc; members: Member[] };

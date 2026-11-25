import type { BillItem, BillExtra } from './billSplit.js';
export type ShareBill = { title: string; currency: string; payer: string; people: { id: string; name: string }[]; items: BillItem[]; extras: BillExtra[] };
export type Claims = Record<string, { itemIds: string[]; at?: string; keyHash?: string }>;
export declare function applyClaims(items: BillItem[], claims: Claims): BillItem[];
export declare function sanitizeBill(b: unknown): ShareBill;
export declare function createBillShareHandler(deps: object): (req: object, res: object) => Promise<unknown>;
export declare function makeMemoryShareDeps(opts?: { users?: Record<string, { id: string; disabled?: boolean }>; persist?: Storage }): object;

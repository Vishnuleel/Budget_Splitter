import type { BillExtra } from './billSplit.js';
export type ParsedReceipt = { store: string | null; currency: string; items: { id: string; name: string; qty: number; price: number; pant?: number }[]; extras: BillExtra[]; total: number | null };
export declare function parseReceiptText(text: string): ParsedReceipt;
export declare function normalizeReceipt(raw: unknown): ParsedReceipt;
export declare const SAMPLE_RECEIPT: string;
export declare function mergeReceipts(receipts: ParsedReceipt[]): ParsedReceipt;

export type BillItem = { id: string; name: string; price: number; among: string[]; shares?: Record<string, number>; qty?: number; pant?: number };
export type BillExtra = { name: string; amount: number; kind: 'discount' | 'fee' };
export type PersonShare = { items: { id: string; name: string; cents: number; amount: number; of: number; sharedWith: number }[]; subtotal: number; extras: number; total: number };
export declare function allocate(cents: number, weights: Record<string, number>, prefer?: string): Record<string, number>;
export declare function splitBill(items: BillItem[], extras: BillExtra[], people: string[], payer: string): { per: Record<string, PersonShare>; total: number; unassigned: string[] };
export declare function owedToPayer(result: ReturnType<typeof splitBill>, payer: string): Record<string, number>;

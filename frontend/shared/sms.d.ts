export declare const EXPENSE_CATEGORIES: string[];

export type ParsedSms = {
  amount: number;
  currency: string;
  merchant: string;
  category: string;
  isIncome: boolean;
  kind: 'card' | 'transfer' | 'fee' | 'upi' | 'other';
};

export declare function findAmounts(text: string): { index: number; currency: string; amount: number }[];
export declare function tidyMerchant(raw: string): string;
export declare function hintCategory(merchant: string): string | null;
export declare function parseSms(text: string): ParsedSms;

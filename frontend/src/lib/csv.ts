import type { Transaction } from './types';
import { dayKey } from './format';

const cell = (v: string | number) => {
  const s = String(v ?? '');
  // Quote everything, double inner quotes, and neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export function exportCsv(transactions: Transaction[]) {
  if (!transactions.length) return;
  const rows = [
    ['Date', 'Time', 'Merchant', 'Category', 'Amount', 'Type'],
    ...transactions.map(t => {
      const d = new Date(t.date);
      return [
        dayKey(d),
        d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        t.merchant,
        t.category,
        Number(t.amount).toFixed(2),
        t.category === 'Income' ? 'Income' : t.category === 'Savings' ? 'Savings' : 'Expense',
      ];
    }),
  ];
  const csv = '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `BudgetSplitter_${dayKey(new Date())}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

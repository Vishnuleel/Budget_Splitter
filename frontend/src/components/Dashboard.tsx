import React, { useState, useEffect } from 'react';
import type { Transaction } from '../App';
import { supabase } from '../supabaseClient';

interface DashboardProps {
  transactions: Transaction[];
}

const Dashboard: React.FC<DashboardProps> = ({ transactions }) => {
  const [totalAccountsBalance, setTotalAccountsBalance] = useState(0);
  const [totalDeposits, setTotalDeposits] = useState(0);
  const [totalDebts, setTotalDebts] = useState(0);

  useEffect(() => {
    const fetchWealth = async () => {
      const [accountsRes, depositsRes, debtsRes] = await Promise.all([
        supabase.from('accounts').select('balance'),
        supabase.from('deposits').select('amount'),
        supabase.from('debts').select('amount')
      ]);
      
      let sumAccounts = 0;
      if (accountsRes.data) {
        sumAccounts = accountsRes.data.reduce((acc, curr) => acc + (Number(curr.balance) || 0), 0);
      }
      setTotalAccountsBalance(sumAccounts);

      let sumDeposits = 0;
      if (depositsRes.data) {
        sumDeposits = depositsRes.data.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
      }
      setTotalDeposits(sumDeposits);

      let sumDebts = 0;
      if (debtsRes.data) {
        sumDebts = debtsRes.data.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
      }
      setTotalDebts(sumDebts);
    };
    fetchWealth();
  }, []);

  const expenseCategories = transactions.filter(t => t.category !== 'Income' && t.category !== 'Savings');
  const thisMonthExpenses = expenseCategories.filter(t => new Date(t.date).getMonth() === new Date().getMonth())
    .reduce((sum, t) => sum + t.amount, 0);

  // Total Net Worth = Sum of all Wallet Balances + Sum of Fixed Deposits - Sum of Debts
  const netWorth = totalAccountsBalance + totalDeposits - totalDebts;

  return (
    <div className="glass-panel" style={{ 
      position: 'relative', 
      padding: '32px 24px', 
      marginBottom: '24px', 
      overflow: 'hidden',
      borderTop: '2px solid var(--primary)'
    }}>
      {/* Glossy gradient orb */}
      <div style={{
        position: 'absolute',
        top: '-50px',
        right: '-50px',
        width: '150px',
        height: '150px',
        background: 'radial-gradient(circle, var(--primary-glow) 0%, transparent 70%)',
        borderRadius: '50%',
        pointerEvents: 'none'
      }} />

      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '8px', letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 600 }}>Total Net Worth</p>
      
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <h1 className="serif" style={{ fontSize: '2.5rem', color: 'var(--text-main)', fontWeight: '700', margin: 0 }}>
          <span style={{ color: 'var(--primary)', marginRight: '4px' }}>₹</span>
          {netWorth.toLocaleString()}
        </h1>
      </div>

      <div style={{ display: 'flex', gap: '24px', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--glass-border)' }}>
        <div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 500 }}>Monthly Spend</p>
          <p style={{ color: 'var(--text-main)', fontWeight: '600', fontSize: '1.1rem' }}>₹{thisMonthExpenses.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

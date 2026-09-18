import React from 'react';
import type { Transaction } from '../App';
import Dashboard from '../components/Dashboard';

interface HomePageProps {
  transactions: Transaction[];
  onNavigate: (tab: 'home' | 'expenses' | 'savings') => void;
}

const HomePage: React.FC<HomePageProps> = ({ transactions, onNavigate }) => {
  const recentTransactions = transactions.slice(0, 3);
  
  // Calculate current month's expenses
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  const monthlyExpenses = transactions
    .filter(t => {
      const d = new Date(t.date);
      return t.category !== 'Income' && t.category !== 'Savings' && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    })
    .reduce((sum, t) => sum + t.amount, 0);

  const budget = 40000;
  const budgetSpentPercent = Math.min(100, (monthlyExpenses / budget) * 100);
  const isOverBudget = monthlyExpenses > budget;

  return (
    <div className="animate-slide-down">
      <Dashboard transactions={transactions} />

      {/* Budget Health Ring */}
      <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '16px' }}>
        <div style={{ position: 'relative', width: '80px', height: '80px' }}>
          <svg width="80" height="80" viewBox="0 0 100 100">
            {/* Background ring */}
            <circle cx="50" cy="50" r="40" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
            {/* Progress ring */}
            <circle 
              cx="50" cy="50" r="40" 
              fill="transparent" 
              stroke={isOverBudget ? 'var(--expense)' : 'url(#goldGradientHealth)'} 
              strokeWidth="8"
              strokeDasharray="251.2"
              strokeDashoffset={251.2 - (251.2 * budgetSpentPercent) / 100}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 1s ease-out', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
            />
            <defs>
              <linearGradient id="goldGradientHealth" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#d4af37" />
                <stop offset="100%" stopColor="#f3e5ab" />
              </linearGradient>
            </defs>
          </svg>
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1rem', color: '#f8fafc' }}>
            {Math.round(budgetSpentPercent)}%
          </div>
        </div>
        <div>
          <h3 className="serif" style={{ fontSize: '1.2rem', color: '#f8f9fa', marginBottom: '4px' }}>Monthly Budget</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            ₹{monthlyExpenses.toLocaleString()} / ₹{budget.toLocaleString()}
          </p>
          {isOverBudget && <p style={{ fontSize: '0.75rem', color: 'var(--expense)', marginTop: '4px' }}>Over budget!</p>}
        </div>
      </div>

      {/* Quick Actions Placeholder */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '32px' }}>
        <button style={{ flex: 1, background: 'rgba(212, 175, 55, 0.1)', border: '1px solid rgba(212, 175, 55, 0.3)', padding: '16px', borderRadius: '16px', color: '#d4af37' }}>+ Income</button>
        <button style={{ flex: 1, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '16px', borderRadius: '16px', color: '#ef4444' }}>- Expense</button>
      </div>

      {/* Recent Activity Glimpse */}
      <div className="glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 className="serif" style={{ fontSize: '1.25rem', color: '#f8f9fa' }}>Recent Activity</h2>
          <button 
            onClick={() => onNavigate('expenses')}
            style={{ background: 'transparent', color: 'var(--primary)', border: 'none', padding: 0, fontSize: '0.9rem' }}
          >
            View All
          </button>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {recentTransactions.map(tx => (
            <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '12px' }}>
              <div>
                <div style={{ fontWeight: 600, color: '#f8fafc' }}>{tx.merchant}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{tx.category}</div>
              </div>
              <div style={{ color: tx.category === 'Income' ? 'var(--income)' : '#f8fafc', fontWeight: 600 }}>
                {tx.category === 'Income' ? '+' : '-'}₹{tx.amount}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HomePage;

import React, { useEffect, useState } from 'react';
import { Trash2, Edit2, Check, X } from 'lucide-react';
import type { Transaction } from '../App';
import { supabase } from '../supabaseClient';
import { CATEGORIES } from '../utils/categoryHelper';

interface TransactionsListProps {
  transactions: Transaction[];
  onRefresh: () => void;
}

const TransactionsList: React.FC<TransactionsListProps> = ({ transactions, onRefresh }) => {
  const [mounted, setMounted] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editMerchant, setEditMerchant] = useState('');
  const [showCategoryDropdownId, setShowCategoryDropdownId] = useState<number | null>(null);

  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'date' | 'amount_high' | 'amount_low'>('date');

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleDelete = async (id: number) => {
    if (window.confirm('Delete this transaction?')) {
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (!error) onRefresh();
    }
  };

  const startEditing = (tx: Transaction) => {
    setEditingId(tx.id);
    setEditAmount(tx.amount.toString());
    setEditMerchant(tx.merchant);
  };

  const saveEdit = async (id: number) => {
    const { error } = await supabase
      .from('transactions')
      .update({ amount: parseFloat(editAmount) || 0, merchant: editMerchant })
      .eq('id', id);
    if (!error) {
      setEditingId(null);
      onRefresh();
    }
  };

  const handleUpdateCategory = async (id: number, category: string) => {
    const { error } = await supabase
      .from('transactions')
      .update({ category })
      .eq('id', id);
    if (!error) {
      setShowCategoryDropdownId(null);
      onRefresh();
    }
  };

  // Apply filters and sorting
  let filteredTransactions = transactions;
  if (filterCategory !== 'All') {
    filteredTransactions = transactions.filter(t => t.category === filterCategory);
  }
  
  if (sortBy === 'amount_high') {
    filteredTransactions = [...filteredTransactions].sort((a, b) => b.amount - a.amount);
  } else if (sortBy === 'amount_low') {
    filteredTransactions = [...filteredTransactions].sort((a, b) => a.amount - b.amount);
  } else {
    // default date sort, assuming already sorted from DB, but we can enforce it
    filteredTransactions = [...filteredTransactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  const handleExportCSV = () => {
    if (transactions.length === 0) return;
    
    // Create CSV header
    const headers = ['Date', 'Merchant', 'Category', 'Amount', 'Type'];
    
    // Convert transactions to CSV rows
    const csvRows = transactions.map(t => {
      const type = t.category === 'Income' ? 'Income' : 'Expense';
      return `"${new Date(t.date).toLocaleDateString()}","${t.merchant}","${t.category}",${t.amount},"${type}"`;
    });
    
    const csvString = [headers.join(','), ...csvRows].join('\n');
    
    // Trigger download
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', `BudgetSplitter_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const allCategories = ['All', ...CATEGORIES];

  return (
    <div className="glass-panel animate-slide-down" style={{ animationDelay: '0.1s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 className="serif" style={{ fontSize: '1.25rem', color: 'var(--text-main)', margin: 0 }}>Transactions</h2>
          <button 
            onClick={handleExportCSV}
            style={{ padding: '4px 8px', fontSize: '0.75rem', background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-muted)', borderRadius: '4px' }}
          >
            Export CSV
          </button>
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <select 
            value={filterCategory} 
            onChange={(e) => setFilterCategory(e.target.value)}
            style={{ background: 'var(--bg-color)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem' }}
          >
            {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value as any)}
            style={{ background: 'var(--bg-color)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem' }}
          >
            <option value="date">Date</option>
            <option value="amount_high">Highest ₹</option>
            <option value="amount_low">Lowest ₹</option>
          </select>
        </div>
      </div>
      
      {filteredTransactions.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 20px', border: '1px dashed var(--glass-border)', borderRadius: '16px' }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px', opacity: 0.8 }}>✨</div>
          <div className="italic">No transactions match your filters.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {filteredTransactions.map((tx, index) => {
            const isIncome = tx.category === 'Income';
            const animationClass = tx.isNew ? 'animate-new-item' : 'animate-slide-down';
            const delay = (mounted && !tx.isNew) ? '0s' : `${index * 0.05}s`;
            const isEditing = editingId === tx.id;
            
            // Smart categorization logic (V4 Gemini AI)
            const needsReview = tx.category.startsWith('Suggested: ') || tx.category === 'Uncategorized';
            const suggestedCategory = tx.category.startsWith('Suggested: ') ? tx.category.replace('Suggested: ', '') : null;
            const isChoosingCategory = showCategoryDropdownId === tx.id;

            return (
              <div 
                key={tx.id} 
                className={`transaction-card ${animationClass}`}
                style={{ 
                  animationDelay: delay, 
                  opacity: mounted ? undefined : 0,
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  gap: '12px',
                  padding: needsReview ? '12px 0 16px' : '16px 0'
                }}
              >
                {/* Review Banner */}
                {needsReview && !isChoosingCategory && (
                  <div style={{ 
                    background: 'var(--primary-glow)', 
                    borderRadius: '8px', 
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    border: '1px solid var(--primary)'
                  }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 500 }}>
                      {suggestedCategory ? (
                        <>Is this <strong>{suggestedCategory}</strong>?</>
                      ) : (
                        <>Category unknown. Select one?</>
                      )}
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {suggestedCategory && (
                        <button 
                          onClick={() => handleUpdateCategory(tx.id, suggestedCategory)}
                          style={{ padding: '4px 12px', fontSize: '0.8rem', background: 'var(--primary)', color: '#fff', borderRadius: '4px' }}
                        >
                          Yes
                        </button>
                      )}
                      <button 
                        onClick={() => setShowCategoryDropdownId(tx.id)}
                        style={{ padding: '4px 12px', fontSize: '0.8rem', background: 'transparent', border: '1px solid var(--primary)', color: 'var(--primary)', borderRadius: '4px' }}
                      >
                        {suggestedCategory ? 'No' : 'Select'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Category Dropdown */}
                {isChoosingCategory && (
                  <div style={{ 
                    background: 'var(--bg-color)', 
                    borderRadius: '8px', 
                    padding: '12px',
                    border: '1px solid var(--glass-border)'
                  }}>
                    <div style={{ marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Select Category:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {CATEGORIES.map(cat => (
                        <button 
                          key={cat}
                          onClick={() => handleUpdateCategory(tx.id, cat)}
                          style={{ padding: '4px 10px', fontSize: '0.75rem', background: 'var(--surface-color)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', borderRadius: '4px' }}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Main Transaction Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', overflow: 'hidden', flex: 1, paddingRight: '12px' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      minWidth: '40px',
                      borderRadius: '12px',
                      background: isIncome ? 'var(--income-bg)' : 'var(--expense-bg)',
                      color: isIncome ? 'var(--income)' : 'var(--expense)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      fontSize: '1.2rem'
                    }}>
                      {isIncome ? '↓' : '↑'}
                    </div>
                    
                    {isEditing ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                        <input 
                          value={editMerchant} 
                          onChange={(e) => setEditMerchant(e.target.value)}
                          style={{ width: '100%', background: 'var(--bg-color)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '4px 8px', borderRadius: '4px' }}
                        />
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden' }}>
                        <span style={{ 
                          fontWeight: 600, 
                          fontSize: '1.05rem', 
                          color: 'var(--text-main)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {tx.merchant}
                        </span>
                        <span style={{ 
                          fontSize: '0.8rem', 
                          color: 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {new Date(tx.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at {new Date(tx.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} • {tx.category}
                        </span>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
                    {isEditing ? (
                      <input 
                        type="number"
                        value={editAmount} 
                        onChange={(e) => setEditAmount(e.target.value)}
                        style={{ width: '80px', background: 'var(--bg-color)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '4px 8px', borderRadius: '4px' }}
                      />
                    ) : (
                      <div style={{ 
                        fontWeight: 700, 
                        fontSize: '1.1rem',
                        color: isIncome ? 'var(--income)' : 'var(--text-main)' 
                      }}>
                        {isIncome ? '+' : '-'}₹{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '8px', opacity: isEditing ? 1 : 0.5 }}>
                      {isEditing ? (
                        <>
                          <button onClick={() => saveEdit(tx.id)} style={{ padding: '6px', background: 'var(--income)', color: '#fff', borderRadius: '4px' }}><Check size={16} /></button>
                          <button onClick={() => setEditingId(null)} style={{ padding: '6px', background: 'rgba(0,0,0,0.05)', color: 'var(--text-main)', borderRadius: '4px' }}><X size={16} /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEditing(tx)} style={{ padding: '6px', background: 'transparent', boxShadow: 'none' }}><Edit2 size={16} color="var(--text-muted)" /></button>
                          <button onClick={() => handleDelete(tx.id)} style={{ padding: '6px', background: 'transparent', boxShadow: 'none' }}><Trash2 size={16} color="var(--expense)" /></button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TransactionsList;

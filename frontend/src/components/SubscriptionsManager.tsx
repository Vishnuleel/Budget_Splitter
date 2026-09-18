import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Plus, X } from 'lucide-react';

const SubscriptionsManager: React.FC = () => {
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [cycle, setCycle] = useState('Monthly');
  const [nextDate, setNextDate] = useState('');

  const fetchSubscriptions = async () => {
    const { data } = await supabase.from('subscriptions').select('*').order('next_due_date', { ascending: true });
    if (data) setSubscriptions(data);
  };

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const handleAdd = async () => {
    if (!name.trim() || !amount) return;
    const { error } = await supabase.from('subscriptions').insert([{
      name,
      amount: parseFloat(amount) || 0,
      cycle,
      next_due_date: nextDate || null
    }]);
    if (!error) {
      setIsAdding(false);
      setName('');
      setAmount('');
      setCycle('Monthly');
      setNextDate('');
      fetchSubscriptions();
    }
  };

  const calculateDaysLeft = (dateStr: string) => {
    if (!dateStr) return null;
    const due = new Date(dateStr);
    const today = new Date();
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="glass-panel" style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 className="serif" style={{ fontSize: '1.25rem', color: 'var(--text-main)', margin: 0 }}>Upcoming Bills & Subscriptions</h2>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          style={{ padding: '6px', background: 'transparent', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {isAdding ? <X size={16} /> : <Plus size={16} />}
        </button>
      </div>

      {isAdding && (
        <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg-color)', border: '1px solid var(--glass-border)', padding: '12px', borderRadius: '8px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input type="text" placeholder="Service (e.g. Netflix)" value={name} onChange={e => setName(e.target.value)} style={{ flex: 1, background: 'var(--surface-color)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '8px', borderRadius: '4px' }} />
            <select value={cycle} onChange={e => setCycle(e.target.value)} style={{ width: '100px', background: 'var(--surface-color)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '8px', borderRadius: '4px' }}>
              <option>Monthly</option>
              <option>Yearly</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input type="number" placeholder="Amount ₹" value={amount} onChange={e => setAmount(e.target.value)} style={{ flex: 1, background: 'var(--surface-color)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '8px', borderRadius: '4px' }} />
            <input type="date" value={nextDate} onChange={e => setNextDate(e.target.value)} style={{ flex: 1, background: 'var(--surface-color)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '8px', borderRadius: '4px' }} />
          </div>
          <button onClick={handleAdd} style={{ background: 'var(--primary)', color: '#fff', padding: '8px', borderRadius: '4px', fontWeight: 600 }}>Save</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px', margin: '0 -20px', padding: '0 20px' }}>
        {subscriptions.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic', padding: '8px 0' }}>No upcoming bills tracked.</div>
        ) : (
          subscriptions.map(sub => {
            const daysLeft = calculateDaysLeft(sub.next_due_date);
            let color = 'var(--text-muted)';
            if (daysLeft !== null) {
              if (daysLeft < 0) color = 'var(--expense)';
              else if (daysLeft <= 3) color = 'var(--warning)';
              else color = 'var(--income)';
            }

            return (
              <div key={sub.id} style={{ 
                minWidth: '160px', 
                background: 'var(--bg-color)', 
                border: '1px solid var(--glass-border)',
                borderRadius: '12px', 
                padding: '12px',
                flexShrink: 0
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.95rem' }}>{sub.name}</div>
                  <div style={{ fontSize: '0.75rem', background: 'rgba(0,0,0,0.05)', color: 'var(--text-main)', padding: '2px 6px', borderRadius: '4px' }}>{sub.cycle}</div>
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>
                  ₹{Number(sub.amount).toLocaleString()}
                </div>
                {daysLeft !== null && (
                  <div style={{ fontSize: '0.8rem', color, fontWeight: 500 }}>
                    {daysLeft < 0 ? `Overdue by ${Math.abs(daysLeft)} days` : daysLeft === 0 ? 'Due Today!' : `Due in ${daysLeft} days`}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default SubscriptionsManager;

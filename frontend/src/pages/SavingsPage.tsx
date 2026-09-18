import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

interface SavingsPageProps {}

const SavingsPage: React.FC<SavingsPageProps> = () => {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [vaults, setVaults] = useState<any[]>([]);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [debts, setDebts] = useState<any[]>([]);

  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [newAccName, setNewAccName] = useState('');
  const [newAccBalance, setNewAccBalance] = useState('');
  
  const [isAddingDeposit, setIsAddingDeposit] = useState(false);
  const [newDepName, setNewDepName] = useState('');
  const [newDepAmount, setNewDepAmount] = useState('');
  const [newDepRate, setNewDepRate] = useState('');
  const [newDepDate, setNewDepDate] = useState('');

  const [isAddingDebt, setIsAddingDebt] = useState(false);
  const [newDebtName, setNewDebtName] = useState('');
  const [newDebtAmount, setNewDebtAmount] = useState('');
  const [newDebtRate, setNewDebtRate] = useState('');
  const [newDebtType, setNewDebtType] = useState('Credit Card');

  const fetchData = async () => {
    const [accountsRes, vaultsRes, depositsRes, debtsRes] = await Promise.all([
      supabase.from('accounts').select('*').order('created_at', { ascending: true }),
      supabase.from('vaults').select('*').order('created_at', { ascending: true }),
      supabase.from('deposits').select('*').order('created_at', { ascending: true }),
      supabase.from('debts').select('*').order('created_at', { ascending: true })
    ]);
    if (accountsRes.data) setAccounts(accountsRes.data);
    if (vaultsRes.data) setVaults(vaultsRes.data);
    if (depositsRes.data) setDeposits(depositsRes.data);
    if (debtsRes.data) setDebts(debtsRes.data);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddAccount = async () => {
    if (!newAccName.trim()) return;
    const { error } = await supabase.from('accounts').insert([{
      name: newAccName,
      balance: parseFloat(newAccBalance) || 0
    }]);
    if (!error) {
      setIsAddingAccount(false);
      setNewAccName('');
      setNewAccBalance('');
      fetchData();
    }
  };

  const handleAddDeposit = async () => {
    if (!newDepName.trim() || !newDepAmount) return;
    const { error } = await supabase.from('deposits').insert([{
      name: newDepName,
      amount: parseFloat(newDepAmount) || 0,
      interest_rate: parseFloat(newDepRate) || 0,
      maturity_date: newDepDate || null
    }]);
    if (!error) {
      setIsAddingDeposit(false);
      setNewDepName('');
      setNewDepAmount('');
      setNewDepRate('');
      setNewDepDate('');
      fetchData();
    }
  };

  const handleAddDebt = async () => {
    if (!newDebtName.trim() || !newDebtAmount) return;
    const { error } = await supabase.from('debts').insert([{
      name: newDebtName,
      amount: parseFloat(newDebtAmount) || 0,
      interest_rate: parseFloat(newDebtRate) || 0,
      type: newDebtType
    }]);
    if (!error) {
      setIsAddingDebt(false);
      setNewDebtName('');
      setNewDebtAmount('');
      setNewDebtRate('');
      setNewDebtType('Credit Card');
      fetchData();
    }
  };

  return (
    <div className="animate-slide-down">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 className="serif" style={{ fontSize: '1.5rem', color: 'var(--text-main)' }}>Your Wallets</h2>
        <button 
          onClick={() => setIsAddingAccount(!isAddingAccount)}
          style={{ background: 'transparent', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '4px 12px', borderRadius: '8px', fontSize: '0.85rem' }}
        >
          {isAddingAccount ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {isAddingAccount && (
        <div className="glass-panel" style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
          <input 
            type="text" 
            placeholder="Account Name (e.g. HDFC)" 
            value={newAccName} 
            onChange={e => setNewAccName(e.target.value)}
            style={{ flex: 1, background: 'var(--bg-color)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '8px 12px', borderRadius: '8px' }}
          />
          <input 
            type="number" 
            placeholder="Starting Balance ₹" 
            value={newAccBalance} 
            onChange={e => setNewAccBalance(e.target.value)}
            style={{ width: '120px', background: 'var(--bg-color)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '8px 12px', borderRadius: '8px' }}
          />
          <button onClick={handleAddAccount} style={{ background: 'var(--primary)', color: '#fff', padding: '8px 16px', borderRadius: '8px' }}>Save</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '16px', margin: '0 -20px', padding: '0 20px' }}>
        {accounts.length === 0 ? (
          <div className="glass-panel" style={{ flex: 1, textAlign: 'center', padding: '20px' }}>
            <p style={{ color: 'var(--text-muted)' }}>No accounts found. Add one!</p>
          </div>
        ) : (
          accounts.map(acc => (
            <div key={acc.id} className="glass-panel" style={{ minWidth: '200px', flex: '0 0 auto', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'var(--primary)' }} />
              <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 500 }}>{acc.name}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)' }}>₹{Number(acc.balance).toLocaleString()}</div>
            </div>
          ))
        )}
      </div>
      
      {/* Spacer to fix overlap */}
      <div style={{ height: '32px' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 className="serif" style={{ fontSize: '1.5rem', color: 'var(--text-main)' }}>Savings Vaults</h2>
        <button style={{ background: 'transparent', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '4px 12px', borderRadius: '8px', fontSize: '0.85rem' }}>+ Vault</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
        {vaults.length === 0 ? (
          <div className="glass-panel" style={{ textAlign: 'center', padding: '20px' }}>
            <p style={{ color: 'var(--text-muted)' }}>No vaults found. Set a goal!</p>
          </div>
        ) : (
          vaults.map(vault => {
            const progress = Math.min(100, Math.round((vault.current_amount / vault.target_amount) * 100));
            return (
              <div key={vault.id} className="glass-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{vault.name}</div>
                  <div style={{ color: 'var(--primary)', fontWeight: 600 }}>{progress}%</div>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  ₹{Number(vault.current_amount).toLocaleString()} / ₹{Number(vault.target_amount).toLocaleString()}
                </div>
                <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${progress}%`, height: '100%', background: 'var(--primary)', borderRadius: '4px' }} />
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 className="serif" style={{ fontSize: '1.5rem', color: 'var(--text-main)' }}>Fixed Deposits</h2>
        <button 
          onClick={() => setIsAddingDeposit(!isAddingDeposit)}
          style={{ background: 'transparent', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '4px 12px', borderRadius: '8px', fontSize: '0.85rem' }}
        >
          {isAddingDeposit ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {isAddingDeposit && (
        <div className="glass-panel" style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input type="text" placeholder="Deposit Name (e.g. SBI 1-Year FD)" value={newDepName} onChange={e => setNewDepName(e.target.value)} style={{ background: 'var(--bg-color)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '8px 12px', borderRadius: '8px' }} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <input type="number" placeholder="Principal ₹" value={newDepAmount} onChange={e => setNewDepAmount(e.target.value)} style={{ flex: 1, background: 'var(--bg-color)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '8px 12px', borderRadius: '8px' }} />
            <input type="number" placeholder="Rate %" value={newDepRate} onChange={e => setNewDepRate(e.target.value)} style={{ width: '90px', background: 'var(--bg-color)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '8px 12px', borderRadius: '8px' }} />
          </div>
          <input type="date" placeholder="Maturity Date" value={newDepDate} onChange={e => setNewDepDate(e.target.value)} style={{ background: 'var(--bg-color)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '8px 12px', borderRadius: '8px' }} />
          <button onClick={handleAddDeposit} style={{ background: 'var(--primary)', color: '#fff', padding: '8px 16px', borderRadius: '8px', width: '100%', fontWeight: 600 }}>Save Deposit</button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '24px' }}>
        {deposits.length === 0 ? (
          <div className="glass-panel" style={{ textAlign: 'center', padding: '20px' }}>
            <p style={{ color: 'var(--text-muted)' }}>No deposits found.</p>
          </div>
        ) : (
          deposits.map(dep => (
            <div key={dep.id} className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>{dep.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: '8px' }}>
                  <span style={{ background: 'var(--primary-glow)', color: 'var(--primary)', padding: '2px 6px', borderRadius: '4px', fontWeight: 500 }}>{dep.interest_rate}% p.a.</span>
                  {dep.maturity_date && <span>Matures: {new Date(dep.maturity_date).toLocaleDateString()}</span>}
                </div>
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)' }}>
                ₹{Number(dep.amount).toLocaleString()}
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 className="serif" style={{ fontSize: '1.5rem', color: 'var(--expense)' }}>Debts & Liabilities</h2>
        <button 
          onClick={() => setIsAddingDebt(!isAddingDebt)}
          style={{ background: 'transparent', border: '1px solid var(--expense)', color: 'var(--expense)', padding: '4px 12px', borderRadius: '8px', fontSize: '0.85rem' }}
        >
          {isAddingDebt ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {isAddingDebt && (
        <div className="glass-panel" style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '12px', borderLeft: '4px solid var(--expense)' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input type="text" placeholder="Debt Name (e.g. HDFC Credit Card)" value={newDebtName} onChange={e => setNewDebtName(e.target.value)} style={{ flex: 1, background: 'var(--bg-color)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '8px 12px', borderRadius: '8px' }} />
            <select value={newDebtType} onChange={e => setNewDebtType(e.target.value)} style={{ width: '130px', background: 'var(--bg-color)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '8px 12px', borderRadius: '8px' }}>
              <option>Credit Card</option>
              <option>Personal Loan</option>
              <option>Mortgage</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input type="number" placeholder="Total Outstanding ₹" value={newDebtAmount} onChange={e => setNewDebtAmount(e.target.value)} style={{ flex: 1, background: 'var(--bg-color)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '8px 12px', borderRadius: '8px' }} />
            <input type="number" placeholder="APR %" value={newDebtRate} onChange={e => setNewDebtRate(e.target.value)} style={{ width: '90px', background: 'var(--bg-color)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '8px 12px', borderRadius: '8px' }} />
          </div>
          <button onClick={handleAddDebt} style={{ background: 'var(--expense)', color: '#fff', padding: '8px 16px', borderRadius: '8px', width: '100%', fontWeight: 600 }}>Save Debt</button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {debts.length === 0 ? (
          <div className="glass-panel" style={{ textAlign: 'center', padding: '20px' }}>
            <p style={{ color: 'var(--text-muted)' }}>You are completely debt-free! 🎉</p>
          </div>
        ) : (
          debts.map(debt => (
            <div key={debt.id} className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '4px solid var(--expense)' }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>{debt.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: '8px' }}>
                  <span style={{ background: 'var(--expense-bg)', color: 'var(--expense)', padding: '2px 6px', borderRadius: '4px', fontWeight: 500 }}>{debt.type}</span>
                  {debt.interest_rate > 0 && <span>{debt.interest_rate}% APR</span>}
                </div>
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--expense)' }}>
                -₹{Number(debt.amount).toLocaleString()}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SavingsPage;

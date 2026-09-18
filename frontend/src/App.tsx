import { useEffect, useState } from 'react';
import './index.css';
import Login from './components/Login';
import Navigation, { type TabType } from './components/Navigation';
import HomePage from './pages/HomePage';
import ExpensesPage from './pages/ExpensesPage';
import SavingsPage from './pages/SavingsPage';

import { supabase } from './supabaseClient';

export type Transaction = {
  id: number;
  date: string;
  amount: number;
  merchant: string;
  category: string;
  isNew?: boolean; // Used for animation
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState<TabType>('home');

  const fetchTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: false });
        
      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error("Failed to fetch transactions", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    
    fetchTransactions();

    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transactions',
        },
        (payload) => {
          console.log('New transaction received!', payload);
          // Prepend new transaction and mark it for animation
          setTransactions((prev) => [{ ...payload.new, isNew: true } as Transaction, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <Login onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px', paddingBottom: '100px' }}>
      <header style={{ marginBottom: '40px', textAlign: 'center', paddingTop: '40px' }}>
        <h1 className="serif" style={{ 
          fontSize: '3.5rem', 
          marginBottom: '8px', 
          color: 'var(--text-main)',
          fontWeight: 700,
          letterSpacing: '-0.03em'
        }}>
          Finance
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', letterSpacing: '0.02em', fontWeight: 500 }}>
          Exclusive Portfolio Management
        </p>
      </header>

      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>Loading...</div>
      ) : (
        <>
          {currentTab === 'home' && <HomePage transactions={transactions} onNavigate={setCurrentTab} />}
          {currentTab === 'expenses' && <ExpensesPage transactions={transactions} onRefresh={fetchTransactions} />}
          {currentTab === 'savings' && <SavingsPage />}
        </>
      )}

      <Navigation currentTab={currentTab} setTab={setCurrentTab} />
    </div>
  );
}

export default App;

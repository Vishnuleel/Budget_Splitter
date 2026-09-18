import React from 'react';
import { Home, PieChart, Wallet } from 'lucide-react';

export type TabType = 'home' | 'expenses' | 'savings';

interface NavigationProps {
  currentTab: TabType;
  setTab: (tab: TabType) => void;
}

const Navigation: React.FC<NavigationProps> = ({ currentTab, setTab }) => {
  const tabs: { id: TabType; icon: React.ReactNode; label: string }[] = [
    { id: 'home', icon: <Home size={24} />, label: 'Home' },
    { id: 'expenses', icon: <PieChart size={24} />, label: 'Expenses' },
    { id: 'savings', icon: <Wallet size={24} />, label: 'Savings' }
  ];

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: 'rgba(255, 255, 255, 0.9)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderTop: '1px solid var(--glass-border)',
      display: 'flex',
      justifyContent: 'space-around',
      padding: '16px 20px',
      paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
      zIndex: 100
    }}>
      {tabs.map(tab => {
        const isActive = currentTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              background: 'transparent',
              border: 'none',
              boxShadow: 'none',
              color: isActive ? 'var(--primary)' : 'var(--text-muted)',
              transition: 'color 0.3s ease',
              padding: '0 12px'
            }}
          >
            {tab.icon}
            <span style={{ fontSize: '0.75rem', fontWeight: isActive ? 600 : 400 }}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default Navigation;

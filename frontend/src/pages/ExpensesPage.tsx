import React from 'react';
import type { Transaction } from '../App';
import SpendingChart from '../components/SpendingChart';
import CategoryPieChart from '../components/CategoryPieChart';
import TransactionsList from '../components/TransactionsList';
import SubscriptionsManager from '../components/SubscriptionsManager';

interface ExpensesPageProps {
  transactions: Transaction[];
  onRefresh: () => void;
}

const ExpensesPage: React.FC<ExpensesPageProps> = ({ transactions, onRefresh }) => {
  return (
    <div className="animate-slide-down">
      <SubscriptionsManager />
      <SpendingChart transactions={transactions} />
      <CategoryPieChart transactions={transactions} />
      <TransactionsList transactions={transactions} onRefresh={onRefresh} />
    </div>
  );
};

export default ExpensesPage;

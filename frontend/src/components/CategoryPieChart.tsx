import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import type { Transaction } from '../App';

interface CategoryPieChartProps {
  transactions: Transaction[];
}

const COLORS = [
  '#6366F1', // Indigo 500
  '#818CF8', // Indigo 400
  '#A5B4FC', // Indigo 300
  '#4F46E5', // Indigo 600
  '#3730A3', // Indigo 800
  '#C7D2FE', // Indigo 200
  '#E0E7FF', // Indigo 100
];

const CategoryPieChart: React.FC<CategoryPieChartProps> = ({ transactions }) => {
  // Aggregate expenses by category
  const dataMap = new Map<string, number>();
  
  transactions.forEach(tx => {
    if (tx.category === 'Income' || tx.category === 'Savings') return;
    const current = dataMap.get(tx.category) || 0;
    dataMap.set(tx.category, current + tx.amount);
  });

  const data = Array.from(dataMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  if (data.length === 0) {
    return null;
  }

  return (
    <div className="glass-panel animate-slide-down" style={{ marginBottom: '32px', animationDelay: '0.1s' }}>
      <h2 className="serif" style={{ marginBottom: '24px', fontSize: '1.25rem', color: 'var(--text-main)', margin: '0 0 24px 0' }}>Category Breakdown</h2>
      <div style={{ height: 250, width: '100%' }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
              stroke="none"
            >
              {data.map((_entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ 
                background: 'var(--surface-color)', 
                border: '1px solid var(--glass-border)',
                borderRadius: '8px',
                backdropFilter: 'blur(10px)',
                color: 'var(--text-main)',
                fontFamily: 'Inter',
                boxShadow: 'var(--card-shadow)'
              }}
              itemStyle={{ color: 'var(--primary)' }}
              formatter={(value: any) => [`₹${Number(value).toFixed(2)}`, 'Spent']}
            />
            <Legend 
              verticalAlign="bottom" 
              height={36} 
              iconType="circle"
              formatter={(value) => <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default CategoryPieChart;

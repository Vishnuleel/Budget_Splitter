import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { Transaction } from '../App';

interface SpendingChartProps {
  transactions: Transaction[];
}

const SpendingChart: React.FC<SpendingChartProps> = ({ transactions }) => {
  // Process data for the last 7 days
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    return d;
  });

  const data = days.map(day => {
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);

    const spentThatDay = transactions
      .filter(t => t.category !== 'Income' && new Date(t.date) >= day && new Date(t.date) < nextDay)
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      name: day.toLocaleDateString(undefined, { weekday: 'short' }),
      amount: spentThatDay,
      date: day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    };
  });

  return (
    <div className="glass-panel animate-slide-down" style={{ marginBottom: '32px', animationDelay: '0.05s' }}>
      <h2 className="serif" style={{ marginBottom: '24px', fontSize: '1.25rem', color: 'var(--text-main)', margin: '0 0 24px 0' }}>Spending Analysis</h2>
      <div style={{ height: 200, width: '100%' }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.2}/>
                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="date" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: 'var(--text-muted)', fontSize: 12, fontFamily: 'Inter' }}
              dy={10}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: 'var(--text-muted)', fontSize: 12, fontFamily: 'Inter' }}
              tickFormatter={(value) => `₹${value}`}
            />
            <Tooltip 
              cursor={{ stroke: 'var(--glass-border)', strokeWidth: 1, strokeDasharray: '4 4' }}
              contentStyle={{ 
                background: 'var(--surface-color)', 
                border: '1px solid var(--glass-border)',
                borderRadius: '8px',
                backdropFilter: 'blur(10px)',
                color: 'var(--text-main)',
                fontFamily: 'Inter',
                boxShadow: 'var(--card-shadow)'
              }}
              formatter={(value: any) => [`₹${Number(value).toFixed(2)}`, 'Spent']}
              labelStyle={{ color: 'var(--text-muted)', marginBottom: '4px' }}
            />
            <Area 
              type="monotone" 
              dataKey="amount" 
              stroke="var(--primary)" 
              strokeWidth={2}
              fillOpacity={1} 
              fill="url(#goldGradient)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default SpendingChart;

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useState } from 'react';

interface ProcessStateData {
  state: string;
  count: number;
  value: number;
}

interface ProcessStateChartProps {
  data: ProcessStateData[];
  onStateClick?: (state: string) => void;
}

// Colors ordered by process state flow (01 to 10+)
const COLORS = [
  '#22c55e', // 01 - green (early stage)
  '#4ade80', // 02 - light green
  '#22d3ee', // 03 - cyan  
  '#38bdf8', // 04 - sky
  '#60a5fa', // 05 - blue
  '#818cf8', // 06 - indigo
  '#a78bfa', // 07 - purple
  '#f59e0b', // 08 - amber (ready for payment)
  '#fb923c', // 09 - orange
  '#ef4444', // 10 - red (investigation)
  '#64748b', // Unknown - slate
];

const formatCurrency = (value: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', notation: 'compact', maximumFractionDigits: 1 }).format(value);

export function ProcessStateChart({ data, onStateClick }: ProcessStateChartProps) {
  const [viewMode, setViewMode] = useState<'count' | 'value'>('count');
  
  // Filter out empty/unknown states and only show valid process states (those starting with 01-10)
  const validData = data.filter(item => {
    const match = item.state.match(/^(\d+)/);
    return match && parseInt(match[1], 10) >= 0 && parseInt(match[1], 10) <= 10;
  });
  
  // Sort data by numeric prefix (01, 02, 03, etc.) to ensure proper order
  const sortedData = [...validData].sort((a, b) => {
    const aMatch = a.state.match(/^(\d+)/);
    const bMatch = b.state.match(/^(\d+)/);
    const aNum = aMatch ? parseInt(aMatch[1], 10) : 999;
    const bNum = bMatch ? parseInt(bMatch[1], 10) : 999;
    return aNum - bNum;
  });

  const chartData = sortedData.map((item, index) => ({
    ...item,
    name: item.state.replace(/^\d+\s*-\s*/, ''), // Remove "01 - " prefix for chart label
    shortName: item.state.match(/^(\d+)/)?.[1]?.padStart(2, '0') || '??', // Just the number, zero-padded
    fullName: item.state, // Keep full name for legend display
    fill: COLORS[index % COLORS.length],
  }));

  // Calculate totals from original data (including unknown) for percentage calculations
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const totalValue = data.reduce((sum, d) => sum + d.value, 0);
  
  // Calculate how many are in unknown/empty states
  const unknownCount = data.filter(item => !item.state.match(/^(\d+)/)).reduce((sum, d) => sum + d.count, 0);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      const pct = ((d.count / total) * 100).toFixed(1);
      const valuePct = ((d.value / totalValue) * 100).toFixed(1);
      return (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
          <p className="text-white font-medium text-sm">{d.state}</p>
          <p className="text-slate-400 text-sm">{d.count.toLocaleString()} invoices ({pct}%)</p>
          <p className="text-sky-400 text-sm">{formatCurrency(d.value)} ({valuePct}%)</p>
        </div>
      );
    }
    return null;
  };

  if (!data || data.length === 0 || chartData.length === 0) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Process State Distribution</h3>
        <div className="h-64 flex items-center justify-center text-slate-500">No data available</div>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Process State Distribution</h3>
        <div className="flex gap-1 bg-slate-700/50 rounded-lg p-1">
          <button
            onClick={() => setViewMode('count')}
            className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
              viewMode === 'count' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Count
          </button>
          <button
            onClick={() => setViewMode('value')}
            className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
              viewMode === 'value' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Value
          </button>
        </div>
      </div>
      
      <div className="h-64">
        <ResponsiveContainer width="100%" height={256}>
          <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis 
              dataKey="shortName" 
              stroke="#94a3b8" 
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              axisLine={{ stroke: '#475569' }}
            />
            <YAxis 
              stroke="#94a3b8" 
              tick={{ fill: '#94a3b8', fontSize: 10 }}
              axisLine={{ stroke: '#475569' }}
              tickFormatter={viewMode === 'value' ? formatCurrency : undefined}
              width={viewMode === 'value' ? 60 : 50}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar 
              dataKey={viewMode} 
              radius={[4, 4, 0, 0]}
              onClick={(data: any) => onStateClick?.(data.state)}
              cursor={onStateClick ? 'pointer' : undefined}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      {/* Legend - sorted by numeric prefix (01, 02, 03, etc.) */}
      <div className="mt-4 grid grid-cols-2 gap-1 max-h-36 overflow-y-auto">
        {chartData.map((item, index) => (
          <button 
            key={item.state} 
            onClick={() => onStateClick?.(item.state)} 
            className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-700/50 transition-colors text-left"
          >
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
            <span className="text-xs text-slate-400 truncate flex-1">{item.fullName}</span>
            <span className="text-xs text-slate-500">
              {viewMode === 'count' ? item.count.toLocaleString() : formatCurrency(item.value)}
            </span>
          </button>
        ))}
      </div>
      
      {/* Note about unknown process states */}
      {unknownCount > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          * {unknownCount.toLocaleString()} invoice{unknownCount !== 1 ? 's' : ''} with unknown process state not shown
        </p>
      )}
    </div>
  );
}


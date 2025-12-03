import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, AreaChart, Area } from 'recharts';

interface MonthlyAgingData {
  bucket: string;
  label: string;
  count: number;
  value: number;
  daysMin: number;
}

interface MonthlyAgingChartProps {
  data: MonthlyAgingData[];
  onBucketClick?: (bucket: string) => void;
}

// Gradient colors from cool to hot
const COLORS = [
  '#22d3ee', // 90 - cyan
  '#38bdf8', // 120 - sky
  '#60a5fa', // 150 - blue
  '#818cf8', // 180 - indigo
  '#a78bfa', // 210 - purple
  '#c084fc', // 240 - purple
  '#e879f9', // 270 - fuchsia
  '#f472b6', // 300 - pink
  '#fb7185', // 330 - rose
  '#ef4444', // 360+ - red
];

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', notation: 'compact', maximumFractionDigits: 1 }).format(value);
};

export function MonthlyAgingChart({ data, onBucketClick }: MonthlyAgingChartProps) {
  const [viewMode, setViewMode] = useState<'count' | 'value'>('value');
  const [chartType, setChartType] = useState<'bar' | 'area'>('bar');

  const chartData = data.map((item, index) => ({
    ...item,
    fill: COLORS[index % COLORS.length],
  }));

  const totalCount = data.reduce((sum, d) => sum + d.count, 0);
  const totalValue = data.reduce((sum, d) => sum + d.value, 0);

  // Calculate cumulative data for area chart
  let cumCount = 0;
  let cumValue = 0;
  const cumulativeData = data.map((item, index) => {
    cumCount += item.count;
    cumValue += item.value;
    return {
      ...item,
      cumCount,
      cumValue,
      fill: COLORS[index % COLORS.length],
    };
  });

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      const pctCount = ((item.count / totalCount) * 100).toFixed(1);
      const pctValue = ((item.value / totalValue) * 100).toFixed(1);
      
      return (
        <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-xl">
          <p className="text-white font-semibold mb-2">{item.label}</p>
          <div className="space-y-1 text-sm">
            <p className="text-slate-300">
              <span className="text-slate-400">Invoices:</span> {item.count.toLocaleString()} ({pctCount}%)
            </p>
            <p className="text-slate-300">
              <span className="text-slate-400">Value:</span> {formatCurrency(item.value)} ({pctValue}%)
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Monthly Aging Breakdown</h3>
          <p className="text-sm text-slate-400">Invoice age in 30-day intervals</p>
        </div>
        <div className="flex gap-2">
          <div className="flex gap-1 bg-slate-700/50 rounded-lg p-1">
            <button
              onClick={() => setChartType('bar')}
              className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                chartType === 'bar' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Bar
            </button>
            <button
              onClick={() => setChartType('area')}
              className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                chartType === 'area' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Area
            </button>
          </div>
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
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-slate-800/50 rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-cyan-400">{data.slice(0, 2).reduce((s, d) => s + d.count, 0).toLocaleString()}</p>
          <p className="text-xs text-slate-500">90-150 days</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-indigo-400">{data.slice(2, 4).reduce((s, d) => s + d.count, 0).toLocaleString()}</p>
          <p className="text-xs text-slate-500">150-210 days</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-purple-400">{data.slice(4, 6).reduce((s, d) => s + d.count, 0).toLocaleString()}</p>
          <p className="text-xs text-slate-500">210-270 days</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-red-400">{data.slice(6).reduce((s, d) => s + d.count, 0).toLocaleString()}</p>
          <p className="text-xs text-slate-500">270+ days</p>
        </div>
      </div>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'bar' ? (
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                dataKey="bucket" 
                stroke="#94a3b8" 
                tick={{ fill: '#94a3b8', fontSize: 11 }} 
                axisLine={{ stroke: '#475569' }}
                angle={-45}
                textAnchor="end"
                interval={0}
                height={50}
              />
              <YAxis 
                stroke="#94a3b8" 
                tick={{ fill: '#94a3b8', fontSize: 11 }} 
                axisLine={{ stroke: '#475569' }} 
                tickFormatter={viewMode === 'value' ? formatCurrency : undefined} 
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar 
                dataKey={viewMode} 
                radius={[4, 4, 0, 0]}
                onClick={(data: any) => onBucketClick?.(data.bucket)}
                cursor={onBucketClick ? 'pointer' : undefined}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <AreaChart data={cumulativeData} margin={{ top: 10, right: 10, left: 10, bottom: 30 }}>
              <defs>
                <linearGradient id="colorCumulative" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.8}/>
                  <stop offset="50%" stopColor="#a78bfa" stopOpacity={0.8}/>
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.8}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                dataKey="bucket" 
                stroke="#94a3b8" 
                tick={{ fill: '#94a3b8', fontSize: 11 }} 
                axisLine={{ stroke: '#475569' }}
                angle={-45}
                textAnchor="end"
                interval={0}
                height={50}
              />
              <YAxis 
                stroke="#94a3b8" 
                tick={{ fill: '#94a3b8', fontSize: 11 }} 
                axisLine={{ stroke: '#475569' }} 
                tickFormatter={viewMode === 'value' ? formatCurrency : undefined} 
              />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                type="monotone" 
                dataKey={viewMode === 'count' ? 'cumCount' : 'cumValue'} 
                stroke="url(#colorCumulative)"
                fill="url(#colorCumulative)"
                fillOpacity={0.3}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-2 justify-center">
        {chartData.map((item, index) => (
          <button
            key={item.bucket}
            onClick={() => onBucketClick?.(item.bucket)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-slate-700/50 transition-colors"
          >
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[index] }}></div>
            <span className="text-xs text-slate-400">{item.bucket}</span>
          </button>
        ))}
      </div>
    </div>
  );
}


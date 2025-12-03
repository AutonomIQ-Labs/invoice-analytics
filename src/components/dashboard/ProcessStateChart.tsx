import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface ProcessStateData {
  state: string;
  count: number;
  value: number;
}

interface ProcessStateChartProps {
  data: ProcessStateData[];
  onStateClick?: (state: string) => void;
}

const COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const formatCurrency = (value: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', notation: 'compact', maximumFractionDigits: 1 }).format(value);

export function ProcessStateChart({ data, onStateClick }: ProcessStateChartProps) {
  const chartData = data.slice(0, 8).map((item, index) => ({
    ...item,
    name: item.state.replace(/^\d+\s*-\s*/, ''),
    fill: COLORS[index % COLORS.length],
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
          <p className="text-white font-medium">{data.name}</p>
          <p className="text-slate-400 text-sm">{data.count.toLocaleString()} invoices</p>
          <p className="text-sky-400 text-sm">{formatCurrency(data.value)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Process State Distribution</h3>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="count" onClick={(data) => onStateClick?.(data.state)} style={{ cursor: onStateClick ? 'pointer' : 'default' }}>
              {chartData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.fill} stroke="#1e293b" strokeWidth={2} />))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {chartData.slice(0, 6).map((item, index) => (
          <button key={item.state} onClick={() => onStateClick?.(item.state)} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-700/50 transition-colors text-left">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[index] }}></div>
            <span className="text-xs text-slate-400 truncate">{item.name}</span>
            <span className="text-xs text-slate-500 ml-auto">{item.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}


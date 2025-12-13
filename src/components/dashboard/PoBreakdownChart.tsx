import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface PoData {
  type: string;
  count: number;
  value: number;
}

interface PoBreakdownChartProps {
  data: PoData[];
  onTypeClick?: (type: string) => void;
}

const COLORS = {
  'PO': '#0ea5e9',      // Sky blue for PO
  'Non-PO': '#f59e0b',  // Amber for Non-PO
  'Unknown': '#64748b', // Slate for Unknown
};

const formatCurrency = (value: number) => new Intl.NumberFormat('en-CA', { 
  style: 'currency', 
  currency: 'CAD', 
  notation: 'compact', 
  maximumFractionDigits: 1 
}).format(value);

export function PoBreakdownChart({ data, onTypeClick }: PoBreakdownChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-white mb-4">PO vs Non-PO Invoices</h3>
        <div className="h-48 flex items-center justify-center text-slate-500">No data available</div>
      </div>
    );
  }

  const chartData = data.map(item => ({
    ...item,
    name: item.type,
    fill: COLORS[item.type as keyof typeof COLORS] || '#64748b',
  }));

  const total = data.reduce((sum, d) => sum + d.count, 0);
  const totalValue = data.reduce((sum, d) => sum + d.value, 0);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      const percentage = ((d.count / total) * 100).toFixed(1);
      return (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
          <p className="text-white font-medium">{d.name}</p>
          <p className="text-slate-400 text-sm">{d.count.toLocaleString()} invoices ({percentage}%)</p>
          <p className="text-sky-400 text-sm">{formatCurrency(d.value)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-white mb-4">PO vs Non-PO Invoices</h3>
      
      <div className="flex items-center gap-6">
        {/* Pie Chart */}
        <div className="h-48 w-48 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={150} minHeight={150}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={70}
                paddingAngle={3}
                dataKey="count"
                onClick={(d) => onTypeClick?.(d.type)}
                style={{ cursor: onTypeClick ? 'pointer' : 'default' }}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} stroke="#1e293b" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Stats */}
        <div className="flex-1 space-y-3">
          {chartData.map((item) => {
            const percentage = ((item.count / total) * 100).toFixed(1);
            const valuePercentage = ((item.value / totalValue) * 100).toFixed(1);
            return (
              <button
                key={item.type}
                onClick={() => onTypeClick?.(item.type)}
                className="w-full text-left group"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.fill }}></div>
                    <span className="text-sm font-medium text-white group-hover:text-sky-400 transition-colors">
                      {item.name}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm text-white">{item.count.toLocaleString()}</span>
                    <span className="text-xs text-slate-500 ml-1">({percentage}%)</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Value:</span>
                  <span className="text-slate-400">
                    {formatCurrency(item.value)}
                    <span className="text-slate-500 ml-1">({valuePercentage}%)</span>
                  </span>
                </div>
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden mt-1">
                  <div 
                    className="h-full rounded-full transition-all duration-500" 
                    style={{ width: `${percentage}%`, backgroundColor: item.fill }}
                  ></div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary Footer */}
      <div className="mt-4 pt-4 border-t border-slate-700/50 grid grid-cols-2 gap-4 text-center">
        <div>
          <p className="text-2xl font-bold text-white">{total.toLocaleString()}</p>
          <p className="text-xs text-slate-500">Total Invoices</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{formatCurrency(totalValue)}</p>
          <p className="text-xs text-slate-500">Total Value</p>
        </div>
      </div>
    </div>
  );
}


import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface AgingData {
  bucket: string;
  count: number;
  value: number;
}

interface AgingChartProps {
  data: AgingData[];
  viewMode: 'count' | 'value';
}

const COLORS = ['#0ea5e9', '#f59e0b', '#ef4444', '#dc2626'];

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', notation: 'compact', maximumFractionDigits: 1 }).format(value);
};

export function AgingChart({ data, viewMode }: AgingChartProps) {
  const chartData = data.map((item, index) => ({ ...item, fill: COLORS[index % COLORS.length] }));

  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Aging Breakdown</h3>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="bucket" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={{ stroke: '#475569' }} />
            <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={{ stroke: '#475569' }} tickFormatter={viewMode === 'value' ? formatCurrency : undefined} />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc' }} formatter={(value: number) => [viewMode === 'value' ? formatCurrency(value) : value.toLocaleString(), viewMode === 'value' ? 'Total Value' : 'Invoice Count']} />
            <Bar dataKey={viewMode} radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.fill} />))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 flex flex-wrap gap-4 justify-center">
        {chartData.map((item, index) => (
          <div key={item.bucket} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index] }}></div>
            <span className="text-sm text-slate-400">{item.bucket} days</span>
          </div>
        ))}
      </div>
    </div>
  );
}


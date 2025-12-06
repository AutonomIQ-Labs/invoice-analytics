import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { ImportBatch } from '../../types/database';

interface TrendChartProps {
  batches: ImportBatch[];
}

const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });

export function TrendChart({ batches }: TrendChartProps) {
  // Filter out deleted batches for trend calculation - only use non-deleted batches
  const nonDeletedBatches = batches.filter(batch => !batch.is_deleted);
  
  const chartData = [...nonDeletedBatches]
    .sort((a, b) => new Date(a.imported_at).getTime() - new Date(b.imported_at).getTime())
    .slice(-10)
    .map(batch => ({ date: formatDate(batch.imported_at), count: batch.record_count, filename: batch.filename }));

  if (chartData.length < 2) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Backlog Trend</h3>
        <div className="h-64 flex items-center justify-center text-slate-500">
          <div className="text-center">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
            <p>Need at least 2 imports to show trends</p>
          </div>
        </div>
      </div>
    );
  }

  const firstCount = chartData[0].count;
  const lastCount = chartData[chartData.length - 1].count;
  const change = lastCount - firstCount;

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Backlog Trend</h3>
        <div className={`flex items-center gap-1 text-sm ${change <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={change <= 0 ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
          </svg>
          <span>{Math.abs(change).toLocaleString()}</span>
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="date" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#475569' }} />
            <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#475569' }} tickFormatter={(value) => value.toLocaleString()} />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc' }} formatter={(value: number) => [value.toLocaleString(), 'Invoices']} />
            <Line type="monotone" dataKey="count" stroke="#0ea5e9" strokeWidth={2} dot={{ fill: '#0ea5e9', strokeWidth: 2, r: 4 }} activeDot={{ r: 6, fill: '#0ea5e9' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}


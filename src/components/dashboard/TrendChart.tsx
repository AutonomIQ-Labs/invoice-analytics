import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../../lib/supabase';
import type { ImportBatch } from '../../types/database';

interface TrendChartProps {
  batches: ImportBatch[];
}

interface BatchBacklogData {
  date: string;
  backlog: number;
  total: number;
  readyForPayment: number;
  filename: string;
}

const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });

// Check if invoice status is "Ready For Payment" (process state 08)
function isReadyForPayment(processState: string): boolean {
  const state = processState.trim().toLowerCase();
  return state.startsWith('08') || state.includes('ready for payment');
}

export function TrendChart({ batches }: TrendChartProps) {
  const [chartData, setChartData] = useState<BatchBacklogData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBacklogData() {
      // Filter out deleted batches and get last 10
      const nonDeletedBatches = batches
        .filter(batch => !batch.is_deleted)
        .sort((a, b) => new Date(a.imported_at).getTime() - new Date(b.imported_at).getTime())
        .slice(-10);

      if (nonDeletedBatches.length < 2) {
        setChartData([]);
        setLoading(false);
        return;
      }

      // Fetch invoice status counts for each batch
      const backlogData: BatchBacklogData[] = [];
      
      for (const batch of nonDeletedBatches) {
        // Query invoices for this batch to count ready for payment
        const { data: invoices } = await supabase
          .from('invoices')
          .select('overall_process_state')
          .eq('import_batch_id', batch.id);

        const total = invoices?.length ?? batch.record_count;
        const readyForPayment = invoices?.filter(inv => 
          inv.overall_process_state && isReadyForPayment(inv.overall_process_state)
        ).length ?? 0;
        
        backlogData.push({
          date: formatDate(batch.imported_at),
          backlog: total - readyForPayment,
          total,
          readyForPayment,
          filename: batch.filename
        });
      }

      setChartData(backlogData);
      setLoading(false);
    }

    fetchBacklogData();
  }, [batches]);

  if (loading) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Backlog Trend</h3>
        <div className="h-64 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

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

  const firstBacklog = chartData[0].backlog;
  const lastBacklog = chartData[chartData.length - 1].backlog;
  const change = lastBacklog - firstBacklog;

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
        <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={200}>
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="date" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#475569' }} />
            <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#475569' }} tickFormatter={(value) => value.toLocaleString()} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc' }} 
              formatter={(value: number, name: string) => [
                value.toLocaleString(), 
                name === 'backlog' ? 'Backlog' : name
              ]}
              labelFormatter={(label) => `Date: ${label}`}
            />
            <Line type="monotone" dataKey="backlog" stroke="#f97316" strokeWidth={2} dot={{ fill: '#f97316', strokeWidth: 2, r: 4 }} activeDot={{ r: 6, fill: '#f97316' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}


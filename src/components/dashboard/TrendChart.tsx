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

// Format date with time for unique labels when multiple imports on same day
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const dateOnly = date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  const time = date.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${dateOnly} ${time}`;
};

export function TrendChart({ batches }: TrendChartProps) {
  const [chartData, setChartData] = useState<BatchBacklogData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBacklogData() {
      setLoading(true);
      setError(null);
      
      try {
        // Filter out deleted batches and sort by import timestamp (chronological order)
        // Most recent import is always last - this ensures the chart reflects actual import order
        const batchesForChart = batches
          .filter(batch => !batch.is_deleted)
          .sort((a, b) => new Date(a.imported_at).getTime() - new Date(b.imported_at).getTime())
          .slice(-5); // Last 5 batches for faster loading

        if (batchesForChart.length < 2) {
          setChartData([]);
          setLoading(false);
          return;
        }

        // Fetch pre-calculated stats for all batches in a single query
        const batchIds = batchesForChart.map(b => b.id);
        const { data: statsData, error: statsError } = await supabase
          .from('batch_stats')
          .select('batch_id, backlog_count, total_invoices, ready_for_payment_count')
          .in('batch_id', batchIds);

        if (statsError) {
          console.error('Failed to fetch batch stats:', statsError.message);
          setError('Failed to load backlog data');
          setLoading(false);
          return;
        }

        // Map stats to chart data, maintaining chronological order
        const backlogData: BatchBacklogData[] = batchesForChart.map(batch => {
          const stats = statsData?.find(s => s.batch_id === batch.id);
          return {
            date: formatDate(batch.imported_at),
            backlog: stats?.backlog_count || 0,
            total: stats?.total_invoices || 0,
            readyForPayment: stats?.ready_for_payment_count || 0,
            filename: batch.filename
          };
        });

        // Filter out batches with no stats (might not have been backfilled yet)
        const validData = backlogData.filter(d => d.total > 0);
        
        if (validData.length < 2) {
          // Fall back message if stats aren't available
          setChartData([]);
        } else {
          setChartData(validData);
        }
      } catch (err) {
        console.error('Error fetching trend data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load backlog data');
      } finally {
        setLoading(false);
      }
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

  if (error) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Backlog Trend</h3>
        <div className="h-64 flex items-center justify-center text-red-400">
          <div className="text-center">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p>{error}</p>
          </div>
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
            <p className="text-xs mt-2">Import new data to see trend statistics</p>
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
        <ResponsiveContainer width="100%" height={256}>
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
              cursor={{ stroke: '#475569', strokeWidth: 1 }}
              isAnimationActive={false}
            />
            <Line type="monotone" dataKey="backlog" stroke="#f97316" strokeWidth={2} dot={{ fill: '#f97316', strokeWidth: 2, r: 4 }} activeDot={{ r: 6, fill: '#f97316' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

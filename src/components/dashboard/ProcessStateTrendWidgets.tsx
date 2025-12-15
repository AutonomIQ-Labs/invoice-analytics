import { useState, useEffect } from 'react';
import { LineChart, Line, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../../lib/supabase';
import type { ImportBatch } from '../../types/database';

interface ProcessStateTrendWidgetsProps {
  batches: ImportBatch[];
}

interface StateTrendData {
  date: string;
  count: number;
  value: number;
  filename: string;
}

interface ProcessStateTrend {
  state: string;
  shortName: string;
  data: StateTrendData[];
  color: string;
  change: number;
  currentCount: number;
}

// Color palette for different process states
const STATE_COLORS: Record<string, string> = {
  '01': '#f97316', // Orange - Header To Be Verified
  '02': '#06b6d4', // Cyan - Send for Error Resolution
  '03': '#8b5cf6', // Purple - Header Verified
  '04': '#3b82f6', // Blue - Sent For Coding
  '05': '#ec4899', // Pink - Coding Complete
  '06': '#f59e0b', // Amber - Waiting For Approval
  '07': '#14b8a6', // Teal - Approved
  '08': '#10b981', // Emerald - Ready for Payment
  '09': '#ef4444', // Red - Investigation
  '10': '#6366f1', // Indigo
  'default': '#94a3b8', // Slate
};

// Get short name from process state (e.g., "01 - Header To Be Verified" -> "Header To Be Verified")
const getShortName = (state: string): string => {
  const match = state.match(/^\d+\s*-\s*(.+)$/);
  return match ? match[1] : state;
};

// Get state number from process state (e.g., "01 - Header To Be Verified" -> "01")
const getStateNumber = (state: string): string => {
  const match = state.match(/^(\d+)/);
  return match ? match[1] : 'default';
};

// Format date with time for unique labels when multiple imports on same day
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const dateOnly = date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  const time = date.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${dateOnly} ${time}`;
};

export function ProcessStateTrendWidgets({ batches }: ProcessStateTrendWidgetsProps) {
  const [trends, setTrends] = useState<ProcessStateTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTrendData() {
      setLoading(true);
      setError(null);

      try {
        // Filter out deleted batches and sort by import timestamp (chronological order)
        // Most recent import is always last
        const batchesForChart = batches
          .filter(batch => !batch.is_deleted)
          .sort((a, b) => new Date(a.imported_at).getTime() - new Date(b.imported_at).getTime())
          .slice(-5); // Last 5 batches for faster loading

        if (batchesForChart.length < 2) {
          setTrends([]);
          setLoading(false);
          return;
        }

        // Fetch pre-calculated stats for all batches in a single query
        const batchIds = batchesForChart.map(b => b.id);
        const { data: statsData, error: statsError } = await supabase
          .from('batch_stats')
          .select('batch_id, process_state_counts')
          .in('batch_id', batchIds);

        if (statsError) {
          console.error('Failed to fetch batch stats:', statsError.message);
          setError('Failed to load process state trends');
          setLoading(false);
          return;
        }

        // Build a map of batch_id -> process_state_counts
        const statsMap = new Map<string, Record<string, { count: number; value: number }>>();
        statsData?.forEach(stat => {
          statsMap.set(stat.batch_id, stat.process_state_counts || {});
        });

        // Collect all unique states across all batches
        const allStates = new Set<string>();
        statsData?.forEach(stat => {
          Object.keys(stat.process_state_counts || {}).forEach(state => allStates.add(state));
        });

        // Build trend data for each state
        const processStateTrends: ProcessStateTrend[] = [];

        allStates.forEach(state => {
          const trendData: StateTrendData[] = batchesForChart.map(batch => {
            const batchStats = statsMap.get(batch.id);
            const stateData = batchStats?.[state];
            return {
              date: formatDate(batch.imported_at),
              count: stateData?.count || 0,
              value: stateData?.value || 0,
              filename: batch.filename
            };
          });

          const firstCount = trendData[0]?.count || 0;
          const lastCount = trendData[trendData.length - 1]?.count || 0;
          const change = lastCount - firstCount;
          const stateNum = getStateNumber(state);
          const color = STATE_COLORS[stateNum] || STATE_COLORS['default'];

          processStateTrends.push({
            state,
            shortName: getShortName(state),
            data: trendData,
            color,
            change,
            currentCount: lastCount
          });
        });

        // Sort by state number
        processStateTrends.sort((a, b) => {
          const aNum = parseInt(getStateNumber(a.state)) || 999;
          const bNum = parseInt(getStateNumber(b.state)) || 999;
          return aNum - bNum;
        });

        // Filter out states with no data in the most recent batch
        const trendsWithData = processStateTrends.filter(t => t.currentCount > 0 || t.change !== 0);

        setTrends(trendsWithData.length > 0 ? trendsWithData : []);
      } catch (err) {
        console.error('Error fetching process state trends:', err);
        setError(err instanceof Error ? err.message : 'Failed to load process state trends');
        setTrends([]);
      } finally {
        setLoading(false);
      }
    }

    fetchTrendData();
  }, [batches]);

  if (loading) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Process State Trends</h3>
        <div className="h-48 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Process State Trends</h3>
        <div className="h-48 flex items-center justify-center text-red-400">
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

  if (trends.length === 0) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Process State Trends</h3>
        <div className="h-48 flex items-center justify-center text-slate-500">
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

  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Process State Trends</h3>
      <p className="text-sm text-slate-400 mb-6">Invoice count trend for each progress state across uploads</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {trends.map((trend) => (
          <TrendWidget key={trend.state} trend={trend} />
        ))}
      </div>
    </div>
  );
}

interface TrendWidgetProps {
  trend: ProcessStateTrend;
}

function TrendWidget({ trend }: TrendWidgetProps) {
  const isPositiveChange = trend.change > 0;
  const isNegativeChange = trend.change < 0;

  return (
    <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50 hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-slate-300 truncate" title={trend.state}>
            {trend.shortName}
          </h4>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-bold text-white">{trend.currentCount.toLocaleString()}</span>
            <span 
              className={`flex items-center text-xs font-medium ${
                isNegativeChange ? 'text-emerald-400' : isPositiveChange ? 'text-rose-400' : 'text-slate-400'
              }`}
            >
              {trend.change !== 0 && (
                <svg className="w-3 h-3 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d={isNegativeChange ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} 
                  />
                </svg>
              )}
              {trend.change > 0 ? '+' : ''}{trend.change.toLocaleString()}
            </span>
          </div>
        </div>
        <div 
          className="w-3 h-3 rounded-full flex-shrink-0 mt-1"
          style={{ backgroundColor: trend.color }}
        />
      </div>
      
      <div className="h-16 mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trend.data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <Tooltip
              contentStyle={{ 
                backgroundColor: '#1e293b', 
                border: '1px solid #334155', 
                borderRadius: '6px', 
                color: '#f8fafc',
                fontSize: '11px',
                padding: '8px'
              }}
              formatter={(value: number) => [value.toLocaleString(), 'Count']}
              labelFormatter={(label) => `${label}`}
              isAnimationActive={false}
            />
            <Line 
              type="monotone" 
              dataKey="count" 
              stroke={trend.color} 
              strokeWidth={2} 
              dot={false}
              activeDot={{ r: 3, fill: trend.color }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}


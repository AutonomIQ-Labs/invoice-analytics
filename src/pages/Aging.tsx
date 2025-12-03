import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Invoice } from '../types/database';
import { Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend, ComposedChart, Line } from 'recharts';

const formatCurrency = (value: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', notation: 'compact', maximumFractionDigits: 1 }).format(value);
const formatFullCurrency = (value: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2 }).format(value);

// Monthly buckets configuration
const MONTHLY_BUCKETS = [
  { min: 90, max: 120, bucket: '90-120', label: '90-120 days', color: '#22d3ee' },
  { min: 120, max: 150, bucket: '120-150', label: '120-150 days', color: '#38bdf8' },
  { min: 150, max: 180, bucket: '150-180', label: '150-180 days', color: '#60a5fa' },
  { min: 180, max: 210, bucket: '180-210', label: '180-210 days', color: '#818cf8' },
  { min: 210, max: 240, bucket: '210-240', label: '210-240 days', color: '#a78bfa' },
  { min: 240, max: 270, bucket: '240-270', label: '240-270 days', color: '#c084fc' },
  { min: 270, max: 300, bucket: '270-300', label: '270-300 days', color: '#e879f9' },
  { min: 300, max: 330, bucket: '300-330', label: '300-330 days', color: '#f472b6' },
  { min: 330, max: 360, bucket: '330-360', label: '330-360 days', color: '#fb7185' },
  { min: 360, max: Infinity, bucket: '360+', label: '360+ days', color: '#ef4444' },
];

interface AgingBucketData {
  bucket: string;
  label: string;
  color: string;
  count: number;
  value: number;
  avgAmount: number;
  topVendors: { name: string; count: number; value: number }[];
  invoices: Invoice[];
}

export function Aging() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [bucketData, setBucketData] = useState<AgingBucketData[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'count' | 'value'>('value');

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      
      // Get current batch first
      const { data: batchData } = await supabase
        .from('import_batches')
        .select('id')
        .eq('is_current', true)
        .single();
      
      if (!batchData) {
        console.error('No current batch found');
        setLoading(false);
        return;
      }

      // Fetch only invoices from current batch
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('import_batch_id', batchData.id);
      
      if (error) {
        console.error('Error fetching invoices:', error);
        setLoading(false);
        return;
      }

      const invoices = (data as Invoice[]) || [];

      // Calculate data for each bucket
      const processedBuckets = MONTHLY_BUCKETS.map(({ min, max, bucket, label, color }) => {
        const filtered = invoices.filter(inv => {
          const days = inv.days_old || 0;
          return days >= min && days < max;
        });

        // Top vendors in this bucket
        const vendorMap = new Map<string, { count: number; value: number }>();
        filtered.forEach(inv => {
          const vendor = inv.supplier || 'Unknown';
          const existing = vendorMap.get(vendor) || { count: 0, value: 0 };
          vendorMap.set(vendor, {
            count: existing.count + 1,
            value: existing.value + (inv.invoice_amount || 0),
          });
        });
        const topVendors = Array.from(vendorMap.entries())
          .map(([name, data]) => ({ name, ...data }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 5);

        const totalValue = filtered.reduce((sum, inv) => sum + (inv.invoice_amount || 0), 0);

        return {
          bucket,
          label,
          color,
          count: filtered.length,
          value: totalValue,
          avgAmount: filtered.length > 0 ? totalValue / filtered.length : 0,
          topVendors,
          invoices: filtered,
        };
      });

      setBucketData(processedBuckets);
      setLoading(false);
    }

    fetchData();
  }, []);

  const totalInvoices = bucketData.reduce((sum, b) => sum + b.count, 0);
  const totalValue = bucketData.reduce((sum, b) => sum + b.value, 0);
  const selectedBucketData = selectedBucket ? bucketData.find(b => b.bucket === selectedBucket) : null;

  // Cumulative data for trend line
  let cumCount = 0;
  let cumValue = 0;
  const chartData = bucketData.map(b => {
    cumCount += b.count;
    cumValue += b.value;
    return {
      ...b,
      cumCount,
      cumValue,
      pctCount: totalInvoices > 0 ? (b.count / totalInvoices * 100) : 0,
      pctValue: totalValue > 0 ? (b.value / totalValue * 100) : 0,
    };
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-400">Loading aging data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Monthly Aging Analysis</h1>
          <p className="text-slate-400 mt-1">Invoice aging breakdown by 30-day intervals</p>
        </div>
        <div className="flex gap-2">
          <div className="flex gap-1 bg-slate-700/50 rounded-lg p-1">
            <button onClick={() => setViewMode('count')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === 'count' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'}`}>Count</button>
            <button onClick={() => setViewMode('value')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === 'value' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'}`}>Value</button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold text-white">{totalInvoices.toLocaleString()}</p>
          <p className="text-sm text-slate-400">Total Invoices</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold text-sky-400">{formatCurrency(totalValue)}</p>
          <p className="text-sm text-slate-400">Total Value</p>
        </div>
        <div className="card p-4 text-center bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 border-cyan-500/30">
          <p className="text-2xl font-bold text-cyan-400">{bucketData.slice(0, 3).reduce((s, b) => s + b.count, 0).toLocaleString()}</p>
          <p className="text-sm text-slate-400">90-180 days</p>
        </div>
        <div className="card p-4 text-center bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/30">
          <p className="text-2xl font-bold text-purple-400">{bucketData.slice(3, 6).reduce((s, b) => s + b.count, 0).toLocaleString()}</p>
          <p className="text-sm text-slate-400">180-270 days</p>
        </div>
        <div className="card p-4 text-center bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/30">
          <p className="text-2xl font-bold text-red-400">{bucketData.slice(6).reduce((s, b) => s + b.count, 0).toLocaleString()}</p>
          <p className="text-sm text-slate-400">270+ days</p>
        </div>
      </div>

      {/* Main Chart */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Aging Distribution</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                dataKey="bucket" 
                stroke="#94a3b8" 
                tick={{ fill: '#94a3b8', fontSize: 11 }} 
                angle={-45}
                textAnchor="end"
                height={50}
              />
              <YAxis 
                yAxisId="left"
                stroke="#94a3b8" 
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                tickFormatter={viewMode === 'value' ? formatCurrency : undefined}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                stroke="#94a3b8" 
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                tickFormatter={(v) => `${v.toFixed(0)}%`}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                formatter={(value: number, name: string) => {
                  if (name === 'value') return [formatFullCurrency(value), 'Value'];
                  if (name === 'count') return [value.toLocaleString(), 'Count'];
                  if (name === 'pctValue') return [`${value.toFixed(1)}%`, '% of Value'];
                  if (name === 'pctCount') return [`${value.toFixed(1)}%`, '% of Count'];
                  return [value, name];
                }}
              />
              <Legend />
              <Bar 
                yAxisId="left"
                dataKey={viewMode} 
                name={viewMode === 'value' ? 'Value' : 'Count'}
                radius={[4, 4, 0, 0]}
                onClick={(data: any) => setSelectedBucket(data.bucket)}
                cursor="pointer"
              >
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.color}
                    opacity={selectedBucket && selectedBucket !== entry.bucket ? 0.4 : 1}
                  />
                ))}
              </Bar>
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey={viewMode === 'value' ? 'pctValue' : 'pctCount'} 
                name={viewMode === 'value' ? '% of Value' : '% of Count'}
                stroke="#f59e0b" 
                strokeWidth={2}
                dot={{ fill: '#f59e0b', r: 4 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bucket Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {bucketData.map((bucket) => (
          <button
            key={bucket.bucket}
            onClick={() => setSelectedBucket(selectedBucket === bucket.bucket ? null : bucket.bucket)}
            className={`card p-4 text-left transition-all ${
              selectedBucket === bucket.bucket 
                ? 'ring-2 ring-sky-500 bg-sky-500/10' 
                : 'hover:bg-slate-700/30'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: bucket.color }}></div>
              <span className="text-sm font-medium text-white">{bucket.bucket}</span>
            </div>
            <p className="text-xl font-bold text-white">{bucket.count.toLocaleString()}</p>
            <p className="text-sm text-slate-400">{formatCurrency(bucket.value)}</p>
            <p className="text-xs text-slate-500 mt-1">
              {totalInvoices > 0 ? ((bucket.count / totalInvoices) * 100).toFixed(1) : 0}% of total
            </p>
          </button>
        ))}
      </div>

      {/* Selected Bucket Details */}
      {selectedBucketData && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: selectedBucketData.color }}></div>
              <h3 className="text-lg font-semibold text-white">{selectedBucketData.label}</h3>
            </div>
            <button 
              onClick={() => navigate(`/invoices?minDays=${MONTHLY_BUCKETS.find(b => b.bucket === selectedBucket)?.min}&maxDays=${MONTHLY_BUCKETS.find(b => b.bucket === selectedBucket)?.max === Infinity ? 9999 : MONTHLY_BUCKETS.find(b => b.bucket === selectedBucket)?.max}`)}
              className="btn-secondary text-sm"
            >
              View All {selectedBucketData.count} Invoices →
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Stats */}
            <div className="space-y-3">
              <div className="bg-slate-800/50 rounded-lg p-4">
                <p className="text-2xl font-bold text-white">{selectedBucketData.count.toLocaleString()}</p>
                <p className="text-sm text-slate-400">Invoices</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4">
                <p className="text-2xl font-bold text-sky-400">{formatFullCurrency(selectedBucketData.value)}</p>
                <p className="text-sm text-slate-400">Total Value</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4">
                <p className="text-2xl font-bold text-amber-400">{formatFullCurrency(selectedBucketData.avgAmount)}</p>
                <p className="text-sm text-slate-400">Avg Invoice Amount</p>
              </div>
            </div>

            {/* Top Vendors */}
            <div className="md:col-span-2">
              <h4 className="text-sm font-medium text-slate-400 mb-3">Top Vendors in this Bucket</h4>
              <div className="space-y-2">
                {selectedBucketData.topVendors.map((vendor, index) => (
                  <button
                    key={vendor.name}
                    onClick={() => navigate(`/invoices?vendor=${encodeURIComponent(vendor.name)}`)}
                    className="w-full flex items-center justify-between bg-slate-800/30 rounded-lg p-3 hover:bg-slate-700/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-500">#{index + 1}</span>
                      <span className="text-sm text-white truncate max-w-[250px]">{vendor.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <span className="text-sm text-slate-400">{vendor.count} inv</span>
                      <span className="text-sm font-medium text-sky-400">{formatCurrency(vendor.value)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pie Chart Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-white mb-4">By Invoice Count</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={bucketData as any[]}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="count"
                  nameKey="bucket"
                >
                  {bucketData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  formatter={(value: number) => [value.toLocaleString(), 'Invoices']}
                />
                <Legend 
                  layout="vertical" 
                  align="right" 
                  verticalAlign="middle"
                  formatter={(value) => <span className="text-slate-300 text-xs">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-semibold text-white mb-4">By Total Value</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={bucketData as any[]}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="bucket"
                >
                  {bucketData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  formatter={(value: number) => [formatFullCurrency(value), 'Value']}
                />
                <Legend 
                  layout="vertical" 
                  align="right" 
                  verticalAlign="middle"
                  formatter={(value) => <span className="text-slate-300 text-xs">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}


import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Invoice } from '../types/database';
import { getMonthlyBuckets } from '../hooks/useInvoices';
import { Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend, ComposedChart, Line } from 'recharts';

const formatCurrency = (value: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', notation: 'compact', maximumFractionDigits: 1 }).format(value);
const formatFullCurrency = (value: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2 }).format(value);

// Colors with high visual distinction between adjacent buckets
// Progresses from green -> cyan -> blue -> purple -> pink -> red as aging increases
const COLORS = [
  '#22c55e', // 0-30: bright green
  '#06b6d4', // 30-60: cyan (distinctly different from green)
  '#3b82f6', // 60-90: blue (distinctly different from cyan)
  '#8b5cf6', // 90-120: violet
  '#a855f7', // 120-150: purple
  '#d946ef', // 150-180: fuchsia
  '#ec4899', // 180-210: pink
  '#f43f5e', // 210-240: rose
  '#ef4444', // 240-270: red
  '#f97316', // 270-300: orange
  '#eab308', // 300-330: yellow
  '#84cc16', // 330-360: lime
  '#dc2626', // 360+: dark red
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
      setSelectedBucket(null);
      
      // Get current batch
      const { data: batchData } = await supabase
        .from('import_batches')
        .select('id')
        .eq('is_current', true)
        .or('is_deleted.is.null,is_deleted.eq.false')
        .maybeSingle();
      
      if (!batchData) {
        setBucketData([]);
        setLoading(false);
        return;
      }

      // Fetch ALL invoices using pagination
      const allInvoices: Invoice[] = [];
      const pageSize = 1000;
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        
        const { data, error } = await supabase
          .from('invoices')
          .select('*')
          .eq('import_batch_id', batchData.id)
          .range(from, to);
        
        if (error) {
          console.error('Error fetching invoices:', error);
          setLoading(false);
          return;
        }

        const pageData = (data as Invoice[]) || [];
        
        // Filter to only include invoices marked for analysis (exclude outliers that are not included)
        const includedInvoices = pageData.filter(inv => 
          inv.include_in_analysis === true || inv.include_in_analysis === null || inv.include_in_analysis === undefined
        );
        allInvoices.push(...includedInvoices);
        
        hasMore = pageData.length === pageSize;
        page++;
      }

      const invoices = allInvoices;
      
      // Get unified monthly buckets
      const monthlyBuckets = getMonthlyBuckets();

      // Calculate data for each bucket
      const processedBuckets = monthlyBuckets.map(({ min, max, bucket, label }, index) => {
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
          color: COLORS[index % COLORS.length],
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
    
    const handleBatchDeleted = () => fetchData();
    const handleOutlierChanged = () => fetchData();
    
    window.addEventListener('batchDeleted', handleBatchDeleted);
    window.addEventListener('outlierChanged', handleOutlierChanged);
    
    return () => {
      window.removeEventListener('batchDeleted', handleBatchDeleted);
      window.removeEventListener('outlierChanged', handleOutlierChanged);
    };
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

  // Summary stats
  const summaryStats = [
    { label: '0-90 days', count: bucketData.filter(b => ['0-30', '30-60', '60-90'].includes(b.bucket)).reduce((s, b) => s + b.count, 0), colorClass: 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/30', textColor: 'text-emerald-400' },
    { label: '90-180 days', count: bucketData.filter(b => ['90-120', '120-150', '150-180'].includes(b.bucket)).reduce((s, b) => s + b.count, 0), colorClass: 'from-cyan-500/10 to-cyan-500/5 border-cyan-500/30', textColor: 'text-cyan-400' },
    { label: '180+ days', count: bucketData.filter(b => !['0-30', '30-60', '60-90', '90-120', '120-150', '150-180'].includes(b.bucket)).reduce((s, b) => s + b.count, 0), colorClass: 'from-red-500/10 to-red-500/5 border-red-500/30', textColor: 'text-red-400' },
  ];

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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Aging Analysis</h1>
          <p className="text-slate-400 mt-1">Invoice aging breakdown by 30-day intervals</p>
        </div>
        <div className="flex gap-1 bg-slate-700/50 rounded-lg p-1">
          <button onClick={() => setViewMode('count')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === 'count' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'}`}>Count</button>
          <button onClick={() => setViewMode('value')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === 'value' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'}`}>Value</button>
        </div>
      </div>

      {bucketData.length === 0 ? (
        <div className="card p-12 text-center">
          <svg className="w-16 h-16 mx-auto mb-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-xl font-semibold text-white mb-2">No Data Available</h3>
          <p className="text-slate-400 mb-6">Import invoice data to see aging analysis</p>
          <button onClick={() => navigate('/import')} className="btn-primary">Import Data</button>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="card p-4 text-center">
              <p className="text-3xl font-bold text-white">{totalInvoices.toLocaleString()}</p>
              <p className="text-sm text-slate-400">Total Invoices</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-3xl font-bold text-sky-400">{formatCurrency(totalValue)}</p>
              <p className="text-sm text-slate-400">Total Value</p>
            </div>
            {summaryStats.map((stat, index) => (
              <div key={index} className={`card p-4 text-center bg-gradient-to-br ${stat.colorClass}`}>
                <p className={`text-2xl font-bold ${stat.textColor}`}>{stat.count.toLocaleString()}</p>
                <p className="text-sm text-slate-400">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Main Chart */}
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Aging Distribution</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={200}>
                <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="bucket" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 11 }} angle={-45} textAnchor="end" height={50} />
                  <YAxis yAxisId="left" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={viewMode === 'value' ? formatCurrency : undefined} />
                  <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
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
                  <Bar yAxisId="left" dataKey={viewMode} name={viewMode === 'value' ? 'Value' : 'Count'} radius={[4, 4, 0, 0]} onClick={(data: any) => setSelectedBucket(data.bucket)} cursor="pointer">
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} opacity={selectedBucket && selectedBucket !== entry.bucket ? 0.4 : 1} />
                    ))}
                  </Bar>
                  <Line yAxisId="right" type="monotone" dataKey={viewMode === 'value' ? 'pctValue' : 'pctCount'} name={viewMode === 'value' ? '% of Value' : '% of Count'} stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bucket Grid */}
          <div className="grid gap-3 grid-cols-2 md:grid-cols-5 lg:grid-cols-7">
            {bucketData.map((bucket) => (
              <button
                key={bucket.bucket}
                onClick={() => setSelectedBucket(selectedBucket === bucket.bucket ? null : bucket.bucket)}
                className={`card p-4 text-left transition-all ${selectedBucket === bucket.bucket ? 'ring-2 ring-sky-500 bg-sky-500/10' : 'hover:bg-slate-700/30'}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: bucket.color }}></div>
                  <span className="text-sm font-medium text-white">{bucket.bucket}</span>
                </div>
                <p className="text-xl font-bold text-white">{bucket.count.toLocaleString()}</p>
                <p className="text-sm text-slate-400">{formatCurrency(bucket.value)}</p>
                <p className="text-xs text-slate-500 mt-1">{totalInvoices > 0 ? ((bucket.count / totalInvoices) * 100).toFixed(1) : 0}% of total</p>
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
                  onClick={() => {
                    const bucketConfig = getMonthlyBuckets().find(b => b.bucket === selectedBucket);
                    if (bucketConfig) {
                      navigate(`/invoices?minDays=${bucketConfig.min}&maxDays=${bucketConfig.max === Infinity ? 9999 : bucketConfig.max}`);
                    }
                  }}
                  className="btn-secondary text-sm"
                >
                  View All {selectedBucketData.count} Invoices
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                    <Pie data={bucketData as any[]} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="count" nameKey="bucket">
                      {bucketData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} formatter={(value: number) => [value.toLocaleString(), 'Invoices']} />
                    <Legend 
                      layout="vertical" 
                      align="right" 
                      verticalAlign="middle" 
                      payload={bucketData.map((entry) => ({
                        value: entry.bucket,
                        type: 'circle' as const,
                        color: entry.color,
                      }))}
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
                    <Pie data={bucketData as any[]} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value" nameKey="bucket">
                      {bucketData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} formatter={(value: number) => [formatFullCurrency(value), 'Value']} />
                    <Legend 
                      layout="vertical" 
                      align="right" 
                      verticalAlign="middle" 
                      payload={bucketData.map((entry) => ({
                        value: entry.bucket,
                        type: 'circle' as const,
                        color: entry.color,
                      }))}
                      formatter={(value) => <span className="text-slate-300 text-xs">{value}</span>} 
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Invoice } from '../types/database';

interface OutlierStats {
  totalOutliers: number;
  highValueCount: number;
  negativeCount: number;
  includedCount: number;
  excludedCount: number;
  totalValue: number;
  includedValue: number;
}

export function Outliers() {
  const [outliers, setOutliers] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<OutlierStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [filter, setFilter] = useState<'all' | 'high_value' | 'negative'>('all');
  const [showIncluded, setShowIncluded] = useState<'all' | 'included' | 'excluded'>('all');

  const fetchOutliers = useCallback(async () => {
    setLoading(true);
    try {
      // Get current batch ID
      const { data: batchData } = await supabase
        .from('import_batches')
        .select('id')
        .eq('is_current', true)
        .or('is_deleted.is.null,is_deleted.eq.false')
        .maybeSingle();

      if (!batchData) {
        setOutliers([]);
        setStats(null);
        setLoading(false);
        return;
      }

      // Fetch ALL outliers using pagination (Supabase has 1000 row limit per request)
      const allOutliers: Invoice[] = [];
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
          .eq('is_outlier', true)
          .order('invoice_amount', { ascending: false })
          .range(from, to);

        if (error) throw error;

        const pageData = (data as Invoice[]) || [];
        allOutliers.push(...pageData);

        hasMore = pageData.length === pageSize;
        page++;
      }

      const outlierData = allOutliers;
      setOutliers(outlierData);

      // Calculate stats
      const highValueCount = outlierData.filter(o => o.outlier_reason === 'high_value').length;
      const negativeCount = outlierData.filter(o => o.outlier_reason === 'negative').length;
      const includedCount = outlierData.filter(o => o.include_in_analysis).length;
      const excludedCount = outlierData.filter(o => !o.include_in_analysis).length;
      const totalValue = outlierData.reduce((sum, o) => sum + Math.abs(o.invoice_amount || 0), 0);
      const includedValue = outlierData.filter(o => o.include_in_analysis).reduce((sum, o) => sum + Math.abs(o.invoice_amount || 0), 0);

      setStats({
        totalOutliers: outlierData.length,
        highValueCount,
        negativeCount,
        includedCount,
        excludedCount,
        totalValue,
        includedValue,
      });
    } catch (err) {
      console.error('Error fetching outliers:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOutliers();
  }, [fetchOutliers]);

  const toggleInclusion = async (invoice: Invoice) => {
    setUpdating(invoice.id);
    try {
      const newValue = !invoice.include_in_analysis;
      const { error } = await supabase
        .from('invoices')
        .update({ include_in_analysis: newValue })
        .eq('id', invoice.id);

      if (error) throw error;

      // Update local state
      setOutliers(prev => prev.map(o => 
        o.id === invoice.id ? { ...o, include_in_analysis: newValue } : o
      ));

      // Update stats
      setStats(prev => {
        if (!prev) return prev;
        const change = newValue ? 1 : -1;
        const valueChange = Math.abs(invoice.invoice_amount || 0);
        return {
          ...prev,
          includedCount: prev.includedCount + change,
          excludedCount: prev.excludedCount - change,
          includedValue: prev.includedValue + (newValue ? valueChange : -valueChange),
        };
      });

      // Dispatch event to refresh dashboard stats
      window.dispatchEvent(new CustomEvent('outlierChanged'));
    } catch (err) {
      console.error('Error updating invoice:', err);
    } finally {
      setUpdating(null);
    }
  };

  const bulkToggle = async (include: boolean, type?: 'high_value' | 'negative') => {
    setBulkUpdating(true);
    try {
      // Get current batch ID
      const { data: batchData } = await supabase
        .from('import_batches')
        .select('id')
        .eq('is_current', true)
        .or('is_deleted.is.null,is_deleted.eq.false')
        .maybeSingle();

      if (!batchData) return;

      let query = supabase
        .from('invoices')
        .update({ include_in_analysis: include })
        .eq('import_batch_id', batchData.id)
        .eq('is_outlier', true);

      if (type) {
        query = query.eq('outlier_reason', type);
      }

      const { error } = await query;
      if (error) throw error;

      // Refresh data
      await fetchOutliers();

      // Dispatch event to refresh dashboard stats
      window.dispatchEvent(new CustomEvent('outlierChanged'));
    } catch (err) {
      console.error('Error bulk updating:', err);
    } finally {
      setBulkUpdating(false);
    }
  };

  const filteredOutliers = outliers.filter(o => {
    if (filter !== 'all' && o.outlier_reason !== filter) return false;
    if (showIncluded === 'included' && !o.include_in_analysis) return false;
    if (showIncluded === 'excluded' && o.include_in_analysis) return false;
    return true;
  });

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Outlier Management</h1>
        <p className="text-slate-400 mt-1">Review and manage invoices flagged as outliers (&gt;$50K or negative amounts)</p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.totalOutliers.toLocaleString()}</p>
                <p className="text-xs text-slate-400">Total Outliers</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.highValueCount.toLocaleString()}</p>
                <p className="text-xs text-slate-400">High Value (&gt;$50K)</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.negativeCount.toLocaleString()}</p>
                <p className="text-xs text-slate-400">Negative</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.includedCount.toLocaleString()}</p>
                <p className="text-xs text-slate-400">Included</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.excludedCount.toLocaleString()}</p>
                <p className="text-xs text-slate-400">Excluded</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-sky-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-lg font-bold text-white">{formatCurrency(stats.totalValue)}</p>
                <p className="text-xs text-slate-400">Total Value</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Actions */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Bulk Actions:</span>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => bulkToggle(true)}
              disabled={bulkUpdating}
              className="px-3 py-1.5 text-sm font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition-colors disabled:opacity-50"
            >
              Include All
            </button>
            <button
              onClick={() => bulkToggle(false)}
              disabled={bulkUpdating}
              className="px-3 py-1.5 text-sm font-medium text-slate-400 bg-slate-500/10 hover:bg-slate-500/20 border border-slate-500/30 rounded-lg transition-colors disabled:opacity-50"
            >
              Exclude All
            </button>
            <div className="w-px h-6 bg-slate-700"></div>
            <button
              onClick={() => bulkToggle(true, 'high_value')}
              disabled={bulkUpdating}
              className="px-3 py-1.5 text-sm font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg transition-colors disabled:opacity-50"
            >
              Include High Value
            </button>
            <button
              onClick={() => bulkToggle(true, 'negative')}
              disabled={bulkUpdating}
              className="px-3 py-1.5 text-sm font-medium text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded-lg transition-colors disabled:opacity-50"
            >
              Include Negative
            </button>
          </div>

          {bulkUpdating && (
            <div className="flex items-center gap-2 text-sky-400">
              <div className="w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm">Updating...</span>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Filter by Type:</span>
            <div className="flex gap-1">
              {(['all', 'high_value', 'negative'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    filter === f
                      ? 'bg-sky-500 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'high_value' ? 'High Value' : 'Negative'}
                </button>
              ))}
            </div>
          </div>

          <div className="w-px h-6 bg-slate-700"></div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Status:</span>
            <div className="flex gap-1">
              {(['all', 'included', 'excluded'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setShowIncluded(s)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    showIncluded === s
                      ? 'bg-sky-500 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="ml-auto text-sm text-slate-400">
            Showing {filteredOutliers.length} of {outliers.length} outliers
          </div>
        </div>
      </div>

      {/* Outliers Table */}
      <div className="card overflow-hidden">
        {outliers.length === 0 ? (
          <div className="p-12 text-center">
            <svg className="w-16 h-16 mx-auto text-slate-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-slate-400 text-lg">No outliers detected</p>
            <p className="text-slate-500 text-sm mt-1">All invoices are within normal ranges</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Include</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Invoice #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Supplier</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Process State</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Days Old</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {filteredOutliers.map(invoice => (
                  <tr key={invoice.id} className={`hover:bg-slate-800/30 ${!invoice.include_in_analysis ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleInclusion(invoice)}
                        disabled={updating === invoice.id}
                        className={`w-10 h-6 rounded-full transition-colors relative ${
                          invoice.include_in_analysis ? 'bg-emerald-500' : 'bg-slate-600'
                        } ${updating === invoice.id ? 'opacity-50' : ''}`}
                      >
                        <span
                          className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                            invoice.include_in_analysis ? 'left-5' : 'left-1'
                          }`}
                        />
                        {updating === invoice.id && (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        invoice.outlier_reason === 'high_value'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-purple-500/20 text-purple-400'
                      }`}>
                        {invoice.outlier_reason === 'high_value' ? '> $50K' : 'Negative'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-white font-medium">{invoice.invoice_number || invoice.invoice_id || '-'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-300 truncate max-w-[200px]">{invoice.supplier || '-'}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className={`text-sm font-medium ${
                        (invoice.invoice_amount || 0) < 0 ? 'text-purple-400' : 'text-red-400'
                      }`}>
                        {formatCurrency(invoice.invoice_amount)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-400">{invoice.overall_process_state || '-'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-400">{invoice.days_old ?? '-'}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="card p-4 bg-sky-500/5 border-sky-500/20">
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm text-sky-400 font-medium">About Outliers</p>
            <p className="text-sm text-slate-400 mt-1">
              Invoices are flagged as outliers if they exceed $50,000 or have negative amounts. 
              By default, outliers are excluded from dashboard analytics to prevent skewing the data. 
              Toggle individual invoices or use bulk actions to include them in your analysis.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}


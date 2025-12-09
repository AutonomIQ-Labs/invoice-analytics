import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { ImportBatch } from '../../types/database';

export function LastImportSummary() {
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLastBatch = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('import_batches')
          .select('*')
          .eq('is_current', true)
          .or('is_deleted.is.null,is_deleted.eq.false')
          .maybeSingle();
        
        setBatch(data as ImportBatch | null);
      } catch (error) {
        console.error('Error fetching last import:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLastBatch();

    // Listen for import complete events to refresh
    const handleImportComplete = () => fetchLastBatch();
    window.addEventListener('importComplete', handleImportComplete);
    return () => window.removeEventListener('importComplete', handleImportComplete);
  }, []);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  if (loading) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white">Last Import Summary</h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-slate-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white">Last Import Summary</h3>
        </div>
        <div className="text-center py-6">
          <svg className="w-12 h-12 mx-auto text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-slate-400">No imports yet</p>
          <p className="text-slate-500 text-sm mt-1">Upload a CSV file to get started</p>
        </div>
      </div>
    );
  }

  const hasDetailedStats = batch.skipped_zero_value !== undefined || batch.outlier_count !== undefined;

  return (
    <div className="card p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center">
          <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Last Import Summary</h3>
          <p className="text-xs text-slate-500">{batch.filename} • {formatDate(batch.imported_at)}</p>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Imported */}
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-xs text-emerald-400 font-medium">Imported</span>
          </div>
          <p className="text-2xl font-bold text-white">{batch.record_count.toLocaleString()}</p>
        </div>

        {/* Total Skipped */}
        <div className="bg-slate-500/10 border border-slate-500/20 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
            <span className="text-xs text-slate-400 font-medium">Total Skipped</span>
          </div>
          <p className="text-2xl font-bold text-white">{batch.skipped_count.toLocaleString()}</p>
        </div>
      </div>

      {/* Detailed Skip Breakdown */}
      {hasDetailedStats && (
        <>
          <div className="border-t border-slate-700/50 pt-4 mb-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Skip Breakdown</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2">
                <span className="text-sm text-slate-400">Zero Value</span>
                <span className="text-sm font-semibold text-amber-400">
                  {(batch.skipped_zero_value ?? 0).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2">
                <span className="text-sm text-slate-400">Fully Paid</span>
                <span className="text-sm font-semibold text-blue-400">
                  {(batch.skipped_fully_paid ?? 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Outlier Stats */}
          {(batch.outlier_count ?? 0) > 0 && (
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-sm text-orange-400 font-medium">Outliers Flagged</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-orange-400">{(batch.outlier_count ?? 0).toLocaleString()}</p>
                  <p className="text-xs text-slate-500">Total</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-red-400">{(batch.outlier_high_value ?? 0).toLocaleString()}</p>
                  <p className="text-xs text-slate-500">High Value</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-purple-400">{(batch.outlier_negative ?? 0).toLocaleString()}</p>
                  <p className="text-xs text-slate-500">Negative</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Note for older imports without detailed stats */}
      {!hasDetailedStats && batch.skipped_count > 0 && (
        <div className="text-xs text-slate-500 text-center pt-2 border-t border-slate-700/50">
          Detailed breakdown not available for this import
        </div>
      )}
    </div>
  );
}


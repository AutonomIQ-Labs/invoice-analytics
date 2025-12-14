import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { ImportBatch } from '../../types/database';

// Timeout wrapper - properly cleans up timer to avoid resource leaks
async function withTimeout<T>(promiseOrThenable: PromiseLike<T>, ms: number, fallback: T): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(`LastImportSummary: Operation timed out after ${ms}ms`);
      resolve(fallback);
    }, ms);
  });
  
  try {
    const result = await Promise.race([Promise.resolve(promiseOrThenable), timeoutPromise]);
    return result;
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}

export function LastImportSummary() {
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLastBatch = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await withTimeout(
          supabase
            .from('import_batches')
            .select('*')
            .eq('is_current', true)
            .or('is_deleted.is.null,is_deleted.eq.false')
            .maybeSingle(),
          10000,
          { data: null, error: { message: 'Request timed out', code: 'TIMEOUT' }, count: null, status: 408, statusText: 'Timeout' } as any
        );
        
        if (result.error) {
          console.warn('LastImportSummary error:', result.error.message);
          setError(result.error.message);
        }
        
        setBatch(result.data as ImportBatch | null);
      } catch (err) {
        console.error('Error fetching last import:', err);
        setError('Failed to load');
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

  if (error) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white">Last Import Summary</h3>
        </div>
        <div className="text-center py-4">
          <p className="text-slate-400 text-sm">Unable to load import data</p>
          <p className="text-slate-500 text-xs mt-1">{error}</p>
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

  const outlierCount = batch.outlier_count ?? 0;

  return (
    <div className="card p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
          <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Last Import Summary</h3>
          <p className="text-xs text-slate-500">{batch.filename} • {formatDate(batch.imported_at)}</p>
        </div>
      </div>

      {/* Main Stats Grid - matches CsvUploader layout */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Imported */}
        <div className="bg-slate-800/50 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-emerald-400">{batch.record_count.toLocaleString()}</p>
          <p className="text-xs text-slate-400">Imported</p>
        </div>
        {/* Skipped */}
        <div className="bg-slate-800/50 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-slate-400">{batch.skipped_count.toLocaleString()}</p>
          <p className="text-xs text-slate-400">Skipped (Total)</p>
        </div>
      </div>

      {/* Skipped Breakdown - show if any were skipped */}
      {batch.skipped_count > 0 && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-blue-400 font-medium">Filtered Out</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center">
              <p className="text-xl font-bold text-blue-400">{(batch.skipped_fully_paid ?? 0).toLocaleString()}</p>
              <p className="text-xs text-slate-400">Fully Paid (09)</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-slate-400">{(batch.skipped_zero_value ?? 0).toLocaleString()}</p>
              <p className="text-xs text-slate-400">Zero Value</p>
            </div>
          </div>
        </div>
      )}

      {/* Outlier Stats - matches CsvUploader layout */}
      {outlierCount > 0 && (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-orange-400 font-medium">Outliers Detected</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-xl font-bold text-orange-400">{outlierCount.toLocaleString()}</p>
              <p className="text-xs text-slate-400">Total Outliers</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-red-400">{(batch.outlier_high_value ?? 0).toLocaleString()}</p>
              <p className="text-xs text-slate-400">High Value</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-purple-400">{(batch.outlier_negative ?? 0).toLocaleString()}</p>
              <p className="text-xs text-slate-400">Negative</p>
            </div>
          </div>
          <p className="text-xs text-orange-400/70 mt-3 text-center">
            Outliers are imported but excluded from analysis by default.
          </p>
        </div>
      )}

    </div>
  );
}

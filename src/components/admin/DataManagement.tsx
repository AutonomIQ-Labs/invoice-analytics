import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { ImportBatch } from '../../types/database';

interface BatchWithUser extends ImportBatch {
  profiles?: {
    email: string;
    display_name: string | null;
  } | null;
}

export function DataManagement() {
  const [batches, setBatches] = useState<BatchWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({
    totalBatches: 0,
    totalInvoices: 0,
    totalUsers: 0,
  });

  useEffect(() => {
    fetchBatches();
    fetchStats();
  }, []);

  const fetchBatches = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from('import_batches')
        .select(`
          *,
          profiles:imported_by(email, display_name)
        `)
        .eq('is_deleted', false)
        .order('imported_at', { ascending: false });

      if (error) throw error;
      setBatches(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch batches');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      // Count total batches
      const { count: batchCount } = await supabase
        .from('import_batches')
        .select('*', { count: 'exact', head: true })
        .eq('is_deleted', false);

      // Count total invoices
      const { count: invoiceCount } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true });

      // Count total users
      const { count: userCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      setStats({
        totalBatches: batchCount || 0,
        totalInvoices: invoiceCount || 0,
        totalUsers: userCount || 0,
      });
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const handleDeleteBatch = async (batchId: string) => {
    setDeletingId(batchId);
    setError(null);

    try {
      // First delete all invoices in this batch
      const { error: invoiceError } = await supabase
        .from('invoices')
        .delete()
        .eq('import_batch_id', batchId);

      if (invoiceError) throw invoiceError;

      // Then delete the batch (or mark as deleted)
      const { error: batchError } = await supabase
        .from('import_batches')
        .update({ is_deleted: true, is_current: false })
        .eq('id', batchId);

      if (batchError) throw batchError;

      setBatches(batches.filter(b => b.id !== batchId));
      setDeleteConfirmId(null);
      fetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete batch');
    } finally {
      setDeletingId(null);
    }
  };

  const handlePermanentDelete = async (batchId: string) => {
    setDeletingId(batchId);
    setError(null);

    try {
      // Delete invoices first (cascade)
      const { error: invoiceError } = await supabase
        .from('invoices')
        .delete()
        .eq('import_batch_id', batchId);

      if (invoiceError) throw invoiceError;

      // Permanently delete the batch
      const { error } = await supabase
        .from('import_batches')
        .delete()
        .eq('id', batchId);

      if (error) throw error;

      setBatches(batches.filter(b => b.id !== batchId));
      setDeleteConfirmId(null);
      fetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to permanently delete batch');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const filteredBatches = batches.filter(batch => 
    batch.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
    batch.profiles?.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{formatNumber(stats.totalBatches)}</p>
              <p className="text-xs text-slate-400">Import Batches</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{formatNumber(stats.totalInvoices)}</p>
              <p className="text-xs text-slate-400">Total Invoices</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{formatNumber(stats.totalUsers)}</p>
              <p className="text-xs text-slate-400">Registered Users</p>
            </div>
          </div>
        </div>
      </div>

      {/* Import Batches Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Import Batches</h3>
            <p className="text-sm text-slate-400">Manage all imported data batches</p>
          </div>
          <button
            onClick={() => { fetchBatches(); fetchStats(); }}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            title="Refresh"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search batches by filename or user..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Batches Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">File</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Imported By</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Records</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {filteredBatches.map((batch) => {
                const isDeleting = deletingId === batch.id;

                return (
                  <tr key={batch.id} className="hover:bg-slate-700/20 transition-colors">
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center">
                          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <span className="text-white font-medium truncate max-w-[200px]" title={batch.filename}>
                          {batch.filename}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <p className="text-sm text-slate-300">
                        {batch.profiles?.display_name || batch.profiles?.email?.split('@')[0] || 'Unknown'}
                      </p>
                      {batch.profiles?.email && (
                        <p className="text-xs text-slate-500">{batch.profiles.email}</p>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <p className="text-white font-medium">{formatNumber(batch.record_count)}</p>
                      {batch.skipped_count > 0 && (
                        <p className="text-xs text-slate-500">{batch.skipped_count} skipped</p>
                      )}
                    </td>
                    <td className="py-4 px-4 text-sm text-slate-300">
                      {formatDate(batch.imported_at)}
                    </td>
                    <td className="py-4 px-4">
                      {batch.is_current ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          Current
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium bg-slate-500/20 text-slate-400 border border-slate-500/30">
                          Historical
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center justify-end gap-2">
                        {deleteConfirmId === batch.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDeleteBatch(batch.id)}
                              disabled={isDeleting}
                              className="px-2 py-1 text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-colors disabled:opacity-50"
                            >
                              {isDeleting ? (
                                <span className="flex items-center gap-1">
                                  <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></div>
                                  Deleting...
                                </span>
                              ) : (
                                'Confirm'
                              )}
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="px-2 py-1 text-xs text-slate-400 hover:text-white transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirmId(batch.id)}
                            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Delete Batch"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredBatches.length === 0 && (
          <div className="text-center py-12">
            <svg className="w-12 h-12 text-slate-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
            <p className="text-slate-400">No import batches found</p>
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div className="pt-6 border-t border-slate-700/50">
        <h3 className="text-lg font-semibold text-red-400 mb-2">Danger Zone</h3>
        <p className="text-sm text-slate-400 mb-4">
          These actions are irreversible. Please proceed with caution.
        </p>
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">Delete All Historical Batches</p>
              <p className="text-sm text-slate-400">Remove all non-current import batches and their invoices</p>
            </div>
            <button
              onClick={() => {
                // This would need a separate confirmation flow
                alert('This feature requires additional confirmation. Please delete batches individually for now.');
              }}
              className="px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors text-sm font-medium"
            >
              Delete Historical
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

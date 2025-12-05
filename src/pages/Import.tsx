import { useState } from 'react';
import { CsvUploader } from '../components/import/CsvUploader';
import { useImportBatches } from '../hooks/useInvoices';
import type { ImportBatch } from '../types/database';

const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function Import() {
  const { batches, loading, refetch, deleteBatch, deleting } = useImportBatches();
  const [confirmDelete, setConfirmDelete] = useState<ImportBatch | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Get non-deleted batches sorted by date
  const nonDeletedBatches = batches.filter(b => !b.is_deleted);
  const mostRecentNonDeletedBatchId = nonDeletedBatches.length > 0 
    ? nonDeletedBatches.sort((a, b) => new Date(b.imported_at).getTime() - new Date(a.imported_at).getTime())[0].id
    : null;

  const handleDeleteClick = (batch: ImportBatch) => {
    setDeleteError(null);
    setConfirmDelete(batch);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    
    const result = await deleteBatch(confirmDelete.id);
    if (result.success) {
      setConfirmDelete(null);
      setDeleteError(null);
      
      // Force multiple refreshes to ensure UI is updated
      await refetch();
      // Wait a bit and refresh again to ensure database changes are reflected
      setTimeout(async () => {
        await refetch();
      }, 1000);
    } else {
      setDeleteError(result.error || 'Failed to delete batch');
    }
  };

  const handleCancelDelete = () => {
    setConfirmDelete(null);
    setDeleteError(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Import Data</h1>
        <p className="text-slate-400 mt-1">Upload CSV files to import invoice data</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CsvUploader onImportComplete={refetch} />

        <div className="card p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Import Instructions</h3>
          <div className="space-y-4 text-sm">
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center flex-shrink-0 text-xs font-bold">1</div>
              <div><p className="text-white font-medium">Export from SKG Payables</p><p className="text-slate-400">Export the "All Invoices SHA Over 90" report as CSV</p></div>
            </div>
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center flex-shrink-0 text-xs font-bold">2</div>
              <div><p className="text-white font-medium">Upload the file</p><p className="text-slate-400">Drag and drop or click to browse for your CSV file</p></div>
            </div>
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center flex-shrink-0 text-xs font-bold">3</div>
              <div><p className="text-white font-medium">Data Processing</p><p className="text-slate-400">Zero-value invoices are automatically filtered out during import</p></div>
            </div>
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center flex-shrink-0 text-xs font-bold">4</div>
              <div><p className="text-white font-medium">View Analytics</p><p className="text-slate-400">Go to Dashboard to view charts and analysis</p></div>
            </div>
          </div>
          <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <p className="text-amber-400 text-sm"><strong>Note:</strong> Each import creates a new batch. Previous imports are preserved for trend analysis.</p>
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Import History</h3>
        
        {loading ? (
          <div className="py-8 text-center text-slate-400"><div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>Loading...</div>
        ) : batches.length === 0 ? (
          <div className="py-8 text-center text-slate-500">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            <p>No imports yet</p><p className="text-sm mt-1">Upload a CSV file to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Filename</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Imported</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Records</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Skipped</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {batches.map((batch) => {
                  const isDeleted = batch.is_deleted === true;
                  const isMostRecentNonDeleted = !isDeleted && batch.id === mostRecentNonDeletedBatchId;
                  const canDelete = !isDeleted && isMostRecentNonDeleted;
                  
                  return (
                    <tr 
                      key={batch.id} 
                      className={`hover:bg-slate-800/30 ${batch.is_current ? 'bg-sky-500/5' : ''} ${isDeleted ? 'opacity-50' : ''}`}
                    >
                      <td className="px-4 py-3"><p className={`text-sm ${isDeleted ? 'text-slate-500 line-through' : 'text-white'}`}>{batch.filename}</p></td>
                      <td className="px-4 py-3"><p className={`text-sm ${isDeleted ? 'text-slate-600' : 'text-slate-400'}`}>{formatDate(batch.imported_at)}</p></td>
                      <td className="px-4 py-3"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isDeleted ? 'bg-slate-700/50 text-slate-500' : 'bg-emerald-500/20 text-emerald-400'}`}>{batch.record_count.toLocaleString()}</span></td>
                      <td className="px-4 py-3"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isDeleted ? 'bg-slate-700/50 text-slate-500' : 'bg-slate-500/20 text-slate-400'}`}>{batch.skipped_count.toLocaleString()}</span></td>
                      <td className="px-4 py-3">
                        {batch.is_current && !isDeleted ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-500/20 text-sky-400 border border-sky-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 mr-1.5 animate-pulse"></span>
                            Current
                          </span>
                        ) : isDeleted ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">
                            Deleted
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">Previous</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDeleteClick(batch)}
                          disabled={deleting === batch.id || !canDelete}
                          className={`inline-flex items-center px-2.5 py-1.5 text-xs font-medium rounded transition-colors ${
                            isDeleted || !canDelete
                              ? 'text-slate-600 cursor-not-allowed opacity-50'
                              : 'text-red-400 hover:text-red-300 hover:bg-red-500/10'
                          } ${deleting === batch.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                          title={isDeleted ? 'This batch is already deleted' : !canDelete ? 'Batches must be deleted from most recent to oldest' : 'Delete batch'}
                        >
                          {deleting === batch.id ? (
                            <>
                              <svg className="w-3.5 h-3.5 mr-1 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Deleting...
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              Delete
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Delete Import Batch</h3>
                <p className="text-sm text-slate-400">This action cannot be undone</p>
              </div>
            </div>
            
            <div className="bg-slate-900/50 rounded-lg p-4 mb-4">
              <p className="text-sm text-slate-300 mb-2">You are about to delete:</p>
              <div className="space-y-1">
                <p className="text-white font-medium">{confirmDelete.filename}</p>
                <p className="text-sm text-slate-400">
                  {confirmDelete.record_count.toLocaleString()} invoices • Imported {formatDate(confirmDelete.imported_at)}
                </p>
                {confirmDelete.is_current && (
                  <p className="text-sm text-amber-400 mt-2">
                    This is the current batch. The previous batch will become current after deletion.
                  </p>
                )}
              </div>
            </div>

            {deleteError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-red-400 text-sm">{deleteError}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleCancelDelete}
                disabled={deleting !== null}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting !== null}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Deleting...
                  </>
                ) : (
                  'Delete Batch'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


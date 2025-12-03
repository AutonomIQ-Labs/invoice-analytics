import { CsvUploader } from '../components/import/CsvUploader';
import { useImportBatches } from '../hooks/useInvoices';

const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function Import() {
  const { batches, loading, refetch } = useImportBatches();

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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {batches.map((batch) => (
                  <tr key={batch.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3"><p className="text-sm text-white">{batch.filename}</p></td>
                    <td className="px-4 py-3"><p className="text-sm text-slate-400">{formatDate(batch.imported_at)}</p></td>
                    <td className="px-4 py-3"><span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400">{batch.record_count.toLocaleString()}</span></td>
                    <td className="px-4 py-3"><span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-500/20 text-slate-400">{batch.skipped_count.toLocaleString()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


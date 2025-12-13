import { useBatchComparison } from '../../hooks/useInvoices';

const formatCurrency = (value: number) => new Intl.NumberFormat('en-CA', { 
  style: 'currency', 
  currency: 'CAD', 
  notation: 'compact', 
  maximumFractionDigits: 1 
}).format(value);

const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-CA', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});

export function BatchComparisonPanel() {
  const { comparison, loading } = useBatchComparison();

  if (loading) {
    return (
      <div className="card p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-slate-700 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-16 bg-slate-700 rounded"></div>
            <div className="h-16 bg-slate-700 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!comparison || !comparison.previousBatch) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-white mb-2">Import Comparison</h3>
        <p className="text-slate-400 text-sm">
          Import at least two batches to see comparison data.
        </p>
      </div>
    );
  }

  const netChange = comparison.currentCount - comparison.previousCount;
  const netValueChange = comparison.currentValue - comparison.previousValue;

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Changes Since Last Import</h3>
          <p className="text-sm text-slate-400">
            Comparing {formatDate(comparison.currentBatch!.imported_at)} vs {formatDate(comparison.previousBatch.imported_at)}
          </p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-slate-800/50 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1">
            <span className={`text-xl font-bold ${netChange >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {netChange >= 0 ? '+' : ''}{netChange}
            </span>
          </div>
          <p className="text-xs text-slate-500">Net Change</p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-emerald-400">-{comparison.resolvedInvoicesCount}</p>
          <p className="text-xs text-slate-500">Resolved</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-amber-400">+{comparison.newInvoicesCount}</p>
          <p className="text-xs text-slate-500">New Invoices</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 text-center">
          <span className={`text-lg font-bold ${netValueChange >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {netValueChange >= 0 ? '+' : ''}{formatCurrency(netValueChange)}
          </span>
          <p className="text-xs text-slate-500">Value Change</p>
        </div>
      </div>

      {/* Value Breakdown */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-emerald-500/10 rounded-lg p-3">
          <p className="text-sm text-slate-400 mb-1">Resolved Value</p>
          <p className="text-lg font-semibold text-emerald-400">{formatCurrency(comparison.resolvedInvoicesValue)}</p>
        </div>
        <div className="bg-amber-500/10 rounded-lg p-3">
          <p className="text-sm text-slate-400 mb-1">New Invoice Value</p>
          <p className="text-lg font-semibold text-amber-400">{formatCurrency(comparison.newInvoicesValue)}</p>
        </div>
      </div>

      {/* State Changes */}
      <div>
        <h4 className="text-sm font-medium text-slate-400 mb-3">Status Changes</h4>
        <div className="bg-slate-800/30 rounded-lg p-3 max-w-md">
          <div className="space-y-2">
            {comparison.stateChanges.filter(s => s.change !== 0).map((change) => (
              <div key={change.state} className="flex items-center justify-between gap-4 text-sm">
                <span className="text-slate-300">{change.state}</span>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-slate-500">{change.previous.toLocaleString()} → {change.current.toLocaleString()}</span>
                  <span className={`font-semibold min-w-[45px] text-right ${
                    change.change > 0 ? 'text-red-400' : change.change < 0 ? 'text-emerald-400' : 'text-slate-400'
                  }`}>
                    {change.change > 0 ? '+' : ''}{change.change}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {comparison.stateChanges.filter(s => s.change !== 0).length === 0 && (
            <p className="text-slate-500 text-sm text-center py-2">No status changes detected</p>
          )}
        </div>
      </div>

      {/* Totals comparison */}
      <div className="mt-4 pt-4 border-t border-slate-700/50">
        <div className="flex items-center justify-end gap-3 text-sm">
          <span className="text-slate-400">Previous Import</span>
          <span className="text-slate-300">{comparison.previousCount.toLocaleString()} invoices · {formatCurrency(comparison.previousValue)}</span>
        </div>
        <div className="flex items-center justify-end gap-3 text-sm mt-1">
          <span className="text-slate-400">Current Import</span>
          <span className="text-white font-medium">{comparison.currentCount.toLocaleString()} invoices · {formatCurrency(comparison.currentValue)}</span>
        </div>
      </div>
    </div>
  );
}


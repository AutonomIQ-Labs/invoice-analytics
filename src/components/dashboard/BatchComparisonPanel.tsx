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
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Changes Since Last Import</h3>
        <p className="text-xs text-slate-500">
          {formatDate(comparison.currentBatch!.imported_at)} vs {formatDate(comparison.previousBatch.imported_at)}
        </p>
      </div>

      {/* Compact Stats Row */}
      <div className="flex flex-wrap items-center gap-4 mb-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Net:</span>
          <span className={`font-bold ${netChange >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {netChange >= 0 ? '+' : ''}{netChange}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Resolved:</span>
          <span className="font-bold text-emerald-400">-{comparison.resolvedInvoicesCount}</span>
          <span className="text-emerald-400/70">({formatCurrency(comparison.resolvedInvoicesValue)})</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400">New:</span>
          <span className="font-bold text-amber-400">+{comparison.newInvoicesCount}</span>
          <span className="text-amber-400/70">({formatCurrency(comparison.newInvoicesValue)})</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Value Δ:</span>
          <span className={`font-bold ${netValueChange >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {netValueChange >= 0 ? '+' : ''}{formatCurrency(netValueChange)}
          </span>
        </div>
      </div>

      {/* Status Changes & Totals side by side */}
      <div className="flex flex-wrap gap-4">
        {/* Status Changes */}
        <div className="flex-1 min-w-[280px]">
          <h4 className="text-xs font-medium text-slate-500 mb-2">Status Changes</h4>
          <div className="space-y-1">
            {comparison.stateChanges.filter(s => s.change !== 0).map((change) => (
              <div key={change.state} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-slate-300">{change.state}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-slate-500">{change.previous.toLocaleString()} → {change.current.toLocaleString()}</span>
                  <span className={`font-semibold min-w-[40px] text-right ${
                    change.change > 0 ? 'text-red-400' : change.change < 0 ? 'text-emerald-400' : 'text-slate-400'
                  }`}>
                    {change.change > 0 ? '+' : ''}{change.change}
                  </span>
                </div>
              </div>
            ))}
            {comparison.stateChanges.filter(s => s.change !== 0).length === 0 && (
              <p className="text-slate-500 text-xs">No status changes</p>
            )}
          </div>
        </div>

        {/* Totals */}
        <div className="flex-shrink-0 text-right text-xs">
          <div className="text-slate-500 mb-1">
            Previous: <span className="text-slate-300">{comparison.previousCount.toLocaleString()} · {formatCurrency(comparison.previousValue)}</span>
          </div>
          <div className="text-slate-500">
            Current: <span className="text-white font-medium">{comparison.currentCount.toLocaleString()} · {formatCurrency(comparison.currentValue)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}


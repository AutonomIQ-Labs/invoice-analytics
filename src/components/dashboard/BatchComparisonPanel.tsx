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
  hour: 'numeric',
  minute: '2-digit'
});

const formatTimeDiff = (date1: string, date2: string) => {
  const diff = Math.abs(new Date(date1).getTime() - new Date(date2).getTime());
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
};

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
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-xl font-bold text-white">Changes Since Last Import</h3>
          <p className="text-sm text-slate-400">
            Comparing {formatDate(comparison.currentBatch!.imported_at)} vs {formatDate(comparison.previousBatch.imported_at)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Total Current Value</p>
          <p className="text-2xl font-bold text-white">
            {formatCurrency(comparison.currentValue)}
            <span className={`text-sm ml-1 ${netValueChange >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              ({netValueChange >= 0 ? '+' : ''}{formatCurrency(netValueChange)})
            </span>
          </p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-3">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Net Items</p>
          <p className={`text-2xl font-bold ${netChange <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {netChange > 0 ? '+' : ''}{netChange}
          </p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-3">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Resolved</p>
          <p className="text-2xl font-bold text-emerald-400">
            -{comparison.resolvedInvoicesCount}
            <span className="text-sm text-slate-400 font-normal ml-2">({formatCurrency(comparison.resolvedInvoicesValue)})</span>
          </p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-3">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">New Items</p>
          <p className="text-2xl font-bold text-amber-400">
            +{comparison.newInvoicesCount}
            <span className="text-sm text-slate-400 font-normal ml-2">({formatCurrency(comparison.newInvoicesValue)})</span>
          </p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-3">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Value Delta</p>
          <p className={`text-2xl font-bold ${netValueChange >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {netValueChange >= 0 ? '+' : ''}{formatCurrency(netValueChange)}
            <span className="text-slate-500 ml-1">$</span>
          </p>
        </div>
      </div>

      {/* Status Changes Breakdown Table */}
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-white uppercase tracking-wide mb-3">Status Changes Breakdown</h4>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left text-xs text-slate-500 uppercase tracking-wide py-2 pr-4">Status</th>
                <th className="text-right text-xs text-slate-500 uppercase tracking-wide py-2 px-4">Previous</th>
                <th className="text-right text-xs text-slate-500 uppercase tracking-wide py-2 px-4">Current</th>
                <th className="text-right text-xs text-slate-500 uppercase tracking-wide py-2 pl-4">Change</th>
              </tr>
            </thead>
            <tbody>
              {comparison.stateChanges.filter(s => s.change !== 0).map((change) => (
                <tr key={change.state} className="border-b border-slate-800/50">
                  <td className="py-3 pr-4 text-sm text-white">{change.state}</td>
                  <td className="py-3 px-4 text-sm text-slate-400 text-right">{change.previous.toLocaleString()}</td>
                  <td className="py-3 px-4 text-sm text-white font-medium text-right">{change.current.toLocaleString()}</td>
                  <td className="py-3 pl-4 text-right">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                      change.change < 0 
                        ? 'bg-emerald-500/20 text-emerald-400' 
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {change.change > 0 ? '+' : ''}{change.change}
                    </span>
                  </td>
                </tr>
              ))}
              {comparison.stateChanges.filter(s => s.change !== 0).length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-slate-500 text-sm">No status changes detected</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-700/50 text-sm text-slate-400">
        <span>Total Processed Items: <span className="text-white">{comparison.currentCount.toLocaleString()}</span></span>
        <span>Comparison Period: <span className="text-white">{formatTimeDiff(comparison.currentBatch!.imported_at, comparison.previousBatch.imported_at)}</span></span>
      </div>
    </div>
  );
}


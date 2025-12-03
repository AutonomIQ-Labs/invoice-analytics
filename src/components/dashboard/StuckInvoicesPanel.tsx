import type { Invoice } from '../../types/database';

interface StuckInvoicesPanelProps {
  invoices: Invoice[];
  onInvoiceClick?: (invoice: Invoice) => void;
}

const formatCurrency = (value: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2 }).format(value);

const getStatusColor = (status: string | null) => {
  if (!status) return 'bg-slate-500';
  if (status.toLowerCase().includes('investigation')) return 'bg-red-500';
  if (status.toLowerCase().includes('progress')) return 'bg-amber-500';
  return 'bg-slate-500';
};

export function StuckInvoicesPanel({ invoices, onInvoiceClick }: StuckInvoicesPanelProps) {
  const stuckInvoices = invoices.filter(inv => 
    inv.overall_process_state?.toLowerCase().includes('investigation') ||
    (inv.overall_process_state?.toLowerCase().includes('progress') && (inv.days_old || 0) > 180)
  ).slice(0, 10);

  const groupedByStatus = stuckInvoices.reduce((acc, inv) => {
    const status = inv.overall_process_state || 'Unknown';
    if (!acc[status]) acc[status] = [];
    acc[status].push(inv);
    return acc;
  }, {} as Record<string, Invoice[]>);

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Stuck Invoices</h3>
        <span className="px-2.5 py-1 bg-red-500/20 text-red-400 text-xs font-medium rounded-full">{stuckInvoices.length} requiring attention</span>
      </div>

      {stuckInvoices.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p>No stuck invoices found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedByStatus).map(([status, invs]) => (
            <div key={status}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${getStatusColor(status)}`}></div>
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">{status.replace(/^\d+\s*-\s*/, '')}</span>
                <span className="text-xs text-slate-500">({invs.length})</span>
              </div>
              <div className="space-y-1">
                {invs.slice(0, 3).map((inv) => (
                  <button key={inv.id} onClick={() => onInvoiceClick?.(inv)} className="w-full flex items-center justify-between p-3 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg transition-colors text-left">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">{inv.supplier || 'Unknown Vendor'}</p>
                      <p className="text-xs text-slate-500">Invoice #{inv.invoice_number} • {inv.days_old} days old</p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-sm font-medium text-white">{formatCurrency(inv.invoice_amount || 0)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


import { useNavigate } from 'react-router-dom';
import { useDashboardStats, useImportBatches } from '../hooks/useInvoices';
import { StatCard } from '../components/dashboard/StatCard';
import { AgingChart } from '../components/dashboard/AgingChart';
import { MonthlyAgingChart } from '../components/dashboard/MonthlyAgingChart';
import { ProcessStateChart } from '../components/dashboard/ProcessStateChart';
import { VendorTable } from '../components/dashboard/VendorTable';
import { TrendChart } from '../components/dashboard/TrendChart';
import { PoBreakdownChart } from '../components/dashboard/PoBreakdownChart';
import { BatchComparisonPanel } from '../components/dashboard/BatchComparisonPanel';

const formatCurrency = (value: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', notation: 'compact', maximumFractionDigits: 1 }).format(value);
const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function Dashboard() {
  const navigate = useNavigate();
  const { stats, loading: statsLoading, currentBatch } = useDashboardStats();
  const { batches } = useImportBatches();

  const handleStateClick = (state: string) => navigate(`/invoices?state=${encodeURIComponent(state)}`);
  const handleVendorClick = (vendor: string) => navigate(`/invoices?vendor=${encodeURIComponent(vendor)}`);
  const handlePoTypeClick = (poType: string) => navigate(`/invoices?poType=${encodeURIComponent(poType)}`);
  
  // Handle monthly aging bucket clicks by filtering on days_old range, not aging_bucket column
  const handleAgingBucketClick = (bucket: string) => {
    // Parse the bucket string to get min/max days (e.g., "90-120" -> minDays=90, maxDays=119)
    // or "360+" -> minDays=360
    if (bucket.endsWith('+')) {
      const minDays = parseInt(bucket.replace('+', ''));
      navigate(`/invoices?minDays=${minDays}`);
    } else {
      const parts = bucket.split('-');
      if (parts.length === 2) {
        const minDays = parseInt(parts[0]);
        const maxDays = parseInt(parts[1]) - 1; // -1 because the range is exclusive on the upper bound
        navigate(`/invoices?minDays=${minDays}&maxDays=${maxDays}`);
      }
    }
  };
  
  // Handle range clicks from summary stats (e.g., 0-90 days, 90-180 days)
  const handleAgingRangeClick = (minDays: number, maxDays?: number) => {
    if (maxDays !== undefined) {
      navigate(`/invoices?minDays=${minDays}&maxDays=${maxDays}`);
    } else {
      navigate(`/invoices?minDays=${minDays}`);
    }
  };

  const currentBatchInfo = currentBatch 
    ? `Data from ${formatDate(currentBatch.imported_at)} - ${currentBatch.filename}`
    : null;

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 mt-1">
            SKG Payables Invoice Analytics
            {currentBatchInfo && (
              <span className="ml-2 text-sky-400">{currentBatchInfo}</span>
            )}
          </p>
        </div>
        <button onClick={() => navigate('/import')} className="btn-primary flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Import Data
        </button>
      </div>

      {!stats ? (
        <div className="card p-12 text-center">
          <svg className="w-16 h-16 mx-auto mb-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="text-xl font-semibold text-white mb-2">No Data Available</h3>
          <p className="text-slate-400 mb-6">Import invoice data to see analytics</p>
          <button onClick={() => navigate('/import')} className="btn-primary">Import Data</button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard title="Invoice Backlog" value={(stats.totalInvoices - stats.readyForPayment.count).toLocaleString()} subtitle={formatCurrency(stats.totalValue - stats.readyForPayment.value)} icon="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" color="orange" />
            <StatCard title="Total Invoices" value={stats.totalInvoices.toLocaleString()} subtitle={formatCurrency(stats.totalValue)} icon="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" color="primary" />
            <StatCard title="Ready for Payment" value={stats.readyForPayment.count.toLocaleString()} subtitle={formatCurrency(stats.readyForPayment.value)} icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" color="green" />
            <StatCard title="Requires Investigation" value={stats.requiresInvestigation.count.toLocaleString()} subtitle={formatCurrency(stats.requiresInvestigation.value)} icon="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" color="red" />
            <StatCard title="Average Age" value={`${Math.round(stats.averageDaysOld)} days`} subtitle="Across backlog invoices" icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" color="yellow" />
          </div>

          <BatchComparisonPanel />

          <TrendChart batches={batches} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AgingChart data={stats.agingBreakdown} />
            <ProcessStateChart data={stats.processStateBreakdown} onStateClick={handleStateClick} />
          </div>

          <MonthlyAgingChart data={stats.monthlyAgingBreakdown} onBucketClick={handleAgingBucketClick} onRangeClick={handleAgingRangeClick} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PoBreakdownChart data={stats.poBreakdown} onTypeClick={handlePoTypeClick} />
            <VendorTable data={stats.topVendors} onVendorClick={handleVendorClick} />
          </div>
        </>
      )}
    </div>
  );
}

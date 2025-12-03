import { useState } from 'react';

interface VendorData {
  supplier: string;
  count: number;
  value: number;
}

interface VendorTableProps {
  data: VendorData[];
  onVendorClick?: (vendor: string) => void;
}

const formatCurrency = (value: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2 }).format(value);

export function VendorTable({ data, onVendorClick }: VendorTableProps) {
  const [sortBy, setSortBy] = useState<'count' | 'value'>('value');
  const sortedData = [...data].sort((a, b) => b[sortBy] - a[sortBy]);
  const maxValue = Math.max(...data.map(d => d[sortBy]));

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Top Vendors</h3>
        <div className="flex gap-1 bg-slate-700/50 rounded-lg p-1">
          <button onClick={() => setSortBy('value')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${sortBy === 'value' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'}`}>By Value</button>
          <button onClick={() => setSortBy('count')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${sortBy === 'count' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'}`}>By Count</button>
        </div>
      </div>

      <div className="space-y-3">
        {sortedData.map((vendor, index) => {
          const percentage = (vendor[sortBy] / maxValue) * 100;
          return (
            <button key={vendor.supplier} onClick={() => onVendorClick?.(vendor.supplier)} className="w-full text-left group">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-5">{index + 1}.</span>
                  <span className="text-sm text-slate-300 group-hover:text-white transition-colors truncate max-w-[180px]">{vendor.supplier || 'Unknown'}</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-medium text-white">{sortBy === 'value' ? formatCurrency(vendor.value) : vendor.count.toLocaleString()}</span>
                  <span className="text-xs text-slate-500 ml-2">{sortBy === 'value' ? `${vendor.count} inv` : formatCurrency(vendor.value)}</span>
                </div>
              </div>
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-sky-500 to-sky-400 rounded-full transition-all duration-500" style={{ width: `${percentage}%` }}></div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}


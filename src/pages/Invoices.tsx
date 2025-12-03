import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Invoice } from '../types/database';

const formatCurrency = (value: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2 }).format(value);
const formatDate = (dateStr: string | null) => dateStr ? new Date(dateStr).toLocaleDateString('en-CA') : '-';

interface FilterOptions {
  approvalStatuses: string[];
  validationStatuses: string[];
  paymentStatuses: string[];
  processStates: string[];
  poTypes: string[];
  agingBuckets: string[];
}

export function Invoices() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    approvalStatuses: [], validationStatuses: [], paymentStatuses: [],
    processStates: [], poTypes: [], agingBuckets: []
  });
  const printRef = useRef<HTMLDivElement>(null);

  // Filter states
  const [filters, setFilters] = useState({
    search: searchParams.get('search') || '',
    supplier: searchParams.get('vendor') || '',
    invoiceNumber: searchParams.get('invoiceNumber') || '',
    approvalStatus: searchParams.get('approvalStatus') || '',
    validationStatus: searchParams.get('validationStatus') || '',
    paymentStatus: searchParams.get('paymentStatus') || '',
    processState: searchParams.get('state') || '',
    poType: searchParams.get('poType') || '',
    agingBucket: searchParams.get('aging') || '',
    minAmount: searchParams.get('minAmount') || '',
    maxAmount: searchParams.get('maxAmount') || '',
    minDaysOld: searchParams.get('minDays') || '',
    maxDaysOld: searchParams.get('maxDays') || '',
  });

  // Load filter options on mount
  useEffect(() => {
    async function loadFilterOptions() {
      const { data } = await supabase.from('invoices').select('approval_status, validation_status, payment_status, overall_process_state, po_type, aging_bucket');
      if (data) {
        const unique = (arr: (string | null)[]) => [...new Set(arr.filter(Boolean))].sort() as string[];
        setFilterOptions({
          approvalStatuses: unique(data.map(d => d.approval_status)),
          validationStatuses: unique(data.map(d => d.validation_status)),
          paymentStatuses: unique(data.map(d => d.payment_status)),
          processStates: unique(data.map(d => d.overall_process_state)),
          poTypes: unique(data.map(d => d.po_type)),
          agingBuckets: unique(data.map(d => d.aging_bucket)),
        });
      }
    }
    loadFilterOptions();
  }, []);

  // Build query with filters
  const buildQuery = (forExport = false) => {
    let query = supabase.from('invoices').select('*', { count: 'exact' });

    if (filters.search) {
      query = query.or(`supplier.ilike.%${filters.search}%,invoice_number.ilike.%${filters.search}%,invoice_id.ilike.%${filters.search}%`);
    }
    if (filters.supplier) query = query.ilike('supplier', `%${filters.supplier}%`);
    if (filters.invoiceNumber) query = query.ilike('invoice_number', `%${filters.invoiceNumber}%`);
    if (filters.approvalStatus) query = query.eq('approval_status', filters.approvalStatus);
    if (filters.validationStatus) query = query.eq('validation_status', filters.validationStatus);
    if (filters.paymentStatus) query = query.eq('payment_status', filters.paymentStatus);
    if (filters.processState) query = query.eq('overall_process_state', filters.processState);
    if (filters.poType) query = query.eq('po_type', filters.poType);
    if (filters.agingBucket) query = query.eq('aging_bucket', filters.agingBucket);
    if (filters.minAmount) query = query.gte('invoice_amount', parseFloat(filters.minAmount));
    if (filters.maxAmount) query = query.lte('invoice_amount', parseFloat(filters.maxAmount));
    if (filters.minDaysOld) query = query.gte('days_old', parseInt(filters.minDaysOld));
    if (filters.maxDaysOld) query = query.lte('days_old', parseInt(filters.maxDaysOld));

    query = query.order('days_old', { ascending: false });
    
    if (!forExport) {
      const from = (page - 1) * 25;
      query = query.range(from, from + 24);
    }

    return query;
  };

  // Fetch invoices when filters or page change
  useEffect(() => {
    async function fetchInvoices() {
      setLoading(true);
      const { data, count, error } = await buildQuery();
      if (!error) {
        setInvoices((data as Invoice[]) || []);
        setTotalCount(count || 0);
      }
      setLoading(false);
    }
    fetchInvoices();
  }, [filters, page]);

  const totalPages = Math.ceil(totalCount / 25);

  const updateFilter = (key: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
    if (value) {
      searchParams.set(key, value);
    } else {
      searchParams.delete(key);
    }
    setSearchParams(searchParams);
  };

  const clearFilters = () => {
    setFilters({
      search: '', supplier: '', invoiceNumber: '', approvalStatus: '',
      validationStatus: '', paymentStatus: '', processState: '', poType: '',
      agingBucket: '', minAmount: '', maxAmount: '', minDaysOld: '', maxDaysOld: ''
    });
    setPage(1);
    setSearchParams({});
  };

  const activeFilterCount = Object.values(filters).filter(v => v !== '').length;

  // Export to CSV
  const exportToCsv = async () => {
    setExporting(true);
    try {
      const { data } = await buildQuery(true);
      const exportData = (data as Invoice[]) || [];

      if (exportData.length === 0) {
        alert('No data to export');
        return;
      }

      const headers = [
        'Invoice Number', 'Invoice ID', 'Invoice Date', 'Creation Date', 'Vendor', 'Supplier Type',
        'Amount', 'Days Old', 'Aging', 'Approval Status', 'Validation Status', 'Payment Status',
        'Payment Method', 'Payment Terms', 'Process State', 'Custom Status', 'PO Type', 'PO Number',
        'Business Unit', 'Account Coding', 'Routing Attribute'
      ];

      const rows = exportData.map(inv => [
        inv.invoice_number || '',
        inv.invoice_id || '',
        inv.invoice_date || '',
        inv.creation_date || '',
        inv.supplier || '',
        inv.supplier_type || '',
        inv.invoice_amount || 0,
        inv.days_old || 0,
        inv.aging_bucket || '',
        inv.approval_status || '',
        inv.validation_status || '',
        inv.payment_status || '',
        inv.payment_method || '',
        inv.payment_terms || '',
        inv.overall_process_state || '',
        inv.custom_invoice_status || '',
        inv.po_type || '',
        inv.identifying_po || '',
        inv.business_unit || '',
        inv.account_coding_status || '',
        inv.routing_attribute || ''
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `invoices_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // Print Report
  const printReport = async () => {
    setExporting(true);
    try {
      const { data } = await buildQuery(true);
      const exportData = (data as Invoice[]) || [];

      const totalValue = exportData.reduce((sum, inv) => sum + (inv.invoice_amount || 0), 0);
      const avgDaysOld = exportData.reduce((sum, inv) => sum + (inv.days_old || 0), 0) / exportData.length || 0;

      // Group by process state for summary
      const stateGroups = exportData.reduce((acc, inv) => {
        const state = inv.overall_process_state?.replace(/^\d+\s*-\s*/, '') || 'Unknown';
        if (!acc[state]) acc[state] = { count: 0, value: 0 };
        acc[state].count++;
        acc[state].value += inv.invoice_amount || 0;
        return acc;
      }, {} as Record<string, { count: number; value: number }>);

      // Group by PO type
      const poGroups = exportData.reduce((acc, inv) => {
        const type = inv.po_type || 'Unknown';
        if (!acc[type]) acc[type] = { count: 0, value: 0 };
        acc[type].count++;
        acc[type].value += inv.invoice_amount || 0;
        return acc;
      }, {} as Record<string, { count: number; value: number }>);

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Please allow popups to print the report');
        return;
      }

      const activeFiltersText = Object.entries(filters)
        .filter(([_, v]) => v !== '')
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ') || 'None';

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Invoice Report - ${new Date().toLocaleDateString('en-CA')}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 20px; color: #333; font-size: 11px; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #0ea5e9; padding-bottom: 15px; }
            .header h1 { color: #0ea5e9; font-size: 24px; margin-bottom: 5px; }
            .header p { color: #666; }
            .summary { display: flex; gap: 15px; margin-bottom: 20px; flex-wrap: wrap; }
            .summary-card { flex: 1; min-width: 150px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
            .summary-card .value { font-size: 20px; font-weight: bold; color: #0ea5e9; }
            .summary-card .label { font-size: 10px; color: #64748b; margin-top: 3px; }
            .section { margin-bottom: 20px; }
            .section h3 { color: #334155; font-size: 14px; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; }
            .breakdown { display: flex; gap: 20px; flex-wrap: wrap; }
            .breakdown-group { flex: 1; min-width: 200px; }
            .breakdown-item { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #f1f5f9; }
            .breakdown-item .name { color: #475569; }
            .breakdown-item .stats { color: #64748b; }
            table { width: 100%; border-collapse: collapse; font-size: 9px; }
            th { background: #0ea5e9; color: white; padding: 8px 4px; text-align: left; font-weight: 600; }
            td { padding: 6px 4px; border-bottom: 1px solid #e2e8f0; }
            tr:nth-child(even) { background: #f8fafc; }
            .amount { text-align: right; font-family: monospace; }
            .filters { background: #fef3c7; border: 1px solid #fcd34d; border-radius: 6px; padding: 10px; margin-bottom: 15px; font-size: 10px; }
            .filters strong { color: #92400e; }
            .footer { margin-top: 20px; text-align: center; color: #94a3b8; font-size: 10px; border-top: 1px solid #e2e8f0; padding-top: 10px; }
            @media print { body { padding: 10px; } .no-print { display: none; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>SKG Payables Invoice Report</h1>
            <p>Saskatchewan Health Authority - Generated ${new Date().toLocaleString('en-CA')}</p>
          </div>

          ${activeFilterCount > 0 ? `<div class="filters"><strong>Active Filters:</strong> ${activeFiltersText}</div>` : ''}

          <div class="summary">
            <div class="summary-card">
              <div class="value">${exportData.length.toLocaleString()}</div>
              <div class="label">Total Invoices</div>
            </div>
            <div class="summary-card">
              <div class="value">${formatCurrency(totalValue)}</div>
              <div class="label">Total Value</div>
            </div>
            <div class="summary-card">
              <div class="value">${Math.round(avgDaysOld)}</div>
              <div class="label">Avg Days Old</div>
            </div>
          </div>

          <div class="section">
            <h3>Breakdown Summary</h3>
            <div class="breakdown">
              <div class="breakdown-group">
                <strong style="font-size: 11px; color: #334155;">By Process State</strong>
                ${Object.entries(stateGroups).sort((a, b) => b[1].value - a[1].value).slice(0, 8).map(([state, data]) => `
                  <div class="breakdown-item">
                    <span class="name">${state}</span>
                    <span class="stats">${data.count} inv · ${formatCurrency(data.value)}</span>
                  </div>
                `).join('')}
              </div>
              <div class="breakdown-group">
                <strong style="font-size: 11px; color: #334155;">By PO Type</strong>
                ${Object.entries(poGroups).sort((a, b) => b[1].value - a[1].value).map(([type, data]) => `
                  <div class="breakdown-item">
                    <span class="name">${type}</span>
                    <span class="stats">${data.count} inv · ${formatCurrency(data.value)}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <div class="section">
            <h3>Invoice Details (${exportData.length} records)</h3>
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Vendor</th>
                  <th>Amount</th>
                  <th>Days</th>
                  <th>Process State</th>
                  <th>Approval</th>
                  <th>Payment</th>
                  <th>PO Type</th>
                </tr>
              </thead>
              <tbody>
                ${exportData.slice(0, 500).map(inv => `
                  <tr>
                    <td>${inv.invoice_number || '-'}</td>
                    <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${inv.supplier || '-'}</td>
                    <td class="amount">${formatCurrency(inv.invoice_amount || 0)}</td>
                    <td>${inv.days_old || '-'}</td>
                    <td style="max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${inv.overall_process_state?.replace(/^\d+\s*-\s*/, '') || '-'}</td>
                    <td>${inv.approval_status || '-'}</td>
                    <td>${inv.payment_status || '-'}</td>
                    <td>${inv.po_type || '-'}</td>
                  </tr>
                `).join('')}
                ${exportData.length > 500 ? `<tr><td colspan="8" style="text-align: center; color: #94a3b8; font-style: italic;">... and ${exportData.length - 500} more records (showing first 500)</td></tr>` : ''}
              </tbody>
            </table>
          </div>

          <div class="footer">
            <p>Report generated from SKG Invoice Analytics Dashboard</p>
            <p>Total records: ${exportData.length} | Total value: ${formatCurrency(totalValue)}</p>
          </div>

          <script>window.onload = function() { window.print(); }</script>
        </body>
        </html>
      `);
      printWindow.document.close();
    } catch (error) {
      console.error('Print failed:', error);
      alert('Print failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Invoices</h1>
          <p className="text-slate-400 mt-1">{totalCount.toLocaleString()} invoices found</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportToCsv} disabled={exporting || totalCount === 0} className="btn-secondary flex items-center gap-2 disabled:opacity-50">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
          <button onClick={printReport} disabled={exporting || totalCount === 0} className="btn-secondary flex items-center gap-2 disabled:opacity-50">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            {exporting ? 'Preparing...' : 'Print Report'}
          </button>
          <button onClick={() => setShowFilters(!showFilters)} className={`btn-secondary flex items-center gap-2 ${showFilters ? 'bg-sky-500/20 border-sky-500/30' : ''}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filters {activeFilterCount > 0 && <span className="px-1.5 py-0.5 bg-sky-500 text-white text-xs rounded-full">{activeFilterCount}</span>}
          </button>
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="btn-secondary text-red-400 hover:text-red-300">Clear All</button>
          )}
        </div>
      </div>

      {/* Global Search */}
      <div className="card p-4">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" value={filters.search} onChange={(e) => updateFilter('search', e.target.value)} placeholder="Search by vendor, invoice number, or invoice ID..." className="input pl-10" />
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="card p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Vendor</label>
              <input type="text" value={filters.supplier} onChange={(e) => updateFilter('supplier', e.target.value)} placeholder="Filter by vendor..." className="input text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Invoice Number</label>
              <input type="text" value={filters.invoiceNumber} onChange={(e) => updateFilter('invoiceNumber', e.target.value)} placeholder="Filter by invoice #..." className="input text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Process State</label>
              <select value={filters.processState} onChange={(e) => updateFilter('processState', e.target.value)} className="input text-sm">
                <option value="">All States</option>
                {filterOptions.processStates.map(s => <option key={s} value={s}>{s.replace(/^\d+\s*-\s*/, '')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Approval Status</label>
              <select value={filters.approvalStatus} onChange={(e) => updateFilter('approvalStatus', e.target.value)} className="input text-sm">
                <option value="">All</option>
                {filterOptions.approvalStatuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Validation Status</label>
              <select value={filters.validationStatus} onChange={(e) => updateFilter('validationStatus', e.target.value)} className="input text-sm">
                <option value="">All</option>
                {filterOptions.validationStatuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Payment Status</label>
              <select value={filters.paymentStatus} onChange={(e) => updateFilter('paymentStatus', e.target.value)} className="input text-sm">
                <option value="">All</option>
                {filterOptions.paymentStatuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">PO Type</label>
              <select value={filters.poType} onChange={(e) => updateFilter('poType', e.target.value)} className="input text-sm">
                <option value="">All</option>
                {filterOptions.poTypes.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Aging</label>
              <select value={filters.agingBucket} onChange={(e) => updateFilter('agingBucket', e.target.value)} className="input text-sm">
                <option value="">All</option>
                {filterOptions.agingBuckets.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Min Amount ($)</label>
              <input type="number" value={filters.minAmount} onChange={(e) => updateFilter('minAmount', e.target.value)} placeholder="0" className="input text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Max Amount ($)</label>
              <input type="number" value={filters.maxAmount} onChange={(e) => updateFilter('maxAmount', e.target.value)} placeholder="999999" className="input text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Min Days Old</label>
              <input type="number" value={filters.minDaysOld} onChange={(e) => updateFilter('minDaysOld', e.target.value)} placeholder="90" className="input text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Max Days Old</label>
              <input type="number" value={filters.maxDaysOld} onChange={(e) => updateFilter('maxDaysOld', e.target.value)} placeholder="999" className="input text-sm" />
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden" ref={printRef}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Invoice</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Vendor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Days Old</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Approval</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Validation</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Payment</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Process State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400"><div className="flex items-center justify-center gap-2"><div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>Loading...</div></td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No invoices found matching your filters</td></tr>
              ) : invoices.map((invoice) => (
                <tr key={invoice.id} onClick={() => setSelectedInvoice(invoice)} className="hover:bg-slate-800/30 cursor-pointer transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-white">{invoice.invoice_number || '-'}</p>
                    <p className="text-xs text-slate-500">{formatDate(invoice.invoice_date)}</p>
                  </td>
                  <td className="px-4 py-3"><p className="text-sm text-slate-300 max-w-[180px] truncate">{invoice.supplier || '-'}</p></td>
                  <td className="px-4 py-3"><p className="text-sm font-medium text-white">{formatCurrency(invoice.invoice_amount || 0)}</p></td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      (invoice.days_old || 0) > 270 ? 'bg-red-500/20 text-red-400' : 
                      (invoice.days_old || 0) > 180 ? 'bg-amber-500/20 text-amber-400' : 
                      'bg-slate-500/20 text-slate-400'
                    }`}>{invoice.days_old || 0}</span>
                  </td>
                  <td className="px-4 py-3"><p className="text-xs text-slate-400">{invoice.approval_status || '-'}</p></td>
                  <td className="px-4 py-3"><p className="text-xs text-slate-400">{invoice.validation_status || '-'}</p></td>
                  <td className="px-4 py-3"><p className="text-xs text-slate-400">{invoice.payment_status || '-'}</p></td>
                  <td className="px-4 py-3"><p className="text-xs text-slate-400 max-w-[120px] truncate">{invoice.overall_process_state?.replace(/^\d+\s*-\s*/, '') || '-'}</p></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-700/50 flex items-center justify-between">
            <p className="text-sm text-slate-400">Showing {((page - 1) * 25) + 1} to {Math.min(page * 25, totalCount)} of {totalCount.toLocaleString()}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(1)} disabled={page === 1} className="btn-secondary disabled:opacity-50 text-xs px-2">First</button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary disabled:opacity-50">Prev</button>
              <span className="px-3 py-2 text-sm text-slate-400">Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-secondary disabled:opacity-50">Next</button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="btn-secondary disabled:opacity-50 text-xs px-2">Last</button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setSelectedInvoice(null)}>
          <div className="card max-w-3xl w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-700/50 flex items-center justify-between sticky top-0 bg-slate-800/95 backdrop-blur">
              <div>
                <h2 className="text-xl font-bold text-white">Invoice Details</h2>
                <p className="text-slate-400 text-sm">{selectedInvoice.invoice_number}</p>
              </div>
              <button onClick={() => setSelectedInvoice(null)} className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-white">{formatCurrency(selectedInvoice.invoice_amount || 0)}</p>
                  <p className="text-sm text-slate-400">Amount</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-amber-400">{selectedInvoice.days_old}</p>
                  <p className="text-sm text-slate-400">Days Old</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                  <p className="text-lg font-bold text-sky-400">{selectedInvoice.overall_process_state?.replace(/^\d+\s*-\s*/, '') || '-'}</p>
                  <p className="text-sm text-slate-400">Process State</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <DetailField label="Vendor" value={selectedInvoice.supplier} />
                <DetailField label="Supplier Type" value={selectedInvoice.supplier_type} />
                <DetailField label="Invoice ID" value={selectedInvoice.invoice_id} />
                <DetailField label="Invoice Date" value={formatDate(selectedInvoice.invoice_date)} />
                <DetailField label="Creation Date" value={formatDate(selectedInvoice.creation_date)} />
                <DetailField label="Aging Bucket" value={selectedInvoice.aging_bucket} />
                <DetailField label="Approval Status" value={selectedInvoice.approval_status} />
                <DetailField label="Validation Status" value={selectedInvoice.validation_status} />
                <DetailField label="Payment Status" value={selectedInvoice.payment_status} />
                <DetailField label="Payment Method" value={selectedInvoice.payment_method} />
                <DetailField label="Payment Terms" value={selectedInvoice.payment_terms} />
                <DetailField label="Account Coding" value={selectedInvoice.account_coding_status} />
                <DetailField label="Custom Status" value={selectedInvoice.custom_invoice_status} />
                <DetailField label="Invoice Type" value={selectedInvoice.invoice_type} />
                <DetailField label="PO Type" value={selectedInvoice.po_type} />
                <DetailField label="PO Number" value={selectedInvoice.identifying_po} />
                <DetailField label="Business Unit" value={selectedInvoice.business_unit} />
                <DetailField label="Routing Attribute" value={selectedInvoice.routing_attribute} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="bg-slate-900/30 rounded-lg p-3">
      <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm text-white truncate" title={value || '-'}>{value || '-'}</p>
    </div>
  );
}

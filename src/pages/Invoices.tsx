
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { applyDynamicDaysOldToAll } from '../hooks/useInvoices';
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
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    approvalStatuses: [], validationStatuses: [], paymentStatuses: [],
    processStates: [], poTypes: [], agingBuckets: []
  });
  const printRef = useRef<HTMLDivElement>(null);

  // Sorting state
  type SortField = 'invoice_number' | 'supplier' | 'invoice_amount' | 'days_old' | 'approval_status' | 'approver_id' | 'validation_status' | 'payment_status' | 'overall_process_state' | 'identifying_po' | 'coded_by';
  const [sortField, setSortField] = useState<SortField>('days_old');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // New field, default to descending (largest first)
      setSortField(field);
      setSortDirection('desc');
    }
    setPage(1); // Reset to first page when sorting
  };

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

  // Get current batch ID
  const refreshCurrentBatch = async () => {
    const { data } = await supabase
      .from('import_batches')
      .select('id')
      .eq('is_current', true)
      .or('is_deleted.is.null,is_deleted.eq.false')
      .maybeSingle();
    
    setCurrentBatchId(data?.id || null);
  };

  // Refresh trigger for outlier changes
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    refreshCurrentBatch();
    
    const handleBatchDeleted = () => refreshCurrentBatch();
    const handleOutlierChanged = () => setRefreshTrigger(prev => prev + 1);
    
    window.addEventListener('batchDeleted', handleBatchDeleted);
    window.addEventListener('outlierChanged', handleOutlierChanged);
    
    return () => {
      window.removeEventListener('batchDeleted', handleBatchDeleted);
      window.removeEventListener('outlierChanged', handleOutlierChanged);
    };
  }, []);

  // Load filter options from current batch
  useEffect(() => {
    async function loadFilterOptions() {
      if (!currentBatchId) return;
      
      const { data } = await supabase
        .from('invoices')
        .select('approval_status, validation_status, payment_status, overall_process_state, po_type, aging_bucket')
        .eq('import_batch_id', currentBatchId);
      
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
  }, [currentBatchId]);

  // Build query with filters
  const buildQuery = () => {
    let query = supabase.from('invoices').select('*', { count: 'exact' });
    
    if (!currentBatchId) {
      return query.eq('import_batch_id', 'none');
    }
    
    query = query.eq('import_batch_id', currentBatchId);
    
    // Filter out excluded outliers (only show invoices where include_in_analysis is NOT false)
    // Using .not() instead of .or() to avoid multiple .or() conflicts
    // This matches the dashboard behavior which excludes outliers from calculations
    query = query.not('include_in_analysis', 'eq', false);

    // Build OR conditions for search - must be done carefully to avoid multiple .or() calls
    if (filters.search) {
      const searchTerm = filters.search.replace(/'/g, "''"); // Escape single quotes
      query = query.or(`supplier.ilike.%${searchTerm}%,invoice_number.ilike.%${searchTerm}%,invoice_id.ilike.%${searchTerm}%`);
    }
    if (filters.supplier) query = query.ilike('supplier', `%${filters.supplier}%`);
    if (filters.invoiceNumber) query = query.ilike('invoice_number', `%${filters.invoiceNumber}%`);
    if (filters.approvalStatus) query = query.eq('approval_status', filters.approvalStatus);
    if (filters.validationStatus) query = query.eq('validation_status', filters.validationStatus);
    if (filters.paymentStatus) query = query.eq('payment_status', filters.paymentStatus);
    if (filters.processState) query = query.eq('overall_process_state', filters.processState);
    
    // Handle PO type filter - data is normalized to "PO" or "Non-PO"
    // CSV uses "Yes" for PO and "No" for Non-PO, but parser normalizes to "PO"/"Non-PO"
    if (filters.poType) {
      if (filters.poType.toUpperCase() === 'PO' || filters.poType.toUpperCase() === 'YES') {
        // Match "PO" exactly (normalized value)
        query = query.eq('po_type', 'PO');
      } else if (filters.poType.toUpperCase() === 'NON-PO' || filters.poType.toUpperCase() === 'NONPO' || filters.poType.toUpperCase() === 'NO') {
        // Match "Non-PO" exactly (normalized value)
        query = query.eq('po_type', 'Non-PO');
      } else {
        // For any other value from dropdown, do exact match
        query = query.eq('po_type', filters.poType);
      }
    }
    
    // Note: agingBucket filter is kept for backward compatibility with dropdown
    // but dashboard now uses minDays/maxDays for accurate filtering
    if (filters.agingBucket) query = query.eq('aging_bucket', filters.agingBucket);
    if (filters.minAmount) query = query.gte('invoice_amount', parseFloat(filters.minAmount));
    if (filters.maxAmount) query = query.lte('invoice_amount', parseFloat(filters.maxAmount));
    if (filters.minDaysOld) query = query.gte('days_old', parseInt(filters.minDaysOld));
    if (filters.maxDaysOld) query = query.lte('days_old', parseInt(filters.maxDaysOld));

    // Apply user-selected sorting
    query = query.order(sortField, { ascending: sortDirection === 'asc' });
    
    const from = (page - 1) * 25;
    query = query.range(from, from + 24);

    return query;
  };

  // Fetch invoices when filters, page, or batch change
  useEffect(() => {
    async function fetchInvoices() {
      if (!currentBatchId) {
        setInvoices([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data, count, error } = await buildQuery();
      if (!error) {
        // Apply dynamic days_old calculation based on current date
        const invoicesWithDynamicAge = applyDynamicDaysOldToAll((data as Invoice[]) || []);
        setInvoices(invoicesWithDynamicAge);
        setTotalCount(count || 0);
      }
      setLoading(false);
    }
    fetchInvoices();
  }, [filters, page, currentBatchId, refreshTrigger, sortField, sortDirection]);

  const totalPages = Math.ceil(totalCount / 25);

  const updateFilter = (key: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
    if (value) {
      const paramKey = key === 'supplier' ? 'vendor' : key === 'processState' ? 'state' : key === 'agingBucket' ? 'aging' : key === 'minDaysOld' ? 'minDays' : key === 'maxDaysOld' ? 'maxDays' : key;
      searchParams.set(paramKey, value);
    } else {
      const paramKey = key === 'supplier' ? 'vendor' : key === 'processState' ? 'state' : key === 'agingBucket' ? 'aging' : key === 'minDaysOld' ? 'minDays' : key === 'maxDaysOld' ? 'maxDays' : key;
      searchParams.delete(paramKey);
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

  // Fetch all invoices with pagination for export/print
  const fetchAllInvoices = async (): Promise<Invoice[]> => {
    if (!currentBatchId) return [];
    
    const allInvoices: Invoice[] = [];
    const pageSize = 1000;
    let pg = 0;
    let hasMore = true;

    while (hasMore) {
      let query = supabase.from('invoices').select('*').eq('import_batch_id', currentBatchId);
      
      // Filter out excluded outliers (only show invoices where include_in_analysis is NOT false)
      // Using .not() instead of .or() to avoid multiple .or() conflicts
      query = query.not('include_in_analysis', 'eq', false);

      // Build OR conditions for search - must be done carefully to avoid multiple .or() calls
      if (filters.search) {
        const searchTerm = filters.search.replace(/'/g, "''"); // Escape single quotes
        query = query.or(`supplier.ilike.%${searchTerm}%,invoice_number.ilike.%${searchTerm}%,invoice_id.ilike.%${searchTerm}%`);
      }
      if (filters.supplier) query = query.ilike('supplier', `%${filters.supplier}%`);
      if (filters.invoiceNumber) query = query.ilike('invoice_number', `%${filters.invoiceNumber}%`);
      if (filters.approvalStatus) query = query.eq('approval_status', filters.approvalStatus);
      if (filters.validationStatus) query = query.eq('validation_status', filters.validationStatus);
      if (filters.paymentStatus) query = query.eq('payment_status', filters.paymentStatus);
      if (filters.processState) query = query.eq('overall_process_state', filters.processState);
      
      // Handle PO type filter - data is normalized to "PO" or "Non-PO"
      if (filters.poType) {
        if (filters.poType.toUpperCase() === 'PO' || filters.poType.toUpperCase() === 'YES') {
          query = query.eq('po_type', 'PO');
        } else if (filters.poType.toUpperCase() === 'NON-PO' || filters.poType.toUpperCase() === 'NONPO' || filters.poType.toUpperCase() === 'NO') {
          query = query.eq('po_type', 'Non-PO');
        } else {
          query = query.eq('po_type', filters.poType);
        }
      }
      
      if (filters.agingBucket) query = query.eq('aging_bucket', filters.agingBucket);
      if (filters.minAmount) query = query.gte('invoice_amount', parseFloat(filters.minAmount));
      if (filters.maxAmount) query = query.lte('invoice_amount', parseFloat(filters.maxAmount));
      if (filters.minDaysOld) query = query.gte('days_old', parseInt(filters.minDaysOld));
      if (filters.maxDaysOld) query = query.lte('days_old', parseInt(filters.maxDaysOld));

      // Apply user-selected sorting
      query = query.order(sortField, { ascending: sortDirection === 'asc' });
      query = query.range(pg * pageSize, (pg + 1) * pageSize - 1);

      const { data, error } = await query;
      if (error) throw error;

      const pageData = (data as Invoice[]) || [];
      allInvoices.push(...pageData);
      hasMore = pageData.length === pageSize;
      pg++;
    }

    // Apply dynamic days_old calculation based on current date
    return applyDynamicDaysOldToAll(allInvoices);
  };

  // Export to CSV
  const exportToCsv = async () => {
    setExporting(true);
    try {
      const exportData = await fetchAllInvoices();
      if (exportData.length === 0) { alert('No data to export'); return; }

      const headers = ['Invoice Number', 'Invoice ID', 'Invoice Date', 'Creation Date', 'Vendor', 'Supplier Type', 'Amount', 'Days Old', 'Aging', 'Approval Status', 'Validation Status', 'Payment Status', 'Payment Method', 'Payment Terms', 'Process State', 'Invoice Status', 'Custom Status', 'PO Type', 'PO Number', 'Business Unit', 'Account Coding', 'Routing Attribute', 'Coded By', 'Approver ID', 'WF Approval Status', 'Approval Response', 'Action Date', 'Payment Amount', 'Payment Date', 'Enter to Payment'];

      const rows = exportData.map(inv => [
        inv.invoice_number || '', inv.invoice_id || '', inv.invoice_date || '', inv.creation_date || '',
        inv.supplier || '', inv.supplier_type || '', inv.invoice_amount || 0, inv.days_old || 0,
        inv.aging_bucket || '', inv.approval_status || '', inv.validation_status || '',
        inv.payment_status || '', inv.payment_method || '', inv.payment_terms || '',
        inv.overall_process_state || '', inv.invoice_status || '', inv.custom_invoice_status || '', inv.po_type || '',
        inv.identifying_po || '', inv.business_unit || '', inv.account_coding_status || '', inv.routing_attribute || '',
        inv.coded_by || '', inv.approver_id || '', inv.wfapproval_status || '', inv.approval_response || '',
        inv.action_date || '', inv.payment_amount || '', inv.payment_date || '', inv.enter_to_payment || ''
      ]);

      const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n');
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
      const exportData = await fetchAllInvoices();
      const totalValue = exportData.reduce((sum, inv) => sum + (inv.invoice_amount || 0), 0);
      const avgDaysOld = exportData.reduce((sum, inv) => sum + (inv.days_old || 0), 0) / exportData.length || 0;

      const stateGroups = exportData.reduce((acc, inv) => {
        const state = inv.overall_process_state?.replace(/^\d+\s*-\s*/, '') || 'Unknown';
        if (!acc[state]) acc[state] = { count: 0, value: 0 };
        acc[state].count++;
        acc[state].value += inv.invoice_amount || 0;
        return acc;
      }, {} as Record<string, { count: number; value: number }>);

      const poGroups = exportData.reduce((acc, inv) => {
        const type = inv.po_type || 'Unknown';
        if (!acc[type]) acc[type] = { count: 0, value: 0 };
        acc[type].count++;
        acc[type].value += inv.invoice_amount || 0;
        return acc;
      }, {} as Record<string, { count: number; value: number }>);

      const printWindow = window.open('', '_blank');
      if (!printWindow) { alert('Please allow popups to print the report'); return; }

      const activeFiltersText = Object.entries(filters).filter(([_, v]) => v !== '').map(([k, v]) => `${k}: ${v}`).join(', ') || 'None';

      printWindow.document.write(`<!DOCTYPE html><html><head><title>Invoice Report - ${new Date().toLocaleDateString('en-CA')}</title><style>* { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: Arial, sans-serif; padding: 20px; color: #333; font-size: 11px; } .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #0ea5e9; padding-bottom: 15px; } .header h1 { color: #0ea5e9; font-size: 24px; margin-bottom: 5px; } .header p { color: #666; } .summary { display: flex; gap: 15px; margin-bottom: 20px; flex-wrap: wrap; } .summary-card { flex: 1; min-width: 150px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; } .summary-card .value { font-size: 20px; font-weight: bold; color: #0ea5e9; } .summary-card .label { font-size: 10px; color: #64748b; margin-top: 3px; } .section { margin-bottom: 20px; } .section h3 { color: #334155; font-size: 14px; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; } .breakdown { display: flex; gap: 20px; flex-wrap: wrap; } .breakdown-group { flex: 1; min-width: 200px; } .breakdown-item { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #f1f5f9; } .breakdown-item .name { color: #475569; } .breakdown-item .stats { color: #64748b; } table { width: 100%; border-collapse: collapse; font-size: 9px; } th { background: #0ea5e9; color: white; padding: 8px 4px; text-align: left; font-weight: 600; } td { padding: 6px 4px; border-bottom: 1px solid #e2e8f0; } tr:nth-child(even) { background: #f8fafc; } .amount { text-align: right; font-family: monospace; } .filters { background: #fef3c7; border: 1px solid #fcd34d; border-radius: 6px; padding: 10px; margin-bottom: 15px; font-size: 10px; } .filters strong { color: #92400e; } .footer { margin-top: 20px; text-align: center; color: #94a3b8; font-size: 10px; border-top: 1px solid #e2e8f0; padding-top: 10px; } @media print { body { padding: 10px; } .no-print { display: none; } }</style></head><body><div class="header"><h1>SKG Payables Invoice Report</h1><p>Saskatchewan Health Authority - Generated ${new Date().toLocaleString('en-CA')}</p></div>${activeFilterCount > 0 ? `<div class="filters"><strong>Active Filters:</strong> ${activeFiltersText}</div>` : ''}<div class="summary"><div class="summary-card"><div class="value">${exportData.length.toLocaleString()}</div><div class="label">Total Invoices</div></div><div class="summary-card"><div class="value">${formatCurrency(totalValue)}</div><div class="label">Total Value</div></div><div class="summary-card"><div class="value">${Math.round(avgDaysOld)}</div><div class="label">Avg Days Old</div></div></div><div class="section"><h3>Breakdown Summary</h3><div class="breakdown"><div class="breakdown-group"><strong style="font-size: 11px; color: #334155;">By Process State</strong>${Object.entries(stateGroups).sort((a, b) => b[1].value - a[1].value).slice(0, 8).map(([state, data]) => `<div class="breakdown-item"><span class="name">${state}</span><span class="stats">${data.count} inv · ${formatCurrency(data.value)}</span></div>`).join('')}</div><div class="breakdown-group"><strong style="font-size: 11px; color: #334155;">By PO Type</strong>${Object.entries(poGroups).sort((a, b) => b[1].value - a[1].value).map(([type, data]) => `<div class="breakdown-item"><span class="name">${type}</span><span class="stats">${data.count} inv · ${formatCurrency(data.value)}</span></div>`).join('')}</div></div></div><div class="section"><h3>Invoice Details (${exportData.length} records)</h3><table><thead><tr><th>Invoice #</th><th>Vendor</th><th>Amount</th><th>Days</th><th>Process State</th><th>Approval</th><th>Approver</th><th>Payment</th><th>PO Type</th></tr></thead><tbody>${exportData.slice(0, 500).map(inv => `<tr><td>${inv.invoice_number || '-'}</td><td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${inv.supplier || '-'}</td><td class="amount">${formatCurrency(inv.invoice_amount || 0)}</td><td>${inv.days_old || '-'}</td><td style="max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${inv.overall_process_state?.replace(/^\d+\s*-\s*/, '') || '-'}</td><td>${inv.approval_status || '-'}</td><td>${inv.approver_id || '-'}</td><td>${inv.payment_status || '-'}</td><td>${inv.po_type || '-'}</td></tr>`).join('')}${exportData.length > 500 ? `<tr><td colspan="9" style="text-align: center; color: #94a3b8; font-style: italic;">... and ${exportData.length - 500} more records (showing first 500)</td></tr>` : ''}</tbody></table></div><div class="footer"><p>Report generated from SKG Invoice Analytics Dashboard</p><p>Total records: ${exportData.length} | Total value: ${formatCurrency(totalValue)}</p></div><script>window.onload = function() { window.print(); }</script></body></html>`);
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
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
          <button onClick={printReport} disabled={exporting || totalCount === 0} className="btn-secondary flex items-center gap-2 disabled:opacity-50">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            {exporting ? 'Preparing...' : 'Print Report'}
          </button>
          <button onClick={() => setShowFilters(!showFilters)} className={`btn-secondary flex items-center gap-2 ${showFilters ? 'bg-sky-500/20 border-sky-500/30' : ''}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
            Filters {activeFilterCount > 0 && <span className="px-1.5 py-0.5 bg-sky-500 text-white text-xs rounded-full">{activeFilterCount}</span>}
          </button>
          {activeFilterCount > 0 && <button onClick={clearFilters} className="btn-secondary text-red-400 hover:text-red-300">Clear All</button>}
        </div>
      </div>

      {/* Global Search */}
      <div className="card p-4">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input type="text" value={filters.search} onChange={(e) => updateFilter('search', e.target.value)} placeholder="Search by vendor, invoice number, or invoice ID..." className="input pl-10" />
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="card p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div><label className="block text-xs font-medium text-slate-400 mb-1">Vendor</label><input type="text" value={filters.supplier} onChange={(e) => updateFilter('supplier', e.target.value)} placeholder="Filter by vendor..." className="input text-sm" /></div>
            <div><label className="block text-xs font-medium text-slate-400 mb-1">Invoice Number</label><input type="text" value={filters.invoiceNumber} onChange={(e) => updateFilter('invoiceNumber', e.target.value)} placeholder="Filter by invoice #..." className="input text-sm" /></div>
            <div><label className="block text-xs font-medium text-slate-400 mb-1">Process State</label><select value={filters.processState} onChange={(e) => updateFilter('processState', e.target.value)} className="input text-sm"><option value="">All States</option>{filterOptions.processStates.map(s => <option key={s} value={s}>{s.replace(/^\d+\s*-\s*/, '')}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-slate-400 mb-1">Approval Status</label><select value={filters.approvalStatus} onChange={(e) => updateFilter('approvalStatus', e.target.value)} className="input text-sm"><option value="">All</option>{filterOptions.approvalStatuses.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-slate-400 mb-1">Validation Status</label><select value={filters.validationStatus} onChange={(e) => updateFilter('validationStatus', e.target.value)} className="input text-sm"><option value="">All</option>{filterOptions.validationStatuses.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-slate-400 mb-1">Payment Status</label><select value={filters.paymentStatus} onChange={(e) => updateFilter('paymentStatus', e.target.value)} className="input text-sm"><option value="">All</option>{filterOptions.paymentStatuses.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-slate-400 mb-1">PO Type</label><select value={filters.poType} onChange={(e) => updateFilter('poType', e.target.value)} className="input text-sm"><option value="">All</option>{filterOptions.poTypes.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-slate-400 mb-1">Aging</label><select value={filters.agingBucket} onChange={(e) => updateFilter('agingBucket', e.target.value)} className="input text-sm"><option value="">All</option>{filterOptions.agingBuckets.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-slate-400 mb-1">Min Amount ($)</label><input type="number" value={filters.minAmount} onChange={(e) => updateFilter('minAmount', e.target.value)} placeholder="0" className="input text-sm" /></div>
            <div><label className="block text-xs font-medium text-slate-400 mb-1">Max Amount ($)</label><input type="number" value={filters.maxAmount} onChange={(e) => updateFilter('maxAmount', e.target.value)} placeholder="999999" className="input text-sm" /></div>
            <div><label className="block text-xs font-medium text-slate-400 mb-1">Min Days Old</label><input type="number" value={filters.minDaysOld} onChange={(e) => updateFilter('minDaysOld', e.target.value)} placeholder="0" className="input text-sm" /></div>
            <div><label className="block text-xs font-medium text-slate-400 mb-1">Max Days Old</label><input type="number" value={filters.maxDaysOld} onChange={(e) => updateFilter('maxDaysOld', e.target.value)} placeholder="999" className="input text-sm" /></div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden" ref={printRef}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                <SortableHeader field="invoice_number" label="Invoice" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader field="supplier" label="Vendor" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader field="identifying_po" label="PO Number" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader field="invoice_amount" label="Amount" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader field="days_old" label="Days Old" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader field="approval_status" label="Approval" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader field="approver_id" label="Approver" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader field="coded_by" label="Coded By" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader field="validation_status" label="Validation" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader field="payment_status" label="Payment" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader field="overall_process_state" label="Process State" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {loading ? (
                <tr><td colSpan={11} className="px-4 py-8 text-center text-slate-400"><div className="flex items-center justify-center gap-2"><div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>Loading...</div></td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={11} className="px-4 py-8 text-center text-slate-400">No invoices found matching your filters</td></tr>
              ) : invoices.map((invoice) => (
                <tr key={invoice.id} onClick={() => setSelectedInvoice(invoice)} className="hover:bg-slate-800/30 cursor-pointer transition-colors">
                  <td className="px-4 py-3"><p className="text-sm font-medium text-white">{invoice.invoice_number || '-'}</p><p className="text-xs text-slate-500">{formatDate(invoice.invoice_date)}</p></td>
                  <td className="px-4 py-3"><p className="text-sm text-slate-300 max-w-[180px] truncate">{invoice.supplier || '-'}</p></td>
                  <td className="px-4 py-3"><p className="text-xs text-slate-400">{invoice.identifying_po || '-'}</p></td>
                  <td className="px-4 py-3"><p className="text-sm font-medium text-white">{formatCurrency(invoice.invoice_amount || 0)}</p></td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${(invoice.days_old || 0) > 270 ? 'bg-red-500/20 text-red-400' : (invoice.days_old || 0) > 180 ? 'bg-amber-500/20 text-amber-400' : (invoice.days_old || 0) > 90 ? 'bg-sky-500/20 text-sky-400' : 'bg-emerald-500/20 text-emerald-400'}`}>{invoice.days_old || 0}</span></td>
                  <td className="px-4 py-3"><p className="text-xs text-slate-400">{invoice.approval_status || '-'}</p></td>
                  <td className="px-4 py-3"><p className="text-xs text-slate-400">{invoice.approver_id || '-'}</p></td>
                  <td className="px-4 py-3"><p className="text-xs text-slate-400">{invoice.coded_by || '-'}</p></td>
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
              <div><h2 className="text-xl font-bold text-white">Invoice Details</h2><p className="text-slate-400 text-sm">{selectedInvoice.invoice_number}</p></div>
              <button onClick={() => setSelectedInvoice(null)} className="p-2 hover:bg-slate-700 rounded-lg transition-colors"><svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-slate-800/50 rounded-lg p-4 text-center"><p className="text-2xl font-bold text-white">{formatCurrency(selectedInvoice.invoice_amount || 0)}</p><p className="text-sm text-slate-400">Amount</p></div>
                <div className="bg-slate-800/50 rounded-lg p-4 text-center"><p className={`text-2xl font-bold ${(selectedInvoice.days_old || 0) > 90 ? 'text-amber-400' : 'text-emerald-400'}`}>{selectedInvoice.days_old}</p><p className="text-sm text-slate-400">Days Old</p></div>
                <div className="bg-slate-800/50 rounded-lg p-4 text-center"><p className="text-lg font-bold text-sky-400">{selectedInvoice.overall_process_state?.replace(/^\d+\s*-\s*/, '') || '-'}</p><p className="text-sm text-slate-400">Process State</p></div>
              </div>
              {/* Basic Information */}
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Basic Information</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                <DetailField label="Vendor" value={selectedInvoice.supplier} />
                <DetailField label="Supplier Type" value={selectedInvoice.supplier_type} />
                <DetailField label="Invoice ID" value={selectedInvoice.invoice_id} />
                <DetailField label="Invoice Date" value={formatDate(selectedInvoice.invoice_date)} />
                <DetailField label="Creation Date" value={formatDate(selectedInvoice.creation_date)} />
                <DetailField label="Aging Bucket" value={selectedInvoice.aging_bucket} />
                <DetailField label="Invoice Type" value={selectedInvoice.invoice_type} />
                <DetailField label="Invoice Status" value={selectedInvoice.invoice_status} />
                <DetailField label="Business Unit" value={selectedInvoice.business_unit} />
              </div>

              {/* Status & Approval */}
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Status & Approval</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                <DetailField label="Approval Status" value={selectedInvoice.approval_status} />
                <DetailField label="Validation Status" value={selectedInvoice.validation_status} />
                <DetailField label="Account Coding" value={selectedInvoice.account_coding_status} />
                <DetailField label="Coded By" value={selectedInvoice.coded_by} />
                <DetailField label="Approver ID" value={selectedInvoice.approver_id} />
                <DetailField label="WF Approval Status" value={selectedInvoice.wfapproval_status} />
                <DetailField label="WF Status Code" value={selectedInvoice.wfapproval_status_code} />
                <DetailField label="Approval Response" value={selectedInvoice.approval_response} />
                <DetailField label="Action Date" value={formatDate(selectedInvoice.action_date)} />
              </div>

              {/* Payment Information */}
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Payment Information</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                <DetailField label="Payment Status" value={selectedInvoice.payment_status} />
                <DetailField label="Payment Method" value={selectedInvoice.payment_method} />
                <DetailField label="Payment Terms" value={selectedInvoice.payment_terms} />
                <DetailField label="Payment Amount" value={selectedInvoice.payment_amount ? formatCurrency(selectedInvoice.payment_amount) : null} />
                <DetailField label="Payment Date" value={formatDate(selectedInvoice.payment_date)} />
                <DetailField label="Enter to Payment" value={selectedInvoice.enter_to_payment?.toString()} />
              </div>

              {/* PO & Routing */}
              <h3 className="text-sm font-semibold text-slate-300 mb-3">PO & Routing</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <DetailField label="PO Type" value={selectedInvoice.po_type} />
                <DetailField label="PO Number" value={selectedInvoice.identifying_po} />
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

type SortField = 'invoice_number' | 'supplier' | 'invoice_amount' | 'days_old' | 'approval_status' | 'approver_id' | 'validation_status' | 'payment_status' | 'overall_process_state' | 'identifying_po' | 'coded_by';

function SortableHeader({ 
  field, 
  label, 
  sortField, 
  sortDirection, 
  onSort 
}: { 
  field: SortField; 
  label: string; 
  sortField: SortField; 
  sortDirection: 'asc' | 'desc'; 
  onSort: (field: SortField) => void;
}) {
  const isActive = sortField === field;
  
  return (
    <th 
      onClick={() => onSort(field)}
      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer select-none hover:bg-slate-700/50 transition-colors group"
    >
      <div className="flex items-center gap-1.5">
        <span className={isActive ? 'text-sky-400' : 'text-slate-400 group-hover:text-slate-300'}>
          {label}
        </span>
        <span className="flex flex-col">
          {isActive ? (
            sortDirection === 'asc' ? (
              <svg className="w-3.5 h-3.5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )
          ) : (
            <svg className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          )}
        </span>
      </div>
    </th>
  );
}

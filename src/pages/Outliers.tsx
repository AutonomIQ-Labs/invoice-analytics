import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { applyDynamicDaysOldToAll } from '../hooks/useInvoices';
import type { Invoice } from '../types/database';

// HTML escape helper to prevent XSS in print output
const escapeHtml = (str: string | null | undefined): string => {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

interface OutlierStats {
  totalOutliers: number;
  highValueCount: number;
  negativeCount: number;
  includedCount: number;
  excludedCount: number;
  totalValue: number;
  includedValue: number;
}

export function Outliers() {
  const [outliers, setOutliers] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<OutlierStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [filter, setFilter] = useState<'all' | 'high_value' | 'negative'>('all');
  const [showIncluded, setShowIncluded] = useState<'all' | 'included' | 'excluded'>('all');
  const [minAmountInput, setMinAmountInput] = useState('100000');
  const [maxAmountInput, setMaxAmountInput] = useState('');
  
  // Additional filters for export/print
  const [searchTerm, setSearchTerm] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [processStateFilter, setProcessStateFilter] = useState('');
  const [minAmountFilter, setMinAmountFilter] = useState('');
  const [maxAmountFilter, setMaxAmountFilter] = useState('');
  const [minDaysFilter, setMinDaysFilter] = useState('');
  const [maxDaysFilter, setMaxDaysFilter] = useState('');
  const [updateMessage, setUpdateMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(false);

  const fetchOutliers = useCallback(async () => {
    setLoading(true);
    try {
      // Get current batch ID
      const { data: batchData } = await supabase
        .from('import_batches')
        .select('id')
        .eq('is_current', true)
        .or('is_deleted.is.null,is_deleted.eq.false')
        .maybeSingle();

      if (!batchData) {
        setOutliers([]);
        setStats(null);
        setCurrentBatchId(null);
        setLoading(false);
        return;
      }

      setCurrentBatchId(batchData.id);

      // Fetch ALL outliers using pagination (Supabase has 1000 row limit per request)
      const allOutliers: Invoice[] = [];
      const pageSize = 1000;
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
          .from('invoices')
          .select('*')
          .eq('import_batch_id', batchData.id)
          .eq('is_outlier', true)
          .order('invoice_amount', { ascending: false })
          .range(from, to);

        if (error) throw error;

        const pageData = (data as Invoice[]) || [];
        allOutliers.push(...pageData);

        hasMore = pageData.length === pageSize;
        page++;
      }

      // Apply dynamic days_old calculation based on current date
      const outlierData = applyDynamicDaysOldToAll(allOutliers);
      setOutliers(outlierData);

      // Calculate stats
      const highValueCount = outlierData.filter(o => o.outlier_reason === 'high_value').length;
      const negativeCount = outlierData.filter(o => o.outlier_reason === 'negative').length;
      // Treat null/undefined as "included" (consistent with Aging & Invoices pages)
      const includedCount = outlierData.filter(o => o.include_in_analysis === true || o.include_in_analysis === null || o.include_in_analysis === undefined).length;
      const excludedCount = outlierData.filter(o => o.include_in_analysis === false).length;
      const totalValue = outlierData.reduce((sum, o) => sum + Math.abs(o.invoice_amount || 0), 0);
      const includedValue = outlierData.filter(o => o.include_in_analysis === true || o.include_in_analysis === null || o.include_in_analysis === undefined).reduce((sum, o) => sum + Math.abs(o.invoice_amount || 0), 0);

      setStats({
        totalOutliers: outlierData.length,
        highValueCount,
        negativeCount,
        includedCount,
        excludedCount,
        totalValue,
        includedValue,
      });
    } catch (err) {
      console.error('Error fetching outliers:', err);
      setUpdateMessage({ type: 'error', text: 'Failed to load outliers' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOutliers();
  }, [fetchOutliers]);

  // Clear message after 5 seconds
  useEffect(() => {
    if (updateMessage) {
      const timer = setTimeout(() => setUpdateMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [updateMessage]);

  const toggleInclusion = async (invoice: Invoice) => {
    setUpdating(invoice.id);
    try {
      const newValue = invoice.include_in_analysis === true ? false : true;
      const { error } = await supabase
        .from('invoices')
        .update({ include_in_analysis: newValue })
        .eq('id', invoice.id);

      if (error) throw error;

      // Update local state
      setOutliers(prev => prev.map(o => 
        o.id === invoice.id ? { ...o, include_in_analysis: newValue } : o
      ));

      // Update stats
      setStats(prev => {
        if (!prev) return prev;
        const change = newValue ? 1 : -1;
        const valueChange = Math.abs(invoice.invoice_amount || 0);
        return {
          ...prev,
          includedCount: prev.includedCount + change,
          excludedCount: prev.excludedCount - change,
          includedValue: prev.includedValue + (newValue ? valueChange : -valueChange),
        };
      });

      // Dispatch event to refresh dashboard stats
      window.dispatchEvent(new CustomEvent('outlierChanged'));
    } catch (err) {
      console.error('Error updating invoice:', err);
      setUpdateMessage({ type: 'error', text: 'Failed to update invoice' });
    } finally {
      setUpdating(null);
    }
  };

  const bulkToggle = async (
    include: boolean, 
    type?: 'high_value' | 'negative', 
    minAmount?: number,
    maxAmount?: number
  ) => {
    if (!currentBatchId) {
      setUpdateMessage({ type: 'error', text: 'No batch selected' });
      return;
    }

    setBulkUpdating(true);
    setUpdateMessage(null);
    
    try {
      // Get IDs of invoices to update based on local data (to handle filtering by amount)
      let invoicesToUpdate = outliers.filter(o => o.is_outlier === true);
      
      if (type) {
        invoicesToUpdate = invoicesToUpdate.filter(o => o.outlier_reason === type);
      }
      
      // Apply amount range filter for high value invoices
      if (type === 'high_value') {
        if (minAmount !== undefined) {
          invoicesToUpdate = invoicesToUpdate.filter(o => (o.invoice_amount || 0) >= minAmount);
        }
        if (maxAmount !== undefined) {
          invoicesToUpdate = invoicesToUpdate.filter(o => (o.invoice_amount || 0) <= maxAmount);
        }
      }

      if (invoicesToUpdate.length === 0) {
        setUpdateMessage({ type: 'error', text: 'No invoices match the criteria' });
        setBulkUpdating(false);
        return;
      }

      // Update in batches of 100 to avoid hitting Supabase limits
      const batchSize = 100;
      let updated = 0;
      
      for (let i = 0; i < invoicesToUpdate.length; i += batchSize) {
        const batch = invoicesToUpdate.slice(i, i + batchSize);
        const ids = batch.map(inv => inv.id);
        
        const { error } = await supabase
          .from('invoices')
          .update({ include_in_analysis: include })
          .in('id', ids);

        if (error) throw error;
        updated += batch.length;
      }

      // Refresh data
      await fetchOutliers();

      // Dispatch event to refresh dashboard stats
      window.dispatchEvent(new CustomEvent('outlierChanged'));

      setUpdateMessage({ 
        type: 'success', 
        text: `Successfully ${include ? 'included' : 'excluded'} ${updated.toLocaleString()} invoices` 
      });
    } catch (err) {
      console.error('Error bulk updating:', err);
      setUpdateMessage({ type: 'error', text: 'Failed to update invoices. Please try again.' });
    } finally {
      setBulkUpdating(false);
    }
  };

  const handleAmountRangeAction = (include: boolean) => {
    const minVal = minAmountInput.trim() ? parseFloat(minAmountInput.replace(/,/g, '')) : undefined;
    const maxVal = maxAmountInput.trim() ? parseFloat(maxAmountInput.replace(/,/g, '')) : undefined;
    
    if (minVal !== undefined && isNaN(minVal)) {
      setUpdateMessage({ type: 'error', text: 'Please enter a valid minimum amount' });
      return;
    }
    if (maxVal !== undefined && isNaN(maxVal)) {
      setUpdateMessage({ type: 'error', text: 'Please enter a valid maximum amount' });
      return;
    }
    if (minVal !== undefined && maxVal !== undefined && minVal > maxVal) {
      setUpdateMessage({ type: 'error', text: 'Minimum amount cannot be greater than maximum' });
      return;
    }
    if (minVal === undefined && maxVal === undefined) {
      setUpdateMessage({ type: 'error', text: 'Please enter at least a minimum or maximum amount' });
      return;
    }
    
    bulkToggle(include, 'high_value', minVal, maxVal);
  };

  // Get unique process states for dropdown
  const uniqueProcessStates = [...new Set(outliers.map(o => o.overall_process_state).filter(Boolean))].sort() as string[];

  const filteredOutliers = outliers.filter(o => {
    // Type filter
    if (filter !== 'all' && o.outlier_reason !== filter) return false;
    // Inclusion status filter - treat null/undefined as "included" (consistent with Aging & Invoices pages)
    const isIncluded = o.include_in_analysis === true || o.include_in_analysis === null || o.include_in_analysis === undefined;
    if (showIncluded === 'included' && !isIncluded) return false;
    if (showIncluded === 'excluded' && isIncluded) return false;
    // Search term (vendor, invoice number, invoice ID)
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const matchesSearch = 
        (o.supplier?.toLowerCase().includes(search)) ||
        (o.invoice_number?.toLowerCase().includes(search)) ||
        (o.invoice_id?.toLowerCase().includes(search));
      if (!matchesSearch) return false;
    }
    // Vendor filter
    if (vendorFilter && !o.supplier?.toLowerCase().includes(vendorFilter.toLowerCase())) return false;
    // Process state filter
    if (processStateFilter && o.overall_process_state !== processStateFilter) return false;
    // Amount range filter - uses actual amount (not absolute) so negative amounts can be filtered
    if (minAmountFilter) {
      const minAmt = parseFloat(minAmountFilter.replace(/,/g, ''));
      if (!isNaN(minAmt) && (o.invoice_amount || 0) < minAmt) return false;
    }
    if (maxAmountFilter) {
      const maxAmt = parseFloat(maxAmountFilter.replace(/,/g, ''));
      if (!isNaN(maxAmt) && (o.invoice_amount || 0) > maxAmt) return false;
    }
    // Days old filter
    if (minDaysFilter) {
      const minDays = parseInt(minDaysFilter);
      if (!isNaN(minDays) && (o.days_old || 0) < minDays) return false;
    }
    if (maxDaysFilter) {
      const maxDays = parseInt(maxDaysFilter);
      if (!isNaN(maxDays) && (o.days_old || 0) > maxDays) return false;
    }
    return true;
  });
  
  // Check if any filters are active
  const hasActiveFilters = filter !== 'all' || showIncluded !== 'all' || searchTerm || vendorFilter || 
    processStateFilter || minAmountFilter || maxAmountFilter || minDaysFilter || maxDaysFilter;
  
  // Clear all filters
  const clearAllFilters = () => {
    setFilter('all');
    setShowIncluded('all');
    setSearchTerm('');
    setVendorFilter('');
    setProcessStateFilter('');
    setMinAmountFilter('');
    setMaxAmountFilter('');
    setMinDaysFilter('');
    setMaxDaysFilter('');
  };

  // Export to CSV function
  const exportToCsv = () => {
    setExporting(true);
    try {
      const dataToExport = filteredOutliers;
      
      if (dataToExport.length === 0) {
        setUpdateMessage({ type: 'error', text: 'No data to export' });
        setExporting(false);
        return;
      }

      // Define CSV headers
      const headers = [
        'Invoice Number',
        'Invoice ID',
        'Supplier',
        'Amount',
        'Days Old',
        'Outlier Type',
        'Included in Analysis',
        'Invoice Date',
        'Process State',
        'Approval Response',
        'Approver ID',
        'Coded By',
        'Payment Method',
        'PO Type',
        'PO Number'
      ];

      // Convert data to CSV rows
      const rows = dataToExport.map(invoice => [
        invoice.invoice_number || '',
        invoice.invoice_id || '',
        invoice.supplier || '',
        invoice.invoice_amount?.toString() || '0',
        invoice.days_old?.toString() || '0',
        invoice.outlier_reason === 'high_value' ? 'High Value' : 'Negative',
        invoice.include_in_analysis === false ? 'No' : 'Yes',
        invoice.invoice_date || '',
        invoice.overall_process_state || '',
        invoice.approval_response || '',
        invoice.approver_id || '',
        invoice.coded_by || '',
        invoice.payment_method || '',
        invoice.po_type || '',
        invoice.identifying_po || ''
      ]);

      // Build CSV content
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const filterLabel = filter === 'all' ? 'all-types' : filter === 'high_value' ? 'high-value' : 'negative';
      const statusLabel = showIncluded === 'all' ? 'all-status' : showIncluded;
      const filterSuffix = hasActiveFilters ? '_filtered' : '';
      link.download = `outliers_${filterLabel}_${statusLabel}${filterSuffix}_${new Date().toISOString().split('T')[0]}.csv`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setUpdateMessage({ type: 'success', text: `Exported ${dataToExport.length.toLocaleString()} outliers to CSV` });
    } catch (err) {
      console.error('Export error:', err);
      setUpdateMessage({ type: 'error', text: 'Failed to export data' });
    } finally {
      setExporting(false);
    }
  };

  // Print report handler
  const printReport = async () => {
    setPrinting(true);
    try {
      const dataToprint = filteredOutliers;
      
      if (dataToprint.length === 0) {
        setUpdateMessage({ type: 'error', text: 'No data to print' });
        setPrinting(false);
        return;
      }

      const filterLabel = filter === 'all' ? 'All Types' : filter === 'high_value' ? 'High Value' : 'Negative';
      const statusLabel = showIncluded === 'all' ? 'All' : showIncluded.charAt(0).toUpperCase() + showIncluded.slice(1);
      
      // Build filter summary for print - escape all user-provided values to prevent XSS
      const activeFiltersList: string[] = [];
      if (filter !== 'all') activeFiltersList.push(`Type: ${escapeHtml(filterLabel)}`);
      if (showIncluded !== 'all') activeFiltersList.push(`Status: ${escapeHtml(statusLabel)}`);
      if (searchTerm) activeFiltersList.push(`Search: "${escapeHtml(searchTerm)}"`);
      if (vendorFilter) activeFiltersList.push(`Vendor: ${escapeHtml(vendorFilter)}`);
      if (processStateFilter) activeFiltersList.push(`Process State: ${escapeHtml(processStateFilter)}`);
      if (minAmountFilter || maxAmountFilter) activeFiltersList.push(`Amount: $${escapeHtml(minAmountFilter) || '0'} - $${escapeHtml(maxAmountFilter) || '∞'}`);
      if (minDaysFilter || maxDaysFilter) activeFiltersList.push(`Days Old: ${escapeHtml(minDaysFilter) || '0'} - ${escapeHtml(maxDaysFilter) || '∞'}`);
      const filtersSummary = activeFiltersList.length > 0 ? activeFiltersList.join(' | ') : 'No filters applied';

      const printWindow = window.open('', '_blank');
      if (!printWindow) { 
        alert('Please allow popups to print the report'); 
        setPrinting(false);
        return; 
      }

      // Build table rows - escape all database values to prevent XSS
      const rows = dataToprint.map(inv => `
        <tr>
          <td>${inv.include_in_analysis === false ? '<span style="color: #ef4444;">Excluded</span>' : '<span style="color: #10b981;">Included</span>'}</td>
          <td>${inv.outlier_reason === 'high_value' ? 'High Value' : 'Negative'}</td>
          <td>${escapeHtml(inv.invoice_number || inv.invoice_id) || '-'}</td>
          <td>${escapeHtml(inv.supplier) || '-'}</td>
          <td style="text-align: right; ${(inv.invoice_amount || 0) < 0 ? 'color: #8b5cf6;' : 'color: #ef4444;'}">${formatCurrency(inv.invoice_amount)}</td>
          <td>${escapeHtml(inv.overall_process_state) || '-'}</td>
          <td>${inv.days_old ?? '-'}</td>
        </tr>
      `).join('');

      // Calculate summary
      const totalValue = dataToprint.reduce((sum, inv) => sum + Math.abs(inv.invoice_amount || 0), 0);
      // Treat null/undefined as "included" (consistent with Aging & Invoices pages)
      const includedCount = dataToprint.filter(inv => inv.include_in_analysis === true || inv.include_in_analysis === null || inv.include_in_analysis === undefined).length;
      const excludedCount = dataToprint.filter(inv => inv.include_in_analysis === false).length;
      const highValueCount = dataToprint.filter(inv => inv.outlier_reason === 'high_value').length;
      const negativeCount = dataToprint.filter(inv => inv.outlier_reason === 'negative').length;

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Outlier Report - ${new Date().toLocaleDateString('en-CA')}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 20px; color: #333; font-size: 11px; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #f97316; padding-bottom: 15px; }
            .header h1 { color: #f97316; font-size: 24px; margin-bottom: 5px; }
            .header p { color: #666; margin-top: 3px; }
            .filters { background: #f1f5f9; padding: 10px; border-radius: 6px; margin-top: 10px; font-size: 10px; color: #475569; }
            .summary { display: flex; gap: 15px; margin-bottom: 20px; flex-wrap: wrap; }
            .summary-card { flex: 1; min-width: 120px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
            .summary-card .value { font-size: 18px; font-weight: bold; color: #f97316; }
            .summary-card .label { font-size: 10px; color: #64748b; margin-top: 3px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th { background: #f1f5f9; padding: 10px 8px; text-align: left; font-size: 10px; text-transform: uppercase; color: #475569; border-bottom: 2px solid #e2e8f0; }
            td { padding: 8px; border-bottom: 1px solid #e2e8f0; font-size: 10px; }
            tr:nth-child(even) { background: #f8fafc; }
            .footer { margin-top: 20px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; }
            @media print { @page { size: landscape; margin: 0.5in; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Outlier Report</h1>
            <p>Generated: ${new Date().toLocaleString()}</p>
            <div class="filters"><strong>Filters:</strong> ${filtersSummary}</div>
          </div>
          <div class="summary">
            <div class="summary-card">
              <div class="value">${dataToprint.length.toLocaleString()}</div>
              <div class="label">Total Outliers</div>
            </div>
            <div class="summary-card">
              <div class="value">${highValueCount.toLocaleString()}</div>
              <div class="label">High Value</div>
            </div>
            <div class="summary-card">
              <div class="value">${negativeCount.toLocaleString()}</div>
              <div class="label">Negative</div>
            </div>
            <div class="summary-card">
              <div class="value">${includedCount.toLocaleString()}</div>
              <div class="label">Included</div>
            </div>
            <div class="summary-card">
              <div class="value">${excludedCount.toLocaleString()}</div>
              <div class="label">Excluded</div>
            </div>
            <div class="summary-card">
              <div class="value">${formatCurrency(totalValue)}</div>
              <div class="label">Total Value</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Type</th>
                <th>Invoice #</th>
                <th>Supplier</th>
                <th style="text-align: right;">Amount</th>
                <th>Process State</th>
                <th>Days Old</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="footer">
            <p>SKG Payables Invoice Analytics - Outlier Report</p>
          </div>
          <script>window.onload = function() { window.print(); }</script>
        </body>
        </html>
      `);
      printWindow.document.close();
    } catch (error) {
      console.error('Print failed:', error);
      setUpdateMessage({ type: 'error', text: 'Print failed. Please try again.' });
    } finally {
      setPrinting(false);
    }
  };

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Outlier Management</h1>
          <p className="text-slate-400 mt-1">Review and manage invoices flagged as outliers (&gt;$100K in "01 - Header To Be Verified" or negative amounts)</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportToCsv}
            disabled={exporting || filteredOutliers.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? (
              <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
            Export CSV
          </button>
          <button
            onClick={printReport}
            disabled={printing || filteredOutliers.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {printing ? (
              <div className="w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
            )}
            {printing ? 'Preparing...' : 'Print Report'}
          </button>
        </div>
      </div>

      {/* Update Message */}
      {updateMessage && (
        <div className={`p-4 rounded-lg border ${
          updateMessage.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          <div className="flex items-center gap-2">
            {updateMessage.type === 'success' ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span>{updateMessage.text}</span>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.totalOutliers.toLocaleString()}</p>
                <p className="text-xs text-slate-400">Total Outliers</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.highValueCount.toLocaleString()}</p>
                <p className="text-xs text-slate-400">High Value</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.negativeCount.toLocaleString()}</p>
                <p className="text-xs text-slate-400">Negative</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.includedCount.toLocaleString()}</p>
                <p className="text-xs text-slate-400">Included</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.excludedCount.toLocaleString()}</p>
                <p className="text-xs text-slate-400">Excluded</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-sky-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-lg font-bold text-white">{formatCurrency(stats.totalValue)}</p>
                <p className="text-xs text-slate-400">Total Value</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Actions */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400 font-medium">Bulk Actions:</span>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => bulkToggle(true)}
              disabled={bulkUpdating}
              className="px-3 py-1.5 text-sm font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Include All
            </button>
            <button
              onClick={() => bulkToggle(false)}
              disabled={bulkUpdating}
              className="px-3 py-1.5 text-sm font-medium text-slate-400 bg-slate-500/10 hover:bg-slate-500/20 border border-slate-500/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Exclude All
            </button>
            <div className="w-px h-8 bg-slate-700"></div>
            <button
              onClick={() => bulkToggle(true, 'negative')}
              disabled={bulkUpdating}
              className="px-3 py-1.5 text-sm font-medium text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Include All Negative
            </button>
          </div>

          {bulkUpdating && (
            <div className="flex items-center gap-2 text-sky-400">
              <div className="w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm">Updating...</span>
            </div>
          )}
        </div>

        {/* High Value Amount Range Controls */}
        <div className="mt-4 pt-4 border-t border-slate-700/50">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-400 font-medium">High Value Range:</span>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-sm">Min $</span>
              <input
                type="text"
                value={minAmountInput}
                onChange={(e) => setMinAmountInput(e.target.value.replace(/[^0-9.,]/g, ''))}
                className="w-28 px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-sky-500"
                placeholder="50000"
              />
              <span className="text-slate-400 text-sm">to Max $</span>
              <input
                type="text"
                value={maxAmountInput}
                onChange={(e) => setMaxAmountInput(e.target.value.replace(/[^0-9.,]/g, ''))}
                className="w-28 px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-sky-500"
                placeholder="No limit"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleAmountRangeAction(true)}
                disabled={bulkUpdating}
                className="px-3 py-1.5 text-sm font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Include Range
              </button>
              <button
                onClick={() => handleAmountRangeAction(false)}
                disabled={bulkUpdating}
                className="px-3 py-1.5 text-sm font-medium text-slate-400 bg-slate-500/10 hover:bg-slate-500/20 border border-slate-500/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Exclude Range
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Leave Max empty for no upper limit. Examples: $50K-$100K includes invoices between those amounts. $100K with no max includes all invoices $100K and above.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-4">
        {/* Search Bar */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by vendor, invoice number, or ID..."
              className="w-full pl-10 pr-4 py-2 text-sm bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>
          
          <div className="flex items-center gap-2 text-sm text-slate-400">
            Showing <span className="font-semibold text-white">{filteredOutliers.length.toLocaleString()}</span> of {outliers.length.toLocaleString()} outliers
          </div>
          
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="px-3 py-1.5 text-sm font-medium text-red-400 hover:text-red-300 transition-colors"
            >
              Clear All Filters
            </button>
          )}
        </div>

        {/* Filter Row 1: Type and Status */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Type:</span>
            <div className="flex gap-1">
              {(['all', 'high_value', 'negative'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    filter === f
                      ? 'bg-sky-500 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'high_value' ? 'High Value' : 'Negative'}
                </button>
              ))}
            </div>
          </div>

          <div className="w-px h-6 bg-slate-700"></div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Status:</span>
            <div className="flex gap-1">
              {(['all', 'included', 'excluded'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setShowIncluded(s)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    showIncluded === s
                      ? 'bg-sky-500 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Filter Row 2: Vendor, Process State, Amount, Days */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Vendor</label>
            <input
              type="text"
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              placeholder="Filter by vendor..."
              className="w-full px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>
          
          <div>
            <label className="block text-xs text-slate-500 mb-1">Process State</label>
            <select
              value={processStateFilter}
              onChange={(e) => setProcessStateFilter(e.target.value)}
              className="w-full px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-sky-500"
            >
              <option value="">All States</option>
              {uniqueProcessStates.map(state => (
                <option key={state} value={state}>{state}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-xs text-slate-500 mb-1">Min Amount ($)</label>
            <input
              type="text"
              value={minAmountFilter}
              onChange={(e) => setMinAmountFilter(e.target.value.replace(/[^0-9.,]/g, ''))}
              placeholder="e.g. 50000"
              className="w-full px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>
          
          <div>
            <label className="block text-xs text-slate-500 mb-1">Max Amount ($)</label>
            <input
              type="text"
              value={maxAmountFilter}
              onChange={(e) => setMaxAmountFilter(e.target.value.replace(/[^0-9.,]/g, ''))}
              placeholder="e.g. 100000"
              className="w-full px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>
          
          <div>
            <label className="block text-xs text-slate-500 mb-1">Min Days Old</label>
            <input
              type="number"
              value={minDaysFilter}
              onChange={(e) => setMinDaysFilter(e.target.value)}
              placeholder="e.g. 30"
              className="w-full px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>
          
          <div>
            <label className="block text-xs text-slate-500 mb-1">Max Days Old</label>
            <input
              type="number"
              value={maxDaysFilter}
              onChange={(e) => setMaxDaysFilter(e.target.value)}
              placeholder="e.g. 90"
              className="w-full px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>
        
        {/* Active Filters Summary */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-700/50">
            <span className="text-xs text-slate-500">Active filters:</span>
            {filter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-sky-500/20 text-sky-400 rounded-full">
                Type: {filter === 'high_value' ? 'High Value' : 'Negative'}
                <button onClick={() => setFilter('all')} className="hover:text-white">×</button>
              </span>
            )}
            {showIncluded !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-sky-500/20 text-sky-400 rounded-full">
                Status: {showIncluded}
                <button onClick={() => setShowIncluded('all')} className="hover:text-white">×</button>
              </span>
            )}
            {searchTerm && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-sky-500/20 text-sky-400 rounded-full">
                Search: "{searchTerm}"
                <button onClick={() => setSearchTerm('')} className="hover:text-white">×</button>
              </span>
            )}
            {vendorFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-sky-500/20 text-sky-400 rounded-full">
                Vendor: {vendorFilter}
                <button onClick={() => setVendorFilter('')} className="hover:text-white">×</button>
              </span>
            )}
            {processStateFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-sky-500/20 text-sky-400 rounded-full">
                State: {processStateFilter}
                <button onClick={() => setProcessStateFilter('')} className="hover:text-white">×</button>
              </span>
            )}
            {(minAmountFilter || maxAmountFilter) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-sky-500/20 text-sky-400 rounded-full">
                Amount: {minAmountFilter || '0'} - {maxAmountFilter || '∞'}
                <button onClick={() => { setMinAmountFilter(''); setMaxAmountFilter(''); }} className="hover:text-white">×</button>
              </span>
            )}
            {(minDaysFilter || maxDaysFilter) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-sky-500/20 text-sky-400 rounded-full">
                Days: {minDaysFilter || '0'} - {maxDaysFilter || '∞'}
                <button onClick={() => { setMinDaysFilter(''); setMaxDaysFilter(''); }} className="hover:text-white">×</button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Outliers Table */}
      <div className="card overflow-hidden">
        {outliers.length === 0 ? (
          <div className="p-12 text-center">
            <svg className="w-16 h-16 mx-auto text-slate-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-slate-400 text-lg">No outliers detected</p>
            <p className="text-slate-500 text-sm mt-1">All invoices are within normal ranges</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Include</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Invoice #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Supplier</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Process State</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Days Old</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {filteredOutliers.map(invoice => (
                  <tr key={invoice.id} className={`hover:bg-slate-800/30 ${invoice.include_in_analysis === false ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleInclusion(invoice)}
                        disabled={updating === invoice.id}
                        className={`w-10 h-6 rounded-full transition-colors relative ${
                          invoice.include_in_analysis === false ? 'bg-slate-600' : 'bg-emerald-500'
                        } ${updating === invoice.id ? 'opacity-50' : ''}`}
                      >
                        <span
                          className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                            invoice.include_in_analysis === false ? 'left-1' : 'left-5'
                          }`}
                        />
                        {updating === invoice.id && (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        invoice.outlier_reason === 'high_value'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-purple-500/20 text-purple-400'
                      }`}>
                        {invoice.outlier_reason === 'high_value' ? 'High Value' : 'Negative'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-white font-medium">{invoice.invoice_number || invoice.invoice_id || '-'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-300 truncate max-w-[200px]">{invoice.supplier || '-'}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className={`text-sm font-medium ${
                        (invoice.invoice_amount || 0) < 0 ? 'text-purple-400' : 'text-red-400'
                      }`}>
                        {formatCurrency(invoice.invoice_amount)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-400">{invoice.overall_process_state || '-'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-400">{invoice.days_old ?? '-'}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="card p-4 bg-sky-500/5 border-sky-500/20">
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm text-sky-400 font-medium">About Outliers</p>
            <p className="text-sm text-slate-400 mt-1">
              Invoices are flagged as outliers if they exceed $100,000 AND are in the "01 - Header To Be Verified" process state, or have negative amounts. 
              By default, outliers are excluded from dashboard analytics to prevent skewing the data. 
              Toggle individual invoices or use bulk actions to include them in your analysis.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

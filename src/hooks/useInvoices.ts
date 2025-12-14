import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Invoice, ImportBatch } from '../types/database';

// Calculate days old dynamically from invoice_date vs current date
// This ensures the age is always accurate, not stale from import time
export function calculateDaysOld(invoiceDateStr: string | null): number | null {
  if (!invoiceDateStr) return null;
  
  const invoiceDate = new Date(invoiceDateStr);
  if (isNaN(invoiceDate.getTime())) return null;
  
  const today = new Date();
  // Reset time to midnight for accurate day calculation
  today.setHours(0, 0, 0, 0);
  invoiceDate.setHours(0, 0, 0, 0);
  
  const diffTime = today.getTime() - invoiceDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays >= 0 ? diffDays : 0;
}

// Apply dynamic days_old calculation to an invoice
function applyDynamicDaysOld(invoice: Invoice): Invoice {
  return {
    ...invoice,
    days_old: calculateDaysOld(invoice.invoice_date)
  };
}

// Apply dynamic days_old calculation to an array of invoices
export function applyDynamicDaysOldToAll(invoices: Invoice[]): Invoice[] {
  return invoices.map(applyDynamicDaysOld);
}

interface UseInvoicesOptions {
  page?: number;
  pageSize?: number;
  supplier?: string;
  overallProcessState?: string;
  minDays?: number;
  maxDays?: number;
  minAmount?: number;
  maxAmount?: number;
  sortBy?: keyof Invoice;
  sortOrder?: 'asc' | 'desc';
  batchId?: string; // Optional: specific batch, otherwise uses current
  includeOutliers?: boolean; // Whether to include outliers (default: respects include_in_analysis)
}

// Timeout wrapper for async operations (works with Supabase queries and regular promises)
async function withTimeout<T>(promiseOrThenable: PromiseLike<T>, ms: number, fallback: T): Promise<T> {
  const timeout = new Promise<T>((resolve) => 
    setTimeout(() => {
      console.warn(`Operation timed out after ${ms}ms`);
      resolve(fallback);
    }, ms)
  );
  // Convert to proper Promise to ensure race works correctly
  return Promise.race([Promise.resolve(promiseOrThenable), timeout]);
}

// Fallback response for timeout scenarios
const timeoutResponse = { data: null, error: null, count: null, status: 408, statusText: 'Request Timeout' };
const timeoutResponseArray = { data: [] as ImportBatch[], error: null, count: null, status: 408, statusText: 'Request Timeout' };

// Helper to get the current batch ID, excluding deleted batches
async function getCurrentBatchId(): Promise<string | null> {
  try {
    const result = await withTimeout(
      supabase
        .from('import_batches')
        .select('id')
        .eq('is_current', true)
        .or('is_deleted.is.null,is_deleted.eq.false')
        .maybeSingle(),
      10000,
      timeoutResponse
    );
    if (result.error) {
      console.warn('Error fetching current batch ID:', result.error.message);
      return null;
    }
    return result.data?.id || null;
  } catch (err) {
    console.error('Exception fetching current batch ID:', err);
    return null;
  }
}

// Helper to get current batch with full info
async function getCurrentBatch(): Promise<ImportBatch | null> {
  try {
    const result = await withTimeout(
      supabase
        .from('import_batches')
        .select('*')
        .eq('is_current', true)
        .or('is_deleted.is.null,is_deleted.eq.false')
        .maybeSingle(),
      10000,
      timeoutResponse
    );
    if (result.error) {
      console.warn('Error fetching current batch:', result.error.message);
      return null;
    }
    return result.data as ImportBatch | null;
  } catch (err) {
    console.error('Exception fetching current batch:', err);
    return null;
  }
}

export function useInvoices(options: UseInvoicesOptions = {}) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);

  const {
    page = 1,
    pageSize = 50,
    supplier,
    overallProcessState,
    minDays,
    maxDays,
    minAmount,
    maxAmount,
    sortBy = 'days_old',
    sortOrder = 'desc',
    batchId,
    includeOutliers,
  } = options;

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Get the batch ID to use (provided or current)
      const targetBatchId = batchId || await getCurrentBatchId();
      setCurrentBatchId(targetBatchId);
      
      if (!targetBatchId) {
        setInvoices([]);
        setTotalCount(0);
        return;
      }

      let query = supabase.from('invoices').select('*', { count: 'exact' });
      query = query.eq('import_batch_id', targetBatchId);

      // Filter outliers based on include_in_analysis unless explicitly including all
      // Outliers are excluded by default (only included if explicitly true)
      // Non-outliers are included by default (excluded only if explicitly false)
      if (includeOutliers === undefined) {
        // Default behavior: 
        // - Non-outliers: include if include_in_analysis is true, null, or undefined
        // - Outliers: only include if include_in_analysis is explicitly true
        query = query.or('and(or(is_outlier.is.null,is_outlier.eq.false),or(include_in_analysis.is.null,include_in_analysis.eq.true)),and(is_outlier.eq.true,include_in_analysis.eq.true)');
      } else if (includeOutliers === false) {
        // Explicitly exclude ALL outliers - only show non-outlier invoices
        query = query.or('is_outlier.is.null,is_outlier.eq.false');
      }
      // If includeOutliers is true, don't filter - show all invoices including outliers

      if (supplier) query = query.ilike('supplier', `%${supplier}%`);
      if (overallProcessState) query = query.eq('overall_process_state', overallProcessState);
      if (minDays !== undefined) query = query.gte('days_old', minDays);
      if (maxDays !== undefined) query = query.lte('days_old', maxDays);
      if (minAmount !== undefined) query = query.gte('invoice_amount', minAmount);
      if (maxAmount !== undefined) query = query.lte('invoice_amount', maxAmount);

      query = query.order(sortBy as string, { ascending: sortOrder === 'asc' });

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error: queryError, count } = await query;

      if (queryError) throw queryError;

      // Apply dynamic days_old calculation based on current date
      const invoicesWithDynamicAge = applyDynamicDaysOldToAll((data as Invoice[]) || []);
      setInvoices(invoicesWithDynamicAge);
      setTotalCount(count || 0);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, supplier, overallProcessState, minDays, maxDays, minAmount, maxAmount, sortBy, sortOrder, batchId, includeOutliers]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  return { invoices, totalCount, loading, error, refetch: fetchInvoices, currentBatchId };
}

export function useImportBatches() {
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
      const result = await withTimeout(
        supabase
          .from('import_batches')
          .select('*')
          .order('imported_at', { ascending: false }),
        15000,
        timeoutResponseArray
      );

      if (result.error) throw result.error;
      setBatches((result.data as ImportBatch[]) || []);
    } catch (err) {
      console.error('Error fetching batches:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteBatch = useCallback(async (batchId: string): Promise<{ success: boolean; error?: string }> => {
    setDeleting(batchId);
    try {
      // Find the batch to delete
      const batchToDelete = batches.find(b => b.id === batchId);
      if (!batchToDelete) {
        throw new Error('Batch not found');
      }
      
      // Get all non-deleted batches sorted by date
      const { data: allBatches, error: fetchError } = await supabase
        .from('import_batches')
        .select('*')
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('imported_at', { ascending: false });

      if (fetchError) {
        throw new Error(`Failed to fetch batches: ${fetchError.message}`);
      }

      const nonDeletedBatches = (allBatches as ImportBatch[]) || [];
      
      // Enforce sequential deletion: only allow deleting the most recent non-deleted batch
      const mostRecentBatch = nonDeletedBatches[0];
      if (batchToDelete.id !== mostRecentBatch.id) {
        throw new Error('Batches must be deleted from most recent to oldest. Please delete batches in order from top to bottom.');
      }

      const wasCurrent = batchToDelete.is_current;

      // Soft delete: mark as deleted
      const { error: updateError } = await supabase
        .from('import_batches')
        .update({ is_deleted: true })
        .eq('id', batchId);

      if (updateError) {
        throw new Error(`Failed to delete batch: ${updateError.message}`);
      }

      // If the deleted batch was current, set the next most recent non-deleted batch as current
      if (wasCurrent && nonDeletedBatches.length > 1) {
        const nextBatch = nonDeletedBatches[1];
        
        // Clear all current flags first
        await supabase
          .from('import_batches')
          .update({ is_current: false })
          .neq('id', batchId);

        // Set the next batch as current
        await supabase
          .from('import_batches')
          .update({ is_current: true })
          .eq('id', nextBatch.id);
      }

      // Refresh the batches list
      await fetchBatches();
      
      // Dispatch event to notify other components
      window.dispatchEvent(new CustomEvent('batchDeleted', { detail: { batchId } }));
      
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete batch';
      setError(err as Error);
      return { success: false, error: errorMessage };
    } finally {
      setDeleting(null);
    }
  }, [fetchBatches, batches]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  return { batches, loading, error, refetch: fetchBatches, deleteBatch, deleting };
}

export interface DashboardStats {
  totalInvoices: number;
  totalValue: number;
  readyForPayment: { count: number; value: number };
  requiresInvestigation: { count: number; value: number };
  averageDaysOld: number;
  agingBreakdown: { bucket: string; count: number; value: number }[];
  monthlyAgingBreakdown: { bucket: string; label: string; count: number; value: number; daysMin: number }[];
  processStateBreakdown: { state: string; count: number; value: number }[];
  topVendors: { supplier: string; count: number; value: number }[];
  poBreakdown: { type: string; count: number; value: number }[];
  outlierStats: { total: number; included: number; excluded: number };
}

export function useDashboardStats() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [currentBatch, setCurrentBatch] = useState<ImportBatch | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      // Get current batch with timeout protection
      const batch = await getCurrentBatch();
      setCurrentBatch(batch);
      
      if (!batch) {
        setStats(null);
        setLoading(false);
        return;
      }

      // Fetch ALL invoices using pagination (Supabase has a 1000 row limit per request)
      // Only include invoices where include_in_analysis is true or null
      const allInvoices: Invoice[] = [];
      const allInvoicesWithOutliers: Invoice[] = [];
      const pageSize = 1000;
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        
        const { data, error: queryError } = await supabase
          .from('invoices')
          .select('*')
          .eq('import_batch_id', batch.id)
          .range(from, to);

        if (queryError) throw queryError;

        const pageData = (data as Invoice[]) || [];
        allInvoicesWithOutliers.push(...pageData);
        
        // Filter to only include invoices marked for analysis
        // For outliers: only include if explicitly set to true (excluded by default)
        // For non-outliers: include if true, null, or undefined (included by default)
        const includedInvoices = pageData.filter(inv => {
          if (inv.is_outlier === true) {
            // Outliers are excluded by default, only include if explicitly true
            return inv.include_in_analysis === true;
          }
          // Non-outliers are included by default
          return inv.include_in_analysis === true || inv.include_in_analysis === null || inv.include_in_analysis === undefined;
        });
        allInvoices.push(...includedInvoices);

        hasMore = pageData.length === pageSize;
        page++;
      }

      // Apply dynamic days_old calculation based on current date
      const invoices = applyDynamicDaysOldToAll(allInvoices);
      
      // Calculate outlier stats from all invoices (also with dynamic days_old)
      const outlierInvoices = allInvoicesWithOutliers.filter(inv => inv.is_outlier === true);
      // Included: only if explicitly set to true (outliers are excluded by default)
      const includedOutliers = outlierInvoices.filter(inv => inv.include_in_analysis === true);
      // Excluded: false, null, or undefined (default behavior excludes them)
      const excludedOutliers = outlierInvoices.filter(inv => 
        inv.include_in_analysis === false || inv.include_in_analysis === null || inv.include_in_analysis === undefined
      );
      const outlierStats = {
        total: outlierInvoices.length,
        included: includedOutliers.length,
        excluded: excludedOutliers.length,
      };
      
      if (invoices.length === 0) {
        setStats(null);
        setLoading(false);
        return;
      }

      const totalInvoices = invoices.length;
      const totalValue = invoices.reduce((sum, inv) => sum + (inv.invoice_amount || 0), 0);
      
      // Ready for Payment: INVOICE_PROCESS_STATUS = "08 - Ready for Payment"
      const readyForPaymentInvoices = invoices.filter(inv => isReadyForPayment(inv.overall_process_state));
      const readyForPayment = {
        count: readyForPaymentInvoices.length,
        value: readyForPaymentInvoices.reduce((sum, inv) => sum + (inv.invoice_amount || 0), 0),
      };
      
      // Backlog invoices: all invoices that are NOT ready for payment
      // This is used for aging calculations since "Ready for Payment" invoices
      // are no longer part of the active backlog that requires attention
      const backlogInvoices = invoices.filter(inv => !isReadyForPayment(inv.overall_process_state));

      // Investigation invoices - based on process state containing "Investigation"
      // Note: The new CSV format (Output1.csv) only has INVOICE_PROCESS_STATUS field.
      // Previously, custom_invoice_status was also checked, but that field is not
      // present in the new data format.
      const investigationInvoices = invoices.filter(inv => 
        inv.overall_process_state?.includes('Investigation')
      );
      const requiresInvestigation = {
        count: investigationInvoices.length,
        value: investigationInvoices.reduce((sum, inv) => sum + (inv.invoice_amount || 0), 0),
      };

      // Average age is calculated on backlog invoices only (excludes Ready for Payment)
      const averageDaysOld = backlogInvoices.length > 0 
        ? backlogInvoices.reduce((sum, inv) => sum + (inv.days_old || 0), 0) / backlogInvoices.length 
        : 0;

      // Aging breakdown - unified buckets (uses backlog invoices only)
      const agingMap = new Map<string, { count: number; value: number }>();
      backlogInvoices.forEach(inv => {
        const bucket = getAgingBucket(inv.days_old || 0);
        const existing = agingMap.get(bucket) || { count: 0, value: 0 };
        agingMap.set(bucket, {
          count: existing.count + 1,
          value: existing.value + (inv.invoice_amount || 0),
        });
      });
      
      const agingOrder = ['0-30', '30-60', '60-90', '90-120', '120-180', '180-270', '270+'];
      const agingBreakdown = Array.from(agingMap.entries())
        .map(([bucket, data]) => ({ bucket, ...data }))
        .sort((a, b) => agingOrder.indexOf(a.bucket) - agingOrder.indexOf(b.bucket));

      // Process state breakdown - sorted by numeric prefix (01, 02, 03, etc.)
      const stateMap = new Map<string, { count: number; value: number }>();
      invoices.forEach(inv => {
        const state = inv.overall_process_state || 'Unknown';
        const existing = stateMap.get(state) || { count: 0, value: 0 };
        stateMap.set(state, {
          count: existing.count + 1,
          value: existing.value + (inv.invoice_amount || 0),
        });
      });
      
      // Extract numeric prefix for sorting (e.g., "03 - Header Verified" -> 3)
      const getStateOrder = (state: string): number => {
        const match = state.match(/^(\d+)/);
        return match ? parseInt(match[1], 10) : 999; // Unknown states go last
      };
      
      const processStateBreakdown = Array.from(stateMap.entries())
        .map(([state, data]) => ({ state, ...data }))
        .sort((a, b) => getStateOrder(a.state) - getStateOrder(b.state));

      // Top vendors (uses backlog invoices only - excludes Ready for Payment)
      const vendorMap = new Map<string, { count: number; value: number }>();
      backlogInvoices.forEach(inv => {
        const supplier = inv.supplier || 'Unknown';
        const existing = vendorMap.get(supplier) || { count: 0, value: 0 };
        vendorMap.set(supplier, {
          count: existing.count + 1,
          value: existing.value + (inv.invoice_amount || 0),
        });
      });
      const topVendors = Array.from(vendorMap.entries())
        .map(([supplier, data]) => ({ supplier, ...data }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

      // PO vs Non-PO breakdown - normalized to only PO and Non-PO categories
      // Uses backlog invoices only - excludes Ready for Payment
      const poMap = new Map<string, { count: number; value: number }>();
      backlogInvoices.forEach(inv => {
        // Normalize PO type - CSV uses "Yes" for PO and "No" for Non-PO
        let poType: string;
        const rawPoType = (inv.po_type || '').trim().toUpperCase();
        if (rawPoType === 'PO' || rawPoType === 'YES') {
          poType = 'PO';
        } else {
          // Everything else (including "No", "Non-PO", empty, etc.) is Non-PO
          poType = 'Non-PO';
        }
        
        const existing = poMap.get(poType) || { count: 0, value: 0 };
        poMap.set(poType, {
          count: existing.count + 1,
          value: existing.value + (inv.invoice_amount || 0),
        });
      });
      
      // Sort with PO first, then Non-PO
      const poOrder = ['PO', 'Non-PO'];
      const poBreakdown = Array.from(poMap.entries())
        .map(([type, data]) => ({ type, ...data }))
        .sort((a, b) => poOrder.indexOf(a.type) - poOrder.indexOf(b.type));

      // Monthly aging breakdown - all buckets (uses backlog invoices only)
      const monthlyBuckets = getMonthlyBuckets();

      const monthlyAgingBreakdown = monthlyBuckets.map(({ min, max, bucket, label }) => {
        const filtered = backlogInvoices.filter(inv => {
          const days = inv.days_old || 0;
          return days >= min && days < max;
        });
        return {
          bucket,
          label,
          count: filtered.length,
          value: filtered.reduce((sum, inv) => sum + (inv.invoice_amount || 0), 0),
          daysMin: min,
        };
      });

      setStats({
        totalInvoices,
        totalValue,
        readyForPayment,
        requiresInvestigation,
        averageDaysOld,
        agingBreakdown,
        monthlyAgingBreakdown,
        processStateBreakdown,
        topVendors,
        poBreakdown,
        outlierStats,
      });
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    
    // Listen for batch deletion events to refresh stats
    const handleBatchDeleted = () => {
      setTimeout(() => fetchStats(), 800);
    };

    // Listen for outlier changes to refresh stats
    const handleOutlierChanged = () => {
      setTimeout(() => fetchStats(), 500);
    };
    
    window.addEventListener('batchDeleted', handleBatchDeleted);
    window.addEventListener('outlierChanged', handleOutlierChanged);
    
    return () => {
      window.removeEventListener('batchDeleted', handleBatchDeleted);
      window.removeEventListener('outlierChanged', handleOutlierChanged);
    };
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats, currentBatch };
}

// Hook for getting batch comparison data
export function useBatchComparison(options: { includeOutliers?: boolean } = {}) {
  const { includeOutliers } = options;
  const [comparison, setComparison] = useState<{
    currentBatch: ImportBatch | null;
    previousBatch: ImportBatch | null;
    currentCount: number;
    previousCount: number;
    currentValue: number;
    previousValue: number;
    newInvoicesCount: number;
    resolvedInvoicesCount: number;
    newInvoicesValue: number;
    resolvedInvoicesValue: number;
    stateChanges: { state: string; current: number; previous: number; change: number }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchComparison = useCallback(async () => {
    setLoading(true);
    try {
      // Get the current batch with timeout
      const currentBatchResult = await withTimeout(
        supabase
          .from('import_batches')
          .select('*')
          .eq('is_current', true)
          .or('is_deleted.is.null,is_deleted.eq.false')
          .maybeSingle(),
        10000,
        timeoutResponse
      );

      if (currentBatchResult.error || !currentBatchResult.data) {
        setComparison(null);
        setLoading(false);
        return;
      }

      const currentBatch = currentBatchResult.data as ImportBatch;

      // Get the most recent non-deleted batch BEFORE the current one
      const previousBatchResult = await withTimeout(
        supabase
          .from('import_batches')
          .select('*')
          .lt('imported_at', currentBatch.imported_at)
          .or('is_deleted.is.null,is_deleted.eq.false')
          .order('imported_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        10000,
        timeoutResponse
      );

      const previousBatch = previousBatchResult.data as ImportBatch | null;

      // Get current batch invoices with pagination (respecting include_in_analysis)
      const current: Invoice[] = [];
      const pageSize = 1000;
      let currentPage = 0;
      let hasMoreCurrent = true;
      
      while (hasMoreCurrent) {
        const from = currentPage * pageSize;
        const to = from + pageSize - 1;
        let currentQuery = supabase
          .from('invoices')
          .select('*')
          .eq('import_batch_id', currentBatch.id);
        
        // Apply outlier filtering based on includeOutliers parameter
        if (includeOutliers === undefined) {
          // Default behavior: exclude outliers unless explicitly included
          currentQuery = currentQuery.or('and(or(is_outlier.is.null,is_outlier.eq.false),or(include_in_analysis.is.null,include_in_analysis.eq.true)),and(is_outlier.eq.true,include_in_analysis.eq.true)');
        } else if (includeOutliers === false) {
          // Exclude ALL outliers - only show non-outlier invoices
          currentQuery = currentQuery.or('is_outlier.is.null,is_outlier.eq.false');
        }
        // If includeOutliers is true, don't filter - show all invoices (matches useInvoices behavior)
        
        const { data: currentInvoices } = await currentQuery.range(from, to);
        
        if (currentInvoices && currentInvoices.length > 0) {
          current.push(...(currentInvoices as Invoice[]));
          hasMoreCurrent = currentInvoices.length === pageSize;
          currentPage++;
        } else {
          hasMoreCurrent = false;
        }
      }

      // Get previous batch invoices with pagination
      let previous: Invoice[] = [];
      if (previousBatch) {
        let prevPage = 0;
        let hasMorePrev = true;
        
        while (hasMorePrev) {
          const from = prevPage * pageSize;
          const to = from + pageSize - 1;
          let prevQuery = supabase
            .from('invoices')
            .select('*')
            .eq('import_batch_id', previousBatch.id);
          
          // Apply same outlier filtering as current batch for fair comparison
          if (includeOutliers === undefined) {
            prevQuery = prevQuery.or('and(or(is_outlier.is.null,is_outlier.eq.false),or(include_in_analysis.is.null,include_in_analysis.eq.true)),and(is_outlier.eq.true,include_in_analysis.eq.true)');
          } else if (includeOutliers === false) {
            // Exclude ALL outliers - only show non-outlier invoices
            prevQuery = prevQuery.or('is_outlier.is.null,is_outlier.eq.false');
          }
          // If includeOutliers is true, don't filter - show all invoices (matches useInvoices behavior)
          
          const { data: prevInvoices } = await prevQuery.range(from, to);
          
          if (prevInvoices && prevInvoices.length > 0) {
            previous.push(...(prevInvoices as Invoice[]));
            hasMorePrev = prevInvoices.length === pageSize;
            prevPage++;
          } else {
            hasMorePrev = false;
          }
        }
      }

      // Calculate totals
      const currentValue = current.reduce((sum, inv) => sum + (inv.invoice_amount || 0), 0);
      const previousValue = previous.reduce((sum, inv) => sum + (inv.invoice_amount || 0), 0);

      // Find new and resolved invoices by invoice_id
      const previousIds = new Set(previous.map(inv => inv.invoice_id));
      const currentIds = new Set(current.map(inv => inv.invoice_id));

      const newInvoices = current.filter(inv => !previousIds.has(inv.invoice_id));
      const resolvedInvoices = previous.filter(inv => !currentIds.has(inv.invoice_id));

      // Calculate state changes
      const currentStateMap = new Map<string, { count: number; value: number }>();
      const previousStateMap = new Map<string, { count: number; value: number }>();

      current.forEach(inv => {
        const state = inv.overall_process_state || 'Unknown';
        const existing = currentStateMap.get(state) || { count: 0, value: 0 };
        currentStateMap.set(state, { count: existing.count + 1, value: existing.value + (inv.invoice_amount || 0) });
      });

      previous.forEach(inv => {
        const state = inv.overall_process_state || 'Unknown';
        const existing = previousStateMap.get(state) || { count: 0, value: 0 };
        previousStateMap.set(state, { count: existing.count + 1, value: existing.value + (inv.invoice_amount || 0) });
      });

      const allStates = new Set([...currentStateMap.keys(), ...previousStateMap.keys()]);
      const stateChanges = Array.from(allStates).map(state => ({
        state,
        current: currentStateMap.get(state)?.count || 0,
        previous: previousStateMap.get(state)?.count || 0,
        change: (currentStateMap.get(state)?.count || 0) - (previousStateMap.get(state)?.count || 0),
      })).sort((a, b) => {
        // Extract numeric prefix for sorting (e.g., "01 - Header" -> 1)
        const getOrder = (state: string): number => {
          const match = state.match(/^(\d+)/);
          return match ? parseInt(match[1], 10) : 999;
        };
        return getOrder(a.state) - getOrder(b.state);
      });

      setComparison({
        currentBatch,
        previousBatch,
        currentCount: current.length,
        previousCount: previous.length,
        currentValue,
        previousValue,
        newInvoicesCount: newInvoices.length,
        resolvedInvoicesCount: resolvedInvoices.length,
        newInvoicesValue: newInvoices.reduce((sum, inv) => sum + (inv.invoice_amount || 0), 0),
        resolvedInvoicesValue: resolvedInvoices.reduce((sum, inv) => sum + (inv.invoice_amount || 0), 0),
        stateChanges,
      });
    } catch (err) {
      console.error('Error fetching comparison:', err);
      setComparison(null);
    } finally {
      setLoading(false);
    }
  }, [includeOutliers]);

  useEffect(() => {
    fetchComparison();
  }, [fetchComparison]);

  useEffect(() => {
    const handleBatchDeleted = () => {
      setTimeout(() => fetchComparison(), 800);
    };
    
    window.addEventListener('batchDeleted', handleBatchDeleted);
    
    return () => {
      window.removeEventListener('batchDeleted', handleBatchDeleted);
    };
  }, [fetchComparison]);

  return { comparison, loading, refetch: fetchComparison };
}

// Helper function to get aging bucket based on days old
function getAgingBucket(daysOld: number): string {
  if (daysOld < 30) return '0-30';
  if (daysOld < 60) return '30-60';
  if (daysOld < 90) return '60-90';
  if (daysOld < 120) return '90-120';
  if (daysOld < 180) return '120-180';
  if (daysOld < 270) return '180-270';
  return '270+';
}

// Helper function to get monthly buckets - unified for all data
function getMonthlyBuckets() {
  return [
    { min: 0, max: 30, bucket: '0-30', label: '0-30 days' },
    { min: 30, max: 60, bucket: '30-60', label: '30-60 days' },
    { min: 60, max: 90, bucket: '60-90', label: '60-90 days' },
    { min: 90, max: 120, bucket: '90-120', label: '90-120 days' },
    { min: 120, max: 150, bucket: '120-150', label: '120-150 days' },
    { min: 150, max: 180, bucket: '150-180', label: '150-180 days' },
    { min: 180, max: 210, bucket: '180-210', label: '180-210 days' },
    { min: 210, max: 240, bucket: '210-240', label: '210-240 days' },
    { min: 240, max: 270, bucket: '240-270', label: '240-270 days' },
    { min: 270, max: 300, bucket: '270-300', label: '270-300 days' },
    { min: 300, max: 330, bucket: '300-330', label: '300-330 days' },
    { min: 330, max: 360, bucket: '330-360', label: '330-360 days' },
    { min: 360, max: Infinity, bucket: '360+', label: '360+ days' },
  ];
}

// Check if invoice status is "Ready For Payment" (process state 08)
// This is the single source of truth for this check - used across dashboard, aging, and trends
export function isReadyForPayment(processState: string | null | undefined): boolean {
  const state = processState?.trim() || '';
  return state.startsWith('08') || state.toLowerCase().includes('ready for payment');
}

// Export helper functions for use in other components
export { getMonthlyBuckets, getAgingBucket };

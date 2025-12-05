import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Invoice, ImportBatch } from '../types/database';

interface UseInvoicesOptions {
  page?: number;
  pageSize?: number;
  supplier?: string;
  overallProcessState?: string;
  agingBucket?: string;
  minAmount?: number;
  maxAmount?: number;
  sortBy?: keyof Invoice;
  sortOrder?: 'asc' | 'desc';
  batchId?: string; // Optional: specific batch, otherwise uses current
}

// Helper to get the current batch ID
async function getCurrentBatchId(): Promise<string | null> {
  const { data } = await supabase
    .from('import_batches')
    .select('id')
    .eq('is_current', true)
    .single();
  return data?.id || null;
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
    agingBucket,
    minAmount,
    maxAmount,
    sortBy = 'days_old',
    sortOrder = 'desc',
    batchId,
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
      
      // Always filter by batch
      query = query.eq('import_batch_id', targetBatchId);

      if (supplier) query = query.ilike('supplier', `%${supplier}%`);
      if (overallProcessState) query = query.eq('overall_process_state', overallProcessState);
      if (agingBucket) query = query.eq('aging_bucket', agingBucket);
      if (minAmount !== undefined) query = query.gte('invoice_amount', minAmount);
      if (maxAmount !== undefined) query = query.lte('invoice_amount', maxAmount);

      query = query.order(sortBy as string, { ascending: sortOrder === 'asc' });

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error: queryError, count } = await query;

      if (queryError) throw queryError;

      setInvoices((data as Invoice[]) || []);
      setTotalCount(count || 0);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, supplier, overallProcessState, agingBucket, minAmount, maxAmount, sortBy, sortOrder, batchId]);

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
      // Fetch all batches including deleted ones for display purposes
      const { data, error: queryError } = await supabase
        .from('import_batches')
        .select('*')
        .order('imported_at', { ascending: false });

      if (queryError) throw queryError;
      setBatches((data as ImportBatch[]) || []);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteBatch = useCallback(async (batchId: string): Promise<{ success: boolean; error?: string }> => {
    setDeleting(batchId);
    try {
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
      
      // Find the batch to delete
      const batchToDelete = nonDeletedBatches.find(b => b.id === batchId);
      if (!batchToDelete) {
        throw new Error('Batch not found or already deleted');
      }

      // Enforce sequential deletion: only allow deleting the most recent non-deleted batch
      const mostRecentBatch = nonDeletedBatches[0];
      if (batchToDelete.id !== mostRecentBatch.id) {
        throw new Error('Batches must be deleted from most recent to oldest. Please delete batches in order from top to bottom.');
      }

      const wasCurrent = batchToDelete.is_current;

      // Soft delete: mark as deleted instead of actually deleting
      const { error: updateError } = await supabase
        .from('import_batches')
        .update({ is_deleted: true })
        .eq('id', batchId);

      if (updateError) {
        console.error('Error marking batch as deleted:', updateError);
        throw new Error(`Failed to delete batch: ${updateError.message}`);
      }

      console.log(`Successfully marked batch ${batchId} as deleted`);

      // If the deleted batch was current, set the next most recent non-deleted batch as current
      if (wasCurrent && nonDeletedBatches.length > 1) {
        // Get the next most recent batch (skip the one we're deleting)
        const nextBatch = nonDeletedBatches[1];
        
        // First, clear all current flags
        await supabase
          .from('import_batches')
          .update({ is_current: false })
          .neq('id', batchId);

        // Set the next batch as current
        const { error: updateCurrentError } = await supabase
          .from('import_batches')
          .update({ is_current: true })
          .eq('id', nextBatch.id);
        
        if (updateCurrentError) {
          console.error('Error updating current batch:', updateCurrentError);
          throw new Error(`Failed to set new current batch: ${updateCurrentError.message}`);
        }
        console.log(`Set batch ${nextBatch.id} (${nextBatch.filename}) as current`);
      }

      // Refresh the batches list
      await fetchBatches();
      
      // Dispatch custom event to notify other components to refresh
      console.log('Dispatching batchDeleted event to refresh comparison and dashboard...');
      window.dispatchEvent(new CustomEvent('batchDeleted', { detail: { batchId, deletedAt: new Date().toISOString() } }));
      console.log('Batch deleted event dispatched');
      
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete batch';
      console.error('Delete batch error:', err);
      setError(err as Error);
      return { success: false, error: errorMessage };
    } finally {
      setDeleting(null);
    }
  }, [fetchBatches]);

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
}

export function useDashboardStats() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [currentBatch, setCurrentBatch] = useState<ImportBatch | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      // Get current batch, excluding deleted batches
      const { data: batchData } = await supabase
        .from('import_batches')
        .select('*')
        .eq('is_current', true)
        .or('is_deleted.is.null,is_deleted.eq.false')
        .single();
      
      const batch = batchData as ImportBatch | null;
      setCurrentBatch(batch);
      
      if (!batch) {
        setStats(null);
        return;
      }

      // Only fetch invoices from current batch
      const { data, error: queryError } = await supabase
        .from('invoices')
        .select('*')
        .eq('import_batch_id', batch.id);

      if (queryError) throw queryError;
      
      const invoices = (data as Invoice[]) || [];
      
      if (invoices.length === 0) {
        setStats(null);
        return;
      }

      const totalInvoices = invoices.length;
      const totalValue = invoices.reduce((sum, inv) => sum + (inv.invoice_amount || 0), 0);
      
      const readyForPaymentInvoices = invoices.filter(inv => 
        inv.overall_process_state?.includes('Ready for Payment')
      );
      const readyForPayment = {
        count: readyForPaymentInvoices.length,
        value: readyForPaymentInvoices.reduce((sum, inv) => sum + (inv.invoice_amount || 0), 0),
      };

      const investigationInvoices = invoices.filter(inv => 
        inv.overall_process_state?.includes('Investigation') || 
        inv.custom_invoice_status?.includes('Investigation')
      );
      const requiresInvestigation = {
        count: investigationInvoices.length,
        value: investigationInvoices.reduce((sum, inv) => sum + (inv.invoice_amount || 0), 0),
      };

      const averageDaysOld = invoices.reduce((sum, inv) => sum + (inv.days_old || 0), 0) / totalInvoices || 0;

      // Aging breakdown
      const agingMap = new Map<string, { count: number; value: number }>();
      invoices.forEach(inv => {
        const bucket = getAgingBucket(inv.days_old || 0);
        const existing = agingMap.get(bucket) || { count: 0, value: 0 };
        agingMap.set(bucket, {
          count: existing.count + 1,
          value: existing.value + (inv.invoice_amount || 0),
        });
      });
      const agingBreakdown = Array.from(agingMap.entries())
        .map(([bucket, data]) => ({ bucket, ...data }))
        .sort((a, b) => {
          const order = ['90-120', '120-180', '180-270', '270+'];
          return order.indexOf(a.bucket) - order.indexOf(b.bucket);
        });

      // Process state breakdown
      const stateMap = new Map<string, { count: number; value: number }>();
      invoices.forEach(inv => {
        const state = inv.overall_process_state || 'Unknown';
        const existing = stateMap.get(state) || { count: 0, value: 0 };
        stateMap.set(state, {
          count: existing.count + 1,
          value: existing.value + (inv.invoice_amount || 0),
        });
      });
      const processStateBreakdown = Array.from(stateMap.entries())
        .map(([state, data]) => ({ state, ...data }))
        .sort((a, b) => b.count - a.count);

      // Top vendors
      const vendorMap = new Map<string, { count: number; value: number }>();
      invoices.forEach(inv => {
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

      // PO vs Non-PO breakdown
      const poMap = new Map<string, { count: number; value: number }>();
      invoices.forEach(inv => {
        const poType = inv.po_type || 'Unknown';
        const existing = poMap.get(poType) || { count: 0, value: 0 };
        poMap.set(poType, {
          count: existing.count + 1,
          value: existing.value + (inv.invoice_amount || 0),
        });
      });
      const poBreakdown = Array.from(poMap.entries())
        .map(([type, data]) => ({ type, ...data }))
        .sort((a, b) => b.value - a.value);

      // Monthly aging breakdown (30-day intervals)
      const monthlyBuckets = [
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

      const monthlyAgingBreakdown = monthlyBuckets.map(({ min, max, bucket, label }) => {
        const filtered = invoices.filter(inv => {
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
      console.log('Dashboard stats: Batch deleted event received, refreshing...');
      // Add delay to ensure database has fully processed deletion
      setTimeout(() => {
        console.log('Dashboard stats: Executing refresh...');
        fetchStats();
      }, 800);
    };
    
    window.addEventListener('batchDeleted', handleBatchDeleted);
    
    return () => {
      window.removeEventListener('batchDeleted', handleBatchDeleted);
    };
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats, currentBatch };
}

// Hook for getting batch comparison data
export function useBatchComparison() {
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
    console.log('Fetching batch comparison...');
    try {
      // Get the current batch (is_current = true), excluding deleted batches
      const { data: currentBatchData, error: currentBatchError } = await supabase
        .from('import_batches')
        .select('*')
        .eq('is_current', true)
        .or('is_deleted.is.null,is_deleted.eq.false')
        .single();

      if (currentBatchError || !currentBatchData) {
        console.log('No current batch found, using fallback logic');
        // Fallback: use the most recent non-deleted batch if no current is set
        const { data: recentBatches } = await supabase
          .from('import_batches')
          .select('*')
          .or('is_deleted.is.null,is_deleted.eq.false')
          .order('imported_at', { ascending: false })
          .limit(1);
        
        if (!recentBatches || recentBatches.length === 0) {
          setComparison(null);
          return;
        }
        
        const currentBatch = recentBatches[0] as ImportBatch;
        
        // Get the most recent non-deleted batch BEFORE the current one
        const { data: previousBatchData } = await supabase
          .from('import_batches')
          .select('*')
          .lt('imported_at', currentBatch.imported_at)
          .or('is_deleted.is.null,is_deleted.eq.false')
          .order('imported_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const previousBatch = previousBatchData as ImportBatch | null;

        // Get invoices for comparison
        const { data: currentInvoices } = await supabase
          .from('invoices')
          .select('*')
          .eq('import_batch_id', currentBatch.id);
        
        const current = (currentInvoices as Invoice[]) || [];
        let previous: Invoice[] = [];
        
        if (previousBatch) {
          const { data: prevInvoices } = await supabase
            .from('invoices')
            .select('*')
            .eq('import_batch_id', previousBatch.id);
          previous = (prevInvoices as Invoice[]) || [];
        }

        // Calculate comparison (code continues below...)
        const currentValue = current.reduce((sum, inv) => sum + (inv.invoice_amount || 0), 0);
        const previousValue = previous.reduce((sum, inv) => sum + (inv.invoice_amount || 0), 0);

        const previousIds = new Set(previous.map(inv => inv.invoice_id));
        const currentIds = new Set(current.map(inv => inv.invoice_id));

        const newInvoices = current.filter(inv => !previousIds.has(inv.invoice_id));
        const resolvedInvoices = previous.filter(inv => !currentIds.has(inv.invoice_id));

        // Calculate state changes
        const currentStateMap = new Map<string, { count: number; value: number }>();
        const previousStateMap = new Map<string, { count: number; value: number }>();

        current.forEach(inv => {
          const state = inv.overall_process_state?.replace(/^\d+\s*-\s*/, '') || 'Unknown';
          const existing = currentStateMap.get(state) || { count: 0, value: 0 };
          currentStateMap.set(state, { count: existing.count + 1, value: existing.value + (inv.invoice_amount || 0) });
        });

        previous.forEach(inv => {
          const state = inv.overall_process_state?.replace(/^\d+\s*-\s*/, '') || 'Unknown';
          const existing = previousStateMap.get(state) || { count: 0, value: 0 };
          previousStateMap.set(state, { count: existing.count + 1, value: existing.value + (inv.invoice_amount || 0) });
        });

        const allStates = new Set([...currentStateMap.keys(), ...previousStateMap.keys()]);
        const stateChanges = Array.from(allStates).map(state => ({
          state,
          current: currentStateMap.get(state)?.count || 0,
          previous: previousStateMap.get(state)?.count || 0,
          change: (currentStateMap.get(state)?.count || 0) - (previousStateMap.get(state)?.count || 0),
        })).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

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
        return;
      }

      const currentBatch = currentBatchData as ImportBatch;
      console.log(`Current batch: ${currentBatch.filename} (${currentBatch.imported_at}), ID: ${currentBatch.id}`);

      // Get the most recent non-deleted batch BEFORE the current one (this ensures deleted batches are skipped)
      const { data: previousBatchData, error: previousBatchError } = await supabase
        .from('import_batches')
        .select('*')
        .lt('imported_at', currentBatch.imported_at)
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('imported_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (previousBatchError) {
        console.error('Error fetching previous batch:', previousBatchError);
      }

      const previousBatch = previousBatchData as ImportBatch | null;
      if (previousBatch) {
        console.log(`Previous batch: ${previousBatch.filename} (${previousBatch.imported_at}), ID: ${previousBatch.id}`);
      } else {
        console.log('No previous batch found');
      }

      // Get current batch invoices
      const { data: currentInvoices } = await supabase
        .from('invoices')
        .select('*')
        .eq('import_batch_id', currentBatch.id);
      
      const current = (currentInvoices as Invoice[]) || [];

      // Get previous batch invoices
      let previous: Invoice[] = [];
      if (previousBatch) {
        const { data: prevInvoices } = await supabase
          .from('invoices')
          .select('*')
          .eq('import_batch_id', previousBatch.id);
        previous = (prevInvoices as Invoice[]) || [];
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
        const state = inv.overall_process_state?.replace(/^\d+\s*-\s*/, '') || 'Unknown';
        const existing = currentStateMap.get(state) || { count: 0, value: 0 };
        currentStateMap.set(state, { count: existing.count + 1, value: existing.value + (inv.invoice_amount || 0) });
      });

      previous.forEach(inv => {
        const state = inv.overall_process_state?.replace(/^\d+\s*-\s*/, '') || 'Unknown';
        const existing = previousStateMap.get(state) || { count: 0, value: 0 };
        previousStateMap.set(state, { count: existing.count + 1, value: existing.value + (inv.invoice_amount || 0) });
      });

      const allStates = new Set([...currentStateMap.keys(), ...previousStateMap.keys()]);
      const stateChanges = Array.from(allStates).map(state => ({
        state,
        current: currentStateMap.get(state)?.count || 0,
        previous: previousStateMap.get(state)?.count || 0,
        change: (currentStateMap.get(state)?.count || 0) - (previousStateMap.get(state)?.count || 0),
      })).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

      const comparisonData = {
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
      };
      
      console.log('Comparison data:', {
        current: `${comparisonData.currentBatch.filename} (${comparisonData.currentCount} invoices, $${comparisonData.currentValue})`,
        previous: previousBatch ? `${comparisonData.previousBatch?.filename} (${comparisonData.previousCount} invoices, $${comparisonData.previousValue})` : 'None',
        newInvoices: comparisonData.newInvoicesCount,
        resolvedInvoices: comparisonData.resolvedInvoicesCount,
      });
      
      setComparison(comparisonData);
    } catch (err) {
      console.error('Error fetching comparison:', err);
      setComparison(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchComparison();
  }, [fetchComparison]);

  useEffect(() => {
    // Listen for batch deletion events to refresh comparison
    const handleBatchDeleted = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log('Batch deleted event received:', customEvent.detail);
      console.log('Refreshing comparison after batch deletion...');
      // Add a delay to ensure database has fully processed the deletion
      // and comparison query will find the correct previous batch
      setTimeout(() => {
        console.log('Executing comparison refresh...');
        fetchComparison();
      }, 800); // Longer delay to ensure database is fully synced
    };
    
    window.addEventListener('batchDeleted', handleBatchDeleted);
    
    return () => {
      window.removeEventListener('batchDeleted', handleBatchDeleted);
    };
  }, [fetchComparison]);

  return { comparison, loading, refetch: fetchComparison };
}

function getAgingBucket(daysOld: number): string {
  if (daysOld <= 120) return '90-120';
  if (daysOld <= 180) return '120-180';
  if (daysOld <= 270) return '180-270';
  return '270+';
}

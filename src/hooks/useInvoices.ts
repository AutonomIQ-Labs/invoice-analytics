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
}

export function useInvoices(options: UseInvoicesOptions = {}) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

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
  } = options;

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase.from('invoices').select('*', { count: 'exact' });

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
  }, [page, pageSize, supplier, overallProcessState, agingBucket, minAmount, maxAmount, sortBy, sortOrder]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  return { invoices, totalCount, loading, error, refetch: fetchInvoices };
}

export function useImportBatches() {
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
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

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  return { batches, loading, error, refetch: fetchBatches };
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

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: queryError } = await supabase.from('invoices').select('*');

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
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
}

function getAgingBucket(daysOld: number): string {
  if (daysOld <= 120) return '90-120';
  if (daysOld <= 180) return '120-180';
  if (daysOld <= 270) return '180-270';
  return '270+';
}

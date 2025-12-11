export interface Invoice {
  id: string;
  // Core invoice fields from new CSV
  invoice_date: string | null;
  invoice_id: string | null;
  creation_date: string | null;
  business_unit: string | null;
  supplier: string | null;
  supplier_type: string | null;
  invoice_number: string | null;
  invoice_amount: number | null;
  payment_method: string | null;
  payment_terms: string | null;
  invoice_type: string | null;
  po_type: string | null;
  coded_by: string | null;
  approver_id: string | null;
  approval_response: string | null;
  approval_date: string | null;
  overall_process_state: string | null;
  payment_amount: number | null;
  payment_date: string | null;
  identifying_po: string | null;
  // Routing attributes (4 total)
  routing_attribute1: string | null;
  routing_attribute2: string | null;
  routing_attribute3: string | null;
  routing_attribute4: string | null;
  // Calculated fields
  days_old: number | null;
  // Import tracking
  import_batch_id: string | null;
  imported_at: string;
  // Outlier tracking fields
  is_outlier?: boolean;
  outlier_reason?: 'high_value' | 'negative' | null;
  include_in_analysis?: boolean;
}

export interface ImportBatch {
  id: string;
  filename: string;
  record_count: number;
  skipped_count: number;
  imported_at: string;
  imported_by: string | null;
  is_current: boolean;
  is_deleted?: boolean;
  // Detailed import statistics
  skipped_fully_paid?: number;
  outlier_count?: number;
  outlier_high_value?: number;
  outlier_negative?: number;
}

export interface OutlierSettings {
  id: string;
  user_id: string;
  include_high_value: boolean;
  include_negative: boolean;
  high_value_threshold: number;
  created_at: string;
  updated_at: string;
}

export interface BatchComparison {
  currentBatch: ImportBatch;
  previousBatch: ImportBatch | null;
  newInvoices: Invoice[];
  resolvedInvoices: Invoice[];
  unchangedInvoices: Invoice[];
  statusChanges: {
    invoice: Invoice;
    previousState: string;
    currentState: string;
  }[];
}

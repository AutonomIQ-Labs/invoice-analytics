export interface Invoice {
  id: string;
  invoice_date: string | null;
  invoice_id: string | null;
  creation_date: string | null;
  business_unit: string | null;
  approval_status: string | null;
  supplier: string | null;
  supplier_type: string | null;
  invoice_number: string | null;
  invoice_amount: number | null;
  validation_status: string | null;
  payment_method: string | null;
  payment_terms: string | null;
  payment_status: string | null;
  payment_status_indicator: string | null;
  routing_attribute: string | null;
  account_coding_status: string | null;
  days_old: number | null;
  aging_bucket: string | null;
  invoice_type: string | null;
  custom_invoice_status: string | null;
  overall_process_state: string | null;
  po_type: string | null;
  identifying_po: string | null;
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

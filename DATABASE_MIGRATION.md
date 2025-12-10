# Database Migration Guide

## Single Combined Import Schema

This application uses a single combined CSV import containing all invoice data from the AP Invoice Aging Report.

### Current Schema (v2.0 - AP Invoice Aging Report Format)

```sql
-- Import batches table
CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  record_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  skipped_fully_paid INTEGER DEFAULT 0,
  outlier_count INTEGER DEFAULT 0,
  outlier_high_value INTEGER DEFAULT 0,
  outlier_negative INTEGER DEFAULT 0,
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  imported_by UUID REFERENCES auth.users(id),
  is_current BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false
);

-- Invoices table with all fields from AP Invoice Aging Report
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Basic invoice information
  invoice_date DATE,
  invoice_id TEXT,
  creation_date DATE,
  business_unit TEXT,
  invoice_number TEXT,
  invoice_amount NUMERIC(15,2),
  invoice_type TEXT,
  invoice_status TEXT,
  days_old INTEGER,
  aging_bucket TEXT,
  -- Supplier information
  supplier TEXT,
  supplier_type TEXT,
  -- Approval & Workflow
  approval_status TEXT,
  validation_status TEXT,
  account_coding_status TEXT,
  coded_by TEXT,
  approver_id TEXT,
  wfapproval_status_code TEXT,
  wfapproval_status TEXT,
  approval_response TEXT,
  action_date DATE,
  custom_invoice_status TEXT,
  overall_process_state TEXT,
  -- Payment information
  payment_status TEXT,
  payment_status_indicator TEXT,
  payment_method TEXT,
  payment_terms TEXT,
  payment_amount NUMERIC(15,2),
  payment_date DATE,
  enter_to_payment INTEGER,
  -- PO & Routing
  po_type TEXT,
  identifying_po TEXT,
  routing_attribute TEXT,
  -- Import tracking
  import_batch_id UUID REFERENCES import_batches(id),
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  -- Outlier tracking
  is_outlier BOOLEAN DEFAULT false,
  outlier_reason TEXT,
  include_in_analysis BOOLEAN DEFAULT true
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_batch ON invoices(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_invoices_supplier ON invoices(supplier);
CREATE INDEX IF NOT EXISTS idx_invoices_days_old ON invoices(days_old);
CREATE INDEX IF NOT EXISTS idx_invoices_process_state ON invoices(overall_process_state);
CREATE INDEX IF NOT EXISTS idx_invoices_approver ON invoices(approver_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_current ON import_batches(is_current);
```

### Migration from Previous Schema (v1.x)

If migrating from the previous schema, add the new columns:

```sql
-- Add new columns to invoices table
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS coded_by TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS wfapproval_status_code TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS wfapproval_status TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_status TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS approver_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS approval_response TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS action_date DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_amount NUMERIC(15,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_date DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS enter_to_payment INTEGER;

-- Add new indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_invoices_process_state ON invoices(overall_process_state);
CREATE INDEX IF NOT EXISTS idx_invoices_approver ON invoices(approver_id);

-- Remove obsolete columns from import_batches (if exists)
ALTER TABLE import_batches DROP COLUMN IF EXISTS skipped_zero_value;
ALTER TABLE import_batches DROP COLUMN IF EXISTS aging_category;
```

### CSV Column Mapping

The new AP Invoice Aging Report CSV uses the following column mapping:

| CSV Header             | Database Column         |
|------------------------|-------------------------|
| INVOICE_NUM            | invoice_number          |
| INVOICE_DATE           | invoice_date            |
| INVOICE_ID             | invoice_id              |
| CREATION_DATE          | creation_date           |
| BUSINESS_UNIT          | business_unit           |
| APPROVAL_STATUS        | approval_status         |
| SUPPLIER_NAME          | supplier                |
| VENDOR_TYPE            | supplier_type           |
| INVOICE_AMOUNT         | invoice_amount          |
| VALIDATION_STATUS      | validation_status       |
| PAYMENT_METHOD_CODE    | payment_method          |
| PAYMENT_TERMS          | payment_terms           |
| PAYMENT_STATUS         | payment_status          |
| PAYMENT_STATUS_FLAG    | payment_status_indicator|
| CODING_STATUS          | account_coding_status   |
| DAYS_OLD               | days_old                |
| AGING                  | aging_bucket            |
| INVOICE_TYPE           | invoice_type            |
| PO_NONPO               | po_type                 |
| CODED_BY               | coded_by                |
| WFAPPROVAL_STATUS_CODE | wfapproval_status_code  |
| WFAPPROVAL_STATUS      | wfapproval_status       |
| INVOICE_STATUS         | invoice_status          |
| INVOICE_PROCESS_STATUS | overall_process_state   |
| APPROVER_ID            | approver_id             |
| RESPONSE               | approval_response       |
| ACTION_DATE            | action_date             |
| ROUTING_ATTRIBUTE3     | routing_attribute       |
| PO_NUMBER              | identifying_po          |
| PAYMENT_AMOUNT         | payment_amount          |
| PAYMENT_DATE           | payment_date            |
| ENTER_TO_PAYMENT       | enter_to_payment        |

### Notes

- Zero-value invoices are now pre-filtered in the source data, so no filtering is applied during import
- "09 - Fully Paid" invoices are still filtered out during import
- Date fields support ISO 8601 format (e.g., `2025-11-30T18:00:00.000-06:00`)
- Outliers (high-value in "01 - Header To Be Verified" state, or negative amounts) are flagged but not filtered

# Database Migration Guide

## New CSV Format (Output1.csv)

This application uses a simplified CSV format with the following fields.

### Current Schema (v3.0 - Simplified Output1.csv Format)

```sql
-- Import batches table
CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  record_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  skipped_fully_paid INTEGER DEFAULT 0,
  skipped_zero_value INTEGER DEFAULT 0,
  outlier_count INTEGER DEFAULT 0,
  outlier_high_value INTEGER DEFAULT 0,
  outlier_negative INTEGER DEFAULT 0,
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  imported_by UUID REFERENCES auth.users(id),
  is_current BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false
);

-- Invoices table with all fields from Output1.csv
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
  days_old INTEGER,
  -- Supplier information
  supplier TEXT,
  supplier_type TEXT,
  -- Approval & Workflow
  coded_by TEXT,
  approver_id TEXT,
  approval_response TEXT,
  approval_date DATE,
  overall_process_state TEXT,
  -- Payment information
  payment_method TEXT,
  payment_terms TEXT,
  payment_amount NUMERIC(15,2),
  payment_date DATE,
  -- PO & Routing
  po_type TEXT,
  identifying_po TEXT,
  routing_attribute1 TEXT,
  routing_attribute2 TEXT,
  routing_attribute3 TEXT,
  routing_attribute4 TEXT,
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

### Migration from Previous Schema (v2.x)

If migrating from the previous schema, add/modify columns:

```sql
-- Add new routing attribute columns
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS routing_attribute1 TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS routing_attribute2 TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS routing_attribute3 TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS routing_attribute4 TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS approval_date DATE;

-- Optional: Remove columns no longer used in new CSV format
-- Note: Only do this if you don't need to support the old CSV format
ALTER TABLE invoices DROP COLUMN IF EXISTS approval_status;
ALTER TABLE invoices DROP COLUMN IF EXISTS validation_status;
ALTER TABLE invoices DROP COLUMN IF EXISTS payment_status;
ALTER TABLE invoices DROP COLUMN IF EXISTS payment_status_indicator;
ALTER TABLE invoices DROP COLUMN IF EXISTS account_coding_status;
ALTER TABLE invoices DROP COLUMN IF EXISTS aging_bucket;
ALTER TABLE invoices DROP COLUMN IF EXISTS invoice_status;
ALTER TABLE invoices DROP COLUMN IF EXISTS custom_invoice_status;
ALTER TABLE invoices DROP COLUMN IF EXISTS wfapproval_status_code;
ALTER TABLE invoices DROP COLUMN IF EXISTS wfapproval_status;
ALTER TABLE invoices DROP COLUMN IF EXISTS action_date;
ALTER TABLE invoices DROP COLUMN IF EXISTS enter_to_payment;
ALTER TABLE invoices DROP COLUMN IF EXISTS routing_attribute;
```

### CSV Column Mapping (Output1.csv)

The new Output1.csv uses the following column mapping:

| CSV Header            | Database Column         |
|-----------------------|-------------------------|
| INVOICE_DATE          | invoice_date            |
| INVOICE_ID            | invoice_id              |
| CREATION_DATE         | creation_date           |
| BUSINESS_UNIT         | business_unit           |
| SUPPLIER_NAME         | supplier                |
| SUPPLIER_TYPE         | supplier_type           |
| INVOICE_NUM           | invoice_number          |
| INVOICE_AMOUNT        | invoice_amount          |
| PAYMENT_METHOD_CODE   | payment_method          |
| PAYMENT_TERMS         | payment_terms           |
| INVOICE_TYPE          | invoice_type            |
| PO_NONPO              | po_type                 |
| CODED_BY              | coded_by                |
| APPROVER_ID           | approver_id             |
| APPROVAL_RESPONSE     | approval_response       |
| APPROVAL_DATE         | approval_date           |
| INVOICE_PROCESS_STATUS| overall_process_state   |
| PAYMENT_AMOUNT        | payment_amount          |
| PAYMENT_DATE          | payment_date            |
| PO_NUMBER             | identifying_po          |
| ROUTING_ATTRIBUTE1    | routing_attribute1      |
| ROUTING_ATTRIBUTE2    | routing_attribute2      |
| ROUTING_ATTRIBUTE3    | routing_attribute3      |
| ROUTING_ATTRIBUTE4    | routing_attribute4      |

### Calculated Fields

- `days_old` - Calculated dynamically from `invoice_date` vs current date during import and display

### Quick Migration: Add skipped_zero_value Column

```sql
-- Add column to track zero-value invoices that were skipped
ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS skipped_zero_value INTEGER DEFAULT 0;
```

### Notes

- PO_NONPO values "Yes"/"No" are normalized to "PO"/"Non-PO" during import
- Date fields support ISO 8601 format (e.g., `2025-11-30T18:00:00.000-06:00`) and YYYY-MM-DD
- Zero-value invoices (amount = 0) are automatically filtered out during import
- Fully paid invoices (process state starts with "09" or contains "fully paid") are filtered out during import
- Outliers (high-value >$100K in "01 - Header To Be Verified" state, or negative amounts) are flagged but not filtered
- Outliers are excluded from dashboard analytics by default but can be managed in the Outliers page

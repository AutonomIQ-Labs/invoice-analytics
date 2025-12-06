# Database Migration Guide

## Single Combined Import Schema

This application uses a single combined CSV import containing all invoice data.

### Current Schema

```sql
-- Import batches table (no aging_category)
CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  record_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  imported_by UUID REFERENCES auth.users(id),
  is_current BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false
);

-- Invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_date DATE,
  invoice_id TEXT,
  creation_date DATE,
  business_unit TEXT,
  approval_status TEXT,
  supplier TEXT,
  supplier_type TEXT,
  invoice_number TEXT,
  invoice_amount NUMERIC(15,2),
  validation_status TEXT,
  payment_method TEXT,
  payment_terms TEXT,
  payment_status TEXT,
  payment_status_indicator TEXT,
  routing_attribute TEXT,
  account_coding_status TEXT,
  days_old INTEGER,
  aging_bucket TEXT,
  invoice_type TEXT,
  custom_invoice_status TEXT,
  overall_process_state TEXT,
  po_type TEXT,
  identifying_po TEXT,
  import_batch_id UUID REFERENCES import_batches(id),
  imported_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_batch ON invoices(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_invoices_supplier ON invoices(supplier);
CREATE INDEX IF NOT EXISTS idx_invoices_days_old ON invoices(days_old);
CREATE INDEX IF NOT EXISTS idx_import_batches_current ON import_batches(is_current);
```

### Migration from Previous Schema

If migrating from the previous schema with aging_category:

```sql
-- Remove aging_category column
ALTER TABLE import_batches DROP COLUMN IF EXISTS aging_category;

-- Purge existing data for clean start
DELETE FROM invoices;
DELETE FROM import_batches;
```

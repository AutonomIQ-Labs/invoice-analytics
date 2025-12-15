-- Create batch_stats table for pre-calculated batch statistics
-- This dramatically improves dashboard load times by avoiding querying all invoices

CREATE TABLE IF NOT EXISTS batch_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES import_batches(id) ON DELETE CASCADE,
  -- Aggregate stats (excludes outliers unless explicitly included)
  total_invoices INTEGER NOT NULL DEFAULT 0,
  total_value NUMERIC NOT NULL DEFAULT 0,
  backlog_count INTEGER NOT NULL DEFAULT 0,
  backlog_value NUMERIC NOT NULL DEFAULT 0,
  ready_for_payment_count INTEGER NOT NULL DEFAULT 0,
  ready_for_payment_value NUMERIC NOT NULL DEFAULT 0,
  -- Process state breakdown stored as JSON for flexibility
  -- Format: { "01 - Header To Be Verified": { "count": 1234, "value": 5678.90 }, ... }
  process_state_counts JSONB NOT NULL DEFAULT '{}',
  -- Timestamps
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Ensure one stats record per batch
  UNIQUE(batch_id)
);

-- Create index for faster lookups by batch_id
CREATE INDEX IF NOT EXISTS idx_batch_stats_batch_id ON batch_stats(batch_id);

-- Enable Row Level Security
ALTER TABLE batch_stats ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read batch stats
CREATE POLICY "Allow authenticated users to read batch_stats"
  ON batch_stats FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert batch stats
CREATE POLICY "Allow authenticated users to insert batch_stats"
  ON batch_stats FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update batch stats
CREATE POLICY "Allow authenticated users to update batch_stats"
  ON batch_stats FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to delete batch stats
CREATE POLICY "Allow authenticated users to delete batch_stats"
  ON batch_stats FOR DELETE
  TO authenticated
  USING (true);


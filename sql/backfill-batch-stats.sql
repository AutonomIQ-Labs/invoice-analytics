-- Backfill batch_stats for existing import batches
-- This is a one-time migration script to populate pre-calculated statistics
-- for batches that were imported before the batch_stats feature was added.
--
-- Run this after creating the batch_stats table.
-- It calculates stats using the same filtering logic as the dashboard:
--   - Non-outliers: included if include_in_analysis is true or null (excluded only if explicitly false)
--   - Outliers: only included if include_in_analysis is explicitly true

-- First, ensure batch_stats table exists
-- (If running create-batch-stats.sql separately, this is just a safety check)

-- Clear any existing stats to avoid duplicates
DELETE FROM batch_stats;

-- Insert calculated stats for each batch
-- This aggregates invoice data using consistent filtering with dashboard
INSERT INTO batch_stats (
  batch_id,
  total_invoices,
  total_value,
  backlog_count,
  backlog_value,
  ready_for_payment_count,
  ready_for_payment_value,
  process_state_counts,
  calculated_at
)
SELECT 
  ib.id AS batch_id,
  COALESCE(stats.total_invoices, 0) AS total_invoices,
  COALESCE(stats.total_value, 0) AS total_value,
  COALESCE(stats.backlog_count, 0) AS backlog_count,
  COALESCE(stats.backlog_value, 0) AS backlog_value,
  COALESCE(stats.ready_for_payment_count, 0) AS ready_for_payment_count,
  COALESCE(stats.ready_for_payment_value, 0) AS ready_for_payment_value,
  COALESCE(state_counts.process_state_counts, '{}'::jsonb) AS process_state_counts,
  NOW() AS calculated_at
FROM import_batches ib
LEFT JOIN (
  -- Calculate aggregate stats per batch with consistent filtering
  SELECT 
    import_batch_id,
    COUNT(*) AS total_invoices,
    SUM(COALESCE(invoice_amount, 0)) AS total_value,
    COUNT(*) FILTER (WHERE overall_process_state IS NULL OR NOT (overall_process_state LIKE '08%' OR LOWER(overall_process_state) LIKE '%ready for payment%')) AS backlog_count,
    SUM(COALESCE(invoice_amount, 0)) FILTER (WHERE overall_process_state IS NULL OR NOT (overall_process_state LIKE '08%' OR LOWER(overall_process_state) LIKE '%ready for payment%')) AS backlog_value,
    COUNT(*) FILTER (WHERE overall_process_state LIKE '08%' OR LOWER(overall_process_state) LIKE '%ready for payment%') AS ready_for_payment_count,
    SUM(COALESCE(invoice_amount, 0)) FILTER (WHERE overall_process_state LIKE '08%' OR LOWER(overall_process_state) LIKE '%ready for payment%') AS ready_for_payment_value
  FROM invoices
  WHERE (
    -- Non-outliers: include if include_in_analysis is true or null (excluded only if explicitly false)
    ((is_outlier IS NULL OR is_outlier = false) AND (include_in_analysis IS NULL OR include_in_analysis = true))
    OR
    -- Outliers: only include if include_in_analysis is explicitly true
    (is_outlier = true AND include_in_analysis = true)
  )
  GROUP BY import_batch_id
) stats ON stats.import_batch_id = ib.id
LEFT JOIN (
  -- Calculate process state breakdown as JSONB with same filtering
  SELECT 
    import_batch_id,
    jsonb_object_agg(
      overall_process_state,
      jsonb_build_object('count', state_count, 'value', state_value)
    ) AS process_state_counts
  FROM (
    SELECT 
      import_batch_id,
      COALESCE(overall_process_state, 'Unknown') AS overall_process_state,
      COUNT(*) AS state_count,
      SUM(COALESCE(invoice_amount, 0)) AS state_value
    FROM invoices
    WHERE (
      -- Non-outliers: include if include_in_analysis is true or null
      ((is_outlier IS NULL OR is_outlier = false) AND (include_in_analysis IS NULL OR include_in_analysis = true))
      OR
      -- Outliers: only include if include_in_analysis is explicitly true
      (is_outlier = true AND include_in_analysis = true)
    )
    GROUP BY import_batch_id, overall_process_state
  ) state_agg
  GROUP BY import_batch_id
) state_counts ON state_counts.import_batch_id = ib.id
WHERE ib.is_deleted IS NOT TRUE;

-- Verify the backfill
SELECT 
  bs.batch_id,
  ib.filename,
  bs.total_invoices,
  bs.backlog_count,
  bs.ready_for_payment_count,
  jsonb_object_keys(bs.process_state_counts) AS states_count
FROM batch_stats bs
JOIN import_batches ib ON ib.id = bs.batch_id
ORDER BY ib.imported_at DESC;

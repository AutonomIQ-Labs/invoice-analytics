-- ============================================
-- CLEAR ALL DATA FROM DATABASE
-- Run this in Supabase SQL Editor to remove ALL invoice data
-- WARNING: This is destructive and cannot be undone!
-- ============================================

-- Step 1: Delete all batch stats (pre-calculated statistics)
DELETE FROM batch_stats;

-- Step 2: Delete all invoices (child records must be deleted first)
DELETE FROM invoices;

-- Step 3: Delete all import batches
DELETE FROM import_batches;

-- Step 4: Verify tables are empty
SELECT 'batch_stats' as table_name, COUNT(*) as row_count FROM batch_stats
UNION ALL
SELECT 'invoices' as table_name, COUNT(*) as row_count FROM invoices
UNION ALL
SELECT 'import_batches' as table_name, COUNT(*) as row_count FROM import_batches;

-- After running this:
-- 1. Clear your browser cache (Ctrl+Shift+Delete)
-- 2. Refresh the page
-- 3. Import fresh data via the Import page


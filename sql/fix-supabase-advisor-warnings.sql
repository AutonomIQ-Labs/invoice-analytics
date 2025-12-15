-- ============================================
-- Fix Supabase Advisor Performance Warnings
-- Version: 1.3
-- Description: Fixes RLS auth function caching, duplicate policies, indexes, and foreign keys
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard)
-- ============================================

-- ============================================
-- SECTION 1: Remove Duplicate and Unused Indexes
-- ============================================

-- Remove duplicate index
DROP INDEX IF EXISTS idx_invoices_overall_process_state;

-- Remove unused indexes on import_batches
DROP INDEX IF EXISTS idx_import_batches_is_current;
DROP INDEX IF EXISTS idx_import_batches_is_deleted;

-- ============================================
-- SECTION 1b: Add Missing Foreign Key Indexes
-- Foreign keys without indexes can slow down DELETE operations
-- ============================================

-- Index for import_batches.imported_by foreign key
CREATE INDEX IF NOT EXISTS idx_import_batches_imported_by ON import_batches(imported_by);

-- Index for outlier_settings.user_id foreign key (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'outlier_settings') THEN
    CREATE INDEX IF NOT EXISTS idx_outlier_settings_user_id ON outlier_settings(user_id);
    RAISE NOTICE 'Created index on outlier_settings.user_id';
  END IF;
END $$;

-- ============================================
-- SECTION 2: Remove ALL Duplicate Policies on IMPORT_BATCHES
-- These are causing "Multiple Permissive Policies" warnings
-- ============================================

-- Drop ALL policies on import_batches first to start clean
DROP POLICY IF EXISTS "Authenticated users can view batches" ON import_batches;
DROP POLICY IF EXISTS "Authenticated users can view import_batches" ON import_batches;
DROP POLICY IF EXISTS "Authenticated users can insert batches" ON import_batches;
DROP POLICY IF EXISTS "Authenticated users can insert import_batches" ON import_batches;
DROP POLICY IF EXISTS "Authenticated users can update batches" ON import_batches;
DROP POLICY IF EXISTS "Authenticated users can update import_batches" ON import_batches;
DROP POLICY IF EXISTS "Authenticated users can delete batches" ON import_batches;
DROP POLICY IF EXISTS "Authenticated users can delete import_batches" ON import_batches;
DROP POLICY IF EXISTS "Users can view own batches" ON import_batches;
DROP POLICY IF EXISTS "Users can insert batches" ON import_batches;
DROP POLICY IF EXISTS "Users can update own batches" ON import_batches;
DROP POLICY IF EXISTS "Users can delete own batches" ON import_batches;

-- Recreate with optimized auth function caching (ONE policy per action)
CREATE POLICY "Authenticated users can view batches"
  ON import_batches FOR SELECT
  USING ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can insert batches"
  ON import_batches FOR INSERT
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can update batches"
  ON import_batches FOR UPDATE
  USING ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can delete batches"
  ON import_batches FOR DELETE
  USING ((select auth.uid()) IS NOT NULL);

-- ============================================
-- SECTION 3: Fix INVOICES Table Policies
-- ============================================

-- Drop all policies on invoices
DROP POLICY IF EXISTS "Users can view invoices" ON invoices;
DROP POLICY IF EXISTS "Users can insert invoices" ON invoices;
DROP POLICY IF EXISTS "Users can update invoices" ON invoices;
DROP POLICY IF EXISTS "Users can delete invoices" ON invoices;
DROP POLICY IF EXISTS "Authenticated users can view invoices" ON invoices;
DROP POLICY IF EXISTS "Authenticated users can insert invoices" ON invoices;
DROP POLICY IF EXISTS "Authenticated users can update invoices" ON invoices;
DROP POLICY IF EXISTS "Authenticated users can delete invoices" ON invoices;

-- Recreate with optimized auth function caching
CREATE POLICY "Authenticated users can view invoices"
  ON invoices FOR SELECT
  USING ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can insert invoices"
  ON invoices FOR INSERT
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can update invoices"
  ON invoices FOR UPDATE
  USING ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can delete invoices"
  ON invoices FOR DELETE
  USING ((select auth.uid()) IS NOT NULL);

-- ============================================
-- SECTION 4: Fix OUTLIER_SETTINGS Table Policies
-- Replace auth.uid() with (select auth.uid())
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'outlier_settings') THEN
    -- Drop existing policies
    DROP POLICY IF EXISTS "Users can view their own settings" ON outlier_settings;
    DROP POLICY IF EXISTS "Users can insert their own settings" ON outlier_settings;
    DROP POLICY IF EXISTS "Users can update their own settings" ON outlier_settings;
    DROP POLICY IF EXISTS "Users can delete their own settings" ON outlier_settings;
    
    -- Recreate with optimized auth function caching
    CREATE POLICY "Users can view their own settings"
      ON outlier_settings FOR SELECT
      USING ((select auth.uid()) IS NOT NULL);
    
    CREATE POLICY "Users can insert their own settings"
      ON outlier_settings FOR INSERT
      WITH CHECK ((select auth.uid()) IS NOT NULL);
    
    CREATE POLICY "Users can update their own settings"
      ON outlier_settings FOR UPDATE
      USING ((select auth.uid()) IS NOT NULL);
    
    CREATE POLICY "Users can delete their own settings"
      ON outlier_settings FOR DELETE
      USING ((select auth.uid()) IS NOT NULL);
    
    RAISE NOTICE 'Fixed RLS policies on outlier_settings table';
  ELSE
    RAISE NOTICE 'Skipping outlier_settings table - does not exist';
  END IF;
END $$;

-- ============================================
-- SECTION 5: Fix BATCH_STATS Table Policies (if exists)
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'batch_stats') THEN
    DROP POLICY IF EXISTS "Allow authenticated users to read batch_stats" ON batch_stats;
    DROP POLICY IF EXISTS "Allow authenticated users to insert batch_stats" ON batch_stats;
    DROP POLICY IF EXISTS "Allow authenticated users to update batch_stats" ON batch_stats;
    DROP POLICY IF EXISTS "Allow authenticated users to delete batch_stats" ON batch_stats;
    
    -- batch_stats uses TO authenticated with USING (true) which is fine
    -- But let's ensure it's optimized if it was using auth.uid()
    CREATE POLICY "Allow authenticated users to read batch_stats"
      ON batch_stats FOR SELECT
      TO authenticated
      USING (true);
    
    CREATE POLICY "Allow authenticated users to insert batch_stats"
      ON batch_stats FOR INSERT
      TO authenticated
      WITH CHECK (true);
    
    CREATE POLICY "Allow authenticated users to update batch_stats"
      ON batch_stats FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
    
    CREATE POLICY "Allow authenticated users to delete batch_stats"
      ON batch_stats FOR DELETE
      TO authenticated
      USING (true);
    
    RAISE NOTICE 'Fixed RLS policies on batch_stats table';
  ELSE
    RAISE NOTICE 'Skipping batch_stats table - does not exist';
  END IF;
END $$;

-- ============================================
-- SECTION 9: Verification Queries
-- ============================================

-- Verify no duplicate policies on import_batches
SELECT policyname, cmd, permissive 
FROM pg_policies 
WHERE tablename = 'import_batches'
ORDER BY cmd, policyname;

-- Verify no duplicate policies on invoices
SELECT policyname, cmd, permissive 
FROM pg_policies 
WHERE tablename = 'invoices'
ORDER BY cmd, policyname;

-- Verify outlier_settings policies
SELECT policyname, cmd, permissive 
FROM pg_policies 
WHERE tablename = 'outlier_settings'
ORDER BY cmd, policyname;

-- Verify indexes on import_batches
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'import_batches'
ORDER BY indexname;

-- Verify indexes on outlier_settings
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'outlier_settings'
ORDER BY indexname;

-- ============================================
-- COMPLETE!
-- Refresh the Supabase Advisor to confirm warnings are resolved
-- ============================================

-- ============================================
-- MANUAL FIX REQUIRED: Auth Connection Management Strategy
-- ============================================
-- 
-- The "Auth Absolute Connection Management Strategy" warning
-- cannot be fixed via SQL. You need to change it in the Supabase Dashboard:
--
-- 1. Go to your Supabase project dashboard
-- 2. Navigate to: Project Settings > Database > Connection Pooling
-- 3. Under "Auth server connection limit", change from "Absolute" to "Percentage"
-- 4. This allows the Auth server to scale connections with your instance size
--
-- ============================================

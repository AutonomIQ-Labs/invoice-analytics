-- ============================================
-- ROLLBACK Admin Dashboard Migration
-- Version: 1.0
-- Description: Removes profiles, invitations tables and restores original RLS policies
-- 
-- RUN THIS SCRIPT IN SUPABASE SQL EDITOR TO REVERT ADMIN DASHBOARD CHANGES
-- ============================================

-- ============================================
-- STEP 1: DROP TRIGGERS
-- ============================================

-- Drop the trigger that auto-creates profiles on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop the trigger that updates updated_at on profile changes
DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;

-- ============================================
-- STEP 2: DROP FUNCTIONS
-- ============================================

DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.update_updated_at();

-- ============================================
-- STEP 3: DROP RLS POLICIES ON PROFILES TABLE
-- ============================================

DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON profiles;

-- ============================================
-- STEP 4: DROP RLS POLICIES ON INVITATIONS TABLE
-- ============================================

DROP POLICY IF EXISTS "Admins can read invitations" ON invitations;
DROP POLICY IF EXISTS "Admins can create invitations" ON invitations;
DROP POLICY IF EXISTS "Admins can update invitations" ON invitations;
DROP POLICY IF EXISTS "Admins can delete invitations" ON invitations;

-- ============================================
-- STEP 5: DROP TABLES (must come after policies are dropped)
-- ============================================

DROP TABLE IF EXISTS invitations CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- ============================================
-- STEP 6: RESTORE ORIGINAL RLS POLICIES ON IMPORT_BATCHES
-- Remove admin-specific policies and restore simple authenticated user policies
-- ============================================

-- Drop all existing policies on import_batches (including any "Authenticated users" policies)
DROP POLICY IF EXISTS "Users can view own batches" ON import_batches;
DROP POLICY IF EXISTS "Users can insert batches" ON import_batches;
DROP POLICY IF EXISTS "Users can update own batches" ON import_batches;
DROP POLICY IF EXISTS "Users can delete own batches" ON import_batches;
DROP POLICY IF EXISTS "Admins can view all batches" ON import_batches;
DROP POLICY IF EXISTS "Admins can update all batches" ON import_batches;
DROP POLICY IF EXISTS "Admins can delete all batches" ON import_batches;
DROP POLICY IF EXISTS "Authenticated users can view batches" ON import_batches;
DROP POLICY IF EXISTS "Authenticated users can insert batches" ON import_batches;
DROP POLICY IF EXISTS "Authenticated users can update batches" ON import_batches;
DROP POLICY IF EXISTS "Authenticated users can delete batches" ON import_batches;

-- Recreate simple policies for authenticated users
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
-- STEP 7: RESTORE ORIGINAL RLS POLICIES ON INVOICES
-- ============================================

-- Drop all existing policies on invoices (including any "Authenticated users" policies)
DROP POLICY IF EXISTS "Users can view invoices" ON invoices;
DROP POLICY IF EXISTS "Users can insert invoices" ON invoices;
DROP POLICY IF EXISTS "Users can update invoices" ON invoices;
DROP POLICY IF EXISTS "Users can delete invoices" ON invoices;
DROP POLICY IF EXISTS "Admins can delete invoices" ON invoices;
DROP POLICY IF EXISTS "Authenticated users can view invoices" ON invoices;
DROP POLICY IF EXISTS "Authenticated users can insert invoices" ON invoices;
DROP POLICY IF EXISTS "Authenticated users can update invoices" ON invoices;
DROP POLICY IF EXISTS "Authenticated users can delete invoices" ON invoices;

-- Recreate simple policies for authenticated users
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
-- STEP 8: VERIFY ROLLBACK
-- ============================================

-- Check that profiles and invitations tables no longer exist
SELECT 
  'profiles' as table_name, 
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') as exists
UNION ALL
SELECT 
  'invitations' as table_name, 
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invitations') as exists;

-- Check RLS policies on import_batches
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('import_batches', 'invoices')
ORDER BY tablename, policyname;

-- ============================================
-- AFTER RUNNING THIS SCRIPT:
-- 1. Clear your browser cache (Ctrl+Shift+Delete)
-- 2. Log out and log back in
-- 3. The Admin link will no longer appear in the sidebar
-- ============================================

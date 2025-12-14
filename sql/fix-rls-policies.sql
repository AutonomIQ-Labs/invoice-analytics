-- ============================================
-- FIX RLS Policies - Import and Profile Issues
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard)
-- ============================================

-- ============================================
-- STEP 1: Fix import_batches RLS policies
-- The import process needs to update is_current on ALL batches,
-- not just the user's own batches. This fixes the spinning import.
-- ============================================

-- Drop existing problematic policies
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

-- All authenticated users can view all batches (needed for dashboard)
CREATE POLICY "Authenticated users can view batches"
  ON import_batches FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- All authenticated users can insert new batches (needed for import)
CREATE POLICY "Authenticated users can insert batches"
  ON import_batches FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- All authenticated users can update any batch (needed for is_current flag)
CREATE POLICY "Authenticated users can update batches"
  ON import_batches FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Only admins can hard-delete batches (soft delete via is_deleted still works for all)
CREATE POLICY "Admins can delete all batches"
  ON import_batches FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- STEP 2: Make your user an admin
-- Replace the email below with YOUR email if different
-- ============================================

-- First, let's see what profiles exist
SELECT id, email, role, display_name, created_at 
FROM profiles 
ORDER BY created_at;

-- Make the user with this email an admin (case-insensitive match)
-- IMPORTANT: Update this email to match YOUR login email exactly
UPDATE profiles 
SET role = 'admin', updated_at = NOW()
WHERE LOWER(email) = LOWER('Rory.Norton@3shealthams.ca');

-- If no profile exists yet, create one from auth.users
INSERT INTO profiles (id, email, role, display_name, first_login)
SELECT 
  u.id, 
  u.email, 
  'admin',
  'Rory Norton',
  false
FROM auth.users u
WHERE LOWER(u.email) = LOWER('Rory.Norton@3shealthams.ca')
ON CONFLICT (id) DO UPDATE SET 
  role = 'admin',
  updated_at = NOW();

-- ============================================
-- STEP 3: Verify the fixes
-- ============================================

-- Verify profile is now admin
SELECT id, email, role, display_name, created_at, updated_at 
FROM profiles 
WHERE LOWER(email) = LOWER('Rory.Norton@3shealthams.ca');

-- Verify RLS policies on import_batches
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'import_batches';

-- ============================================
-- STEP 4: After running this, do the following:
-- 1. Log out of the application completely
-- 2. Clear your browser cache (Ctrl+Shift+Delete)
-- 3. Log back in
-- 4. The Admin link should now appear in the sidebar
-- 5. Import should now work without spinning forever
-- ============================================

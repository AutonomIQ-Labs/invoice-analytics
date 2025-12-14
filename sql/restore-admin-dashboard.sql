-- ============================================
-- RESTORE Admin Dashboard Migration
-- Version: 1.0
-- Description: Re-applies the admin dashboard features if needed in the future
-- 
-- This is a backup copy of the original admin-dashboard-migration.sql
-- Run this in Supabase SQL Editor to restore admin functionality
-- ============================================

-- ============================================
-- 1. PROFILES TABLE
-- Stores user roles and metadata, linked to auth.users
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  first_login BOOLEAN DEFAULT true
);

-- Index for quick role lookups
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- ============================================
-- 2. INVITATIONS TABLE
-- Tracks pending email invitations
-- ============================================
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ
);

-- Partial unique index: only one pending invitation per email
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_unique_pending 
  ON invitations(email) 
  WHERE accepted_at IS NULL;

-- Index for looking up invitations by email
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_pending ON invitations(accepted_at) WHERE accepted_at IS NULL;

-- ============================================
-- 3. TRIGGER: Auto-create profile on user signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  pending_invite invitations%ROWTYPE;
  invite_role TEXT := 'user';
  inviter_id UUID := NULL;
BEGIN
  -- Check if there's a pending invitation for this email (case-insensitive)
  SELECT * INTO pending_invite
  FROM invitations
  WHERE LOWER(email) = LOWER(NEW.email) AND accepted_at IS NULL
  LIMIT 1;
  
  IF FOUND THEN
    invite_role := pending_invite.role;
    inviter_id := pending_invite.invited_by;
    
    -- Mark invitation as accepted
    UPDATE invitations
    SET accepted_at = NOW()
    WHERE id = pending_invite.id;
  END IF;
  
  -- Create the profile
  INSERT INTO public.profiles (id, email, role, invited_by, first_login)
  VALUES (NEW.id, NEW.email, invite_role, inviter_id, true)
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 4. TRIGGER: Update updated_at on profile changes
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Admins can read all profiles
CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can update all profiles
CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can delete profiles (except their own)
CREATE POLICY "Admins can delete profiles"
  ON profiles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
    AND id != auth.uid()
  );

-- Enable RLS on invitations
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Admins can read all invitations
CREATE POLICY "Admins can read invitations"
  ON invitations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can create invitations
CREATE POLICY "Admins can create invitations"
  ON invitations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can update invitations
CREATE POLICY "Admins can update invitations"
  ON invitations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can delete invitations
CREATE POLICY "Admins can delete invitations"
  ON invitations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- 6. ADMIN POLICIES FOR EXISTING TABLES
-- Allow admins to manage all import batches and invoices
-- ============================================

-- Drop existing policies if they exist (to recreate with admin access)
DROP POLICY IF EXISTS "Authenticated users can view batches" ON import_batches;
DROP POLICY IF EXISTS "Authenticated users can insert batches" ON import_batches;
DROP POLICY IF EXISTS "Authenticated users can update batches" ON import_batches;
DROP POLICY IF EXISTS "Authenticated users can delete batches" ON import_batches;

-- Users can view their own batches
CREATE POLICY "Users can view own batches"
  ON import_batches FOR SELECT
  USING (imported_by = auth.uid());

-- Users can insert new batches (required for import)
CREATE POLICY "Users can insert batches"
  ON import_batches FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Users can update their own batches (required for import finalization)
CREATE POLICY "Users can update own batches"
  ON import_batches FOR UPDATE
  USING (imported_by = auth.uid() OR imported_by IS NULL);

-- Admins can view all batches
CREATE POLICY "Admins can view all batches"
  ON import_batches FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can update all batches
CREATE POLICY "Admins can update all batches"
  ON import_batches FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can delete all batches
CREATE POLICY "Admins can delete all batches"
  ON import_batches FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- 6b. INVOICES TABLE RLS POLICIES
-- Allow authenticated users to insert/view invoices
-- ============================================

-- Drop existing invoice policies if they exist
DROP POLICY IF EXISTS "Authenticated users can view invoices" ON invoices;
DROP POLICY IF EXISTS "Authenticated users can insert invoices" ON invoices;
DROP POLICY IF EXISTS "Authenticated users can update invoices" ON invoices;
DROP POLICY IF EXISTS "Authenticated users can delete invoices" ON invoices;

-- Enable RLS on invoices if not already enabled
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view invoices
CREATE POLICY "Users can view invoices"
  ON invoices FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- All authenticated users can insert invoices (required for import)
CREATE POLICY "Users can insert invoices"
  ON invoices FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- All authenticated users can update invoices (for outlier management)
CREATE POLICY "Users can update invoices"
  ON invoices FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Admins can delete invoices
CREATE POLICY "Admins can delete invoices"
  ON invoices FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- 7. BOOTSTRAP FIRST ADMIN
-- ============================================
-- 
-- IMPORTANT: After running this migration and creating your first user account,
-- you must promote that user to admin. There are several ways to do this:
--
-- OPTION 1: Via Supabase Dashboard (Recommended)
-- 1. Go to your Supabase project > Table Editor > profiles
-- 2. Find your user by email
-- 3. Change the 'role' column from 'user' to 'admin'
--
-- OPTION 2: Via SQL (run in Supabase SQL Editor)
-- Replace 'your-email@example.com' with your actual email:
--
-- UPDATE profiles 
-- SET role = 'admin' 
-- WHERE email = 'your-email@example.com';
--
-- ============================================

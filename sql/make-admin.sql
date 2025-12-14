-- ============================================
-- Fix Profile and Make Admin
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard)
-- ============================================

-- Step 1: Check if the user exists in auth.users
SELECT id, email, created_at 
FROM auth.users 
WHERE LOWER(email) = LOWER('Rory.Norton@3shealthams.ca');

-- Step 2: Check if the profile exists
SELECT id, email, role, created_at 
FROM profiles 
WHERE LOWER(email) = LOWER('Rory.Norton@3shealthams.ca');

-- Step 3: If profile doesn't exist, create it from auth.users
-- This inserts a profile if one doesn't exist for this user
INSERT INTO profiles (id, email, role, display_name, first_login)
SELECT 
  u.id, 
  u.email, 
  'admin',  -- Set as admin
  'Rory Norton',  -- Display name
  false  -- Not first login
FROM auth.users u
WHERE LOWER(u.email) = LOWER('Rory.Norton@3shealthams.ca')
ON CONFLICT (id) DO UPDATE SET 
  role = 'admin',
  updated_at = NOW();

-- Step 4: Verify the profile now exists with admin role
SELECT id, email, role, display_name, created_at, updated_at 
FROM profiles 
WHERE LOWER(email) = LOWER('Rory.Norton@3shealthams.ca');

-- Step 5: Verify RLS policies are working
-- This should return the profile count (should be >= 1)
SELECT COUNT(*) as profile_count FROM profiles;

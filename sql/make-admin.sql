-- ============================================
-- Make Rory.Norton@3shealthams.ca an Admin
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard)
-- ============================================

-- Update the user's role to admin
UPDATE profiles 
SET role = 'admin' 
WHERE LOWER(email) = LOWER('Rory.Norton@3shealthams.ca');

-- Verify the change
SELECT id, email, role, created_at 
FROM profiles 
WHERE LOWER(email) = LOWER('Rory.Norton@3shealthams.ca');

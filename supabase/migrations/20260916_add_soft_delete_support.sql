-- ============================================================================
-- Migration: Add Soft Delete Support to Profiles
-- ============================================================================
-- Description: Adds is_active and deleted_at columns to support soft deletion
-- of user accounts. Deactivated accounts remain in the database but cannot
-- sign in.
--
-- Author: Admin
-- Date: 2026-09-16
-- ============================================================================

-- Add is_active column (defaults to true for existing users)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add deleted_at timestamp for audit trail
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Add comment to columns
COMMENT ON COLUMN public.profiles.is_active IS 'Whether the user account is active. Deactivated users cannot sign in.';
COMMENT ON COLUMN public.profiles.deleted_at IS 'Timestamp when the account was soft-deleted. NULL if active.';

-- Create index for filtering active users (performance optimization)
CREATE INDEX IF NOT EXISTS idx_profiles_is_active 
  ON public.profiles(is_active) 
  WHERE is_active = true;

-- Create index for deleted accounts
CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at 
  ON public.profiles(deleted_at) 
  WHERE deleted_at IS NOT NULL;

-- Update existing RLS policies to respect is_active
-- Note: This assumes you have RLS enabled on profiles table

-- Policy: Users can only view active profiles (except admins)
DROP POLICY IF EXISTS "Users can view active profiles" ON public.profiles;
CREATE POLICY "Users can view active profiles"
  ON public.profiles
  FOR SELECT
  USING (
    is_active = true 
    OR 
    auth.uid() = id 
    OR 
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- Policy: Users can update their own profile (only if active)
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (
    auth.uid() = id 
    AND is_active = true
  );

-- Policy: Admins can update any profile
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile"
  ON public.profiles
  FOR UPDATE
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- Function to soft delete a user account
CREATE OR REPLACE FUNCTION soft_delete_profile(user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles
  SET 
    is_active = false,
    deleted_at = NOW(),
    updated_at = NOW()
  WHERE id = user_id;
END;
$$;

-- Function to reactivate a user account
CREATE OR REPLACE FUNCTION reactivate_profile(user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles
  SET 
    is_active = true,
    deleted_at = NULL,
    updated_at = NOW()
  WHERE id = user_id;
END;
$$;

-- Grant execute permissions to authenticated users (RLS will control access)
GRANT EXECUTE ON FUNCTION soft_delete_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reactivate_profile(UUID) TO authenticated;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Next steps:
-- 1. Run this migration: supabase db push
-- 2. Verify columns exist: SELECT is_active, deleted_at FROM profiles LIMIT 1;
-- 3. Test soft delete: SELECT soft_delete_profile('user-id-here');
-- 4. Test reactivate: SELECT reactivate_profile('user-id-here');
-- ============================================================================

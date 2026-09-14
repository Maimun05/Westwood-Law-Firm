-- ============================================================================
-- Fix: Restore admin write-access to profiles (without reintroducing recursion)
-- ============================================================================
-- Bug: 20260918_fix_all_rls_policies.sql reset the profiles UPDATE policy to
-- a self-only check (auth.uid() = id) and dropped the old
-- profiles_update_admin_simple policy without replacing it. That left the
-- admin user-management screens (adminUpdateUser, adminDeactivateUser,
-- adminChangeUserRole in src/lib/services/admin.ts) with no RLS policy
-- allowing an admin to write to any profile row except their own — those
-- actions have been silently failing for any target user other than the
-- admin themselves.
--
-- Fix: add a second, additive UPDATE policy scoped to admins, using the
-- existing private.is_admin() SECURITY DEFINER helper. Postgres OR's
-- multiple permissive policies for the same command together, so this does
-- not touch or weaken the existing self-service policy — it only adds a
-- path for admins to update other users' rows. Because is_admin() is
-- SECURITY DEFINER and owned outside of the calling role, it does not
-- re-trigger the profiles RLS policies it's used inside of, so this cannot
-- reproduce the earlier infinite-recursion bug.
-- ============================================================================

DROP POLICY IF EXISTS profiles_admin_write_policy ON public.profiles;
CREATE POLICY profiles_admin_write_policy
ON public.profiles FOR UPDATE TO authenticated
USING ((SELECT private.is_admin()))
WITH CHECK ((SELECT private.is_admin()));

COMMENT ON POLICY profiles_admin_write_policy ON public.profiles IS
'Allows admins to update any profile (role changes, deactivation, edits). Additive to profiles_update_policy; uses the non-recursive private.is_admin() helper.';

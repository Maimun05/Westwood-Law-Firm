-- ============================================================================
-- FIX ALL RLS POLICIES - Remove Infinite Recursion
-- ============================================================================
-- This migration removes ALL policies that cause infinite recursion by using
-- private.is_admin() or private.is_lawyer_or_admin() functions within policies
-- on the profiles table itself.
-- 
-- The problem: These functions query the profiles table, which triggers RLS
-- policies, which call these functions again = infinite recursion.
-- 
-- Solution: Use simple, direct auth.uid() checks without subqueries.
-- ============================================================================

-- ============================================================================
-- PROFILES TABLE - Complete Policy Reset
-- ============================================================================

-- Drop ALL existing policies on profiles
DROP POLICY IF EXISTS "Users can view active profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS profiles_select_staff ON public.profiles;
DROP POLICY IF EXISTS profiles_select_active ON public.profiles;
DROP POLICY IF EXISTS profiles_update_admin_simple ON public.profiles;
DROP POLICY IF EXISTS profiles_select_lawyers_admins ON public.profiles;
DROP POLICY IF EXISTS profiles_select_simple ON public.profiles;
DROP POLICY IF EXISTS profiles_update_simple ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_simple ON public.profiles;
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

-- Use the SECURITY DEFINER role helpers from schema-production.sql to avoid
-- querying profiles recursively from its own RLS policies.
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
CREATE POLICY profiles_select_policy ON public.profiles
FOR SELECT TO authenticated
USING (
  auth.uid() = id
  OR (SELECT private.is_lawyer_or_admin())
);

-- UPDATE: Users can only update their own profile
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
CREATE POLICY profiles_update_policy ON public.profiles
FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND role = (SELECT private.get_user_role())
);

-- INSERT: Users can only insert their own profile
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
CREATE POLICY profiles_insert_policy ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id);

-- ============================================================================
-- NOTIFICATIONS TABLE - Fix Admin Check
-- ============================================================================

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
DROP POLICY IF EXISTS notifications_insert_admin ON public.notifications;
DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;

-- SELECT: Users see their own notifications
DROP POLICY IF EXISTS "notifications_select_policy" ON public.notifications;
CREATE POLICY notifications_select_policy ON public.notifications
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- UPDATE: Users update their own notifications
DROP POLICY IF EXISTS "notifications_update_policy" ON public.notifications;
CREATE POLICY notifications_update_policy ON public.notifications
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- INSERT: Any authenticated user can create notifications for themselves
DROP POLICY IF EXISTS "notifications_insert_policy" ON public.notifications;
CREATE POLICY notifications_insert_policy ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- DELETE: Users delete their own notifications
DROP POLICY IF EXISTS "notifications_delete_policy" ON public.notifications;
CREATE POLICY notifications_delete_policy ON public.notifications
FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- ============================================================================
-- CONSULTATIONS TABLE - Fix Lawyer/Admin Checks
-- ============================================================================

DROP POLICY IF EXISTS consultations_select_own ON public.consultations;
DROP POLICY IF EXISTS consultations_select_staff ON public.consultations;
DROP POLICY IF EXISTS consultations_insert_public ON public.consultations;
DROP POLICY IF EXISTS consultations_update_admin ON public.consultations;

-- SELECT: Users see their own consultations or by their email
DROP POLICY IF EXISTS "consultations_select_own_policy" ON public.consultations;
CREATE POLICY consultations_select_own_policy ON public.consultations
FOR SELECT TO authenticated
USING (
  client_id = auth.uid()
  OR assigned_to = auth.uid()
  OR lower(email) = lower((SELECT p.email FROM public.profiles AS p WHERE p.id = auth.uid()))
);

-- INSERT: Anyone (anon or authenticated) can request a consultation
DROP POLICY IF EXISTS "consultations_insert_policy" ON public.consultations;
CREATE POLICY consultations_insert_policy ON public.consultations
FOR INSERT TO anon, authenticated
WITH CHECK (true);

-- UPDATE: Only assigned lawyer or the client can update
DROP POLICY IF EXISTS "consultations_update_policy" ON public.consultations;
CREATE POLICY consultations_update_policy ON public.consultations
FOR UPDATE TO authenticated
USING (
  client_id = auth.uid()
  OR assigned_to = auth.uid()
);

-- ============================================================================
-- MATTERS TABLE - Fix Lawyer/Admin Checks
-- ============================================================================

DROP POLICY IF EXISTS matters_select_involved ON public.matters;
DROP POLICY IF EXISTS matters_insert_staff ON public.matters;
DROP POLICY IF EXISTS matters_update_staff ON public.matters;
DROP POLICY IF EXISTS matters_select_client_lawyer ON public.matters;
DROP POLICY IF EXISTS matters_insert_lawyer_admin ON public.matters;
DROP POLICY IF EXISTS matters_update_involved ON public.matters;

-- SELECT: Clients see their matters, lawyers see assigned matters
DROP POLICY IF EXISTS "matters_select_policy" ON public.matters;
CREATE POLICY matters_select_policy ON public.matters
FOR SELECT TO authenticated
USING (
  client_id = auth.uid()
  OR lawyer_id = auth.uid()
);

-- INSERT: Authenticated users can create matters
DROP POLICY IF EXISTS "matters_insert_policy" ON public.matters;
CREATE POLICY matters_insert_policy ON public.matters
FOR INSERT TO authenticated
WITH CHECK (true);

-- UPDATE: Client or assigned lawyer can update
DROP POLICY IF EXISTS "matters_update_policy" ON public.matters;
CREATE POLICY matters_update_policy ON public.matters
FOR UPDATE TO authenticated
USING (
  client_id = auth.uid()
  OR lawyer_id = auth.uid()
);

-- ============================================================================
-- INQUIRIES TABLE - Fix Staff Checks
-- ============================================================================

DROP POLICY IF EXISTS inquiries_insert_public ON public.inquiries;
DROP POLICY IF EXISTS inquiries_select_own ON public.inquiries;
DROP POLICY IF EXISTS inquiries_select_staff ON public.inquiries;
DROP POLICY IF EXISTS inquiries_update_staff ON public.inquiries;
DROP POLICY IF EXISTS inquiries_select_own_or_email ON public.inquiries;
DROP POLICY IF EXISTS inquiries_select_authenticated ON public.inquiries;
DROP POLICY IF EXISTS inquiries_update_authenticated ON public.inquiries;

-- INSERT: Anyone can submit an inquiry
DROP POLICY IF EXISTS "inquiries_insert_policy" ON public.inquiries;
CREATE POLICY inquiries_insert_policy ON public.inquiries
FOR INSERT TO anon, authenticated
WITH CHECK (true);

-- SELECT: Users see their own inquiries by client_id or email match
-- (client_id, not user_id: live inquiries never had a user_id column)
DROP POLICY IF EXISTS "inquiries_select_policy" ON public.inquiries;
CREATE POLICY inquiries_select_policy ON public.inquiries
FOR SELECT TO authenticated
USING (
  client_id = auth.uid()
  OR lower(email) = lower((SELECT p.email FROM public.profiles AS p WHERE p.id = auth.uid()))
);

-- UPDATE: Users can update their own inquiries
DROP POLICY IF EXISTS "inquiries_update_policy" ON public.inquiries;
CREATE POLICY inquiries_update_policy ON public.inquiries
FOR UPDATE TO authenticated
USING (
  client_id = auth.uid()
  OR lower(email) = lower((SELECT p.email FROM public.profiles AS p WHERE p.id = auth.uid()))
);

-- ============================================================================
-- APPOINTMENTS TABLE - Fix Checks
-- ============================================================================

DROP POLICY IF EXISTS appointments_select_involved ON public.appointments;
DROP POLICY IF EXISTS appointments_insert_authenticated ON public.appointments;
DROP POLICY IF EXISTS appointments_update_involved ON public.appointments;

-- SELECT: Users see appointments they're involved in
DROP POLICY IF EXISTS "appointments_select_policy" ON public.appointments;
CREATE POLICY appointments_select_policy ON public.appointments
FOR SELECT TO authenticated
USING (
  client_id = auth.uid()
  OR lawyer_id = auth.uid()
);

-- INSERT: Authenticated users can create appointments
DROP POLICY IF EXISTS "appointments_insert_policy" ON public.appointments;
CREATE POLICY appointments_insert_policy ON public.appointments
FOR INSERT TO authenticated
WITH CHECK (
  client_id = auth.uid()
  OR lawyer_id = auth.uid()
);

-- UPDATE: Involved parties can update
DROP POLICY IF EXISTS "appointments_update_policy" ON public.appointments;
CREATE POLICY appointments_update_policy ON public.appointments
FOR UPDATE TO authenticated
USING (
  client_id = auth.uid()
  OR lawyer_id = auth.uid()
);

-- ============================================================================
-- DOCUMENTS TABLE - Fix Checks
-- ============================================================================

DROP POLICY IF EXISTS documents_select_involved ON public.documents;
DROP POLICY IF EXISTS documents_insert_involved ON public.documents;
DROP POLICY IF EXISTS documents_update_uploader ON public.documents;
DROP POLICY IF EXISTS documents_delete_uploader_or_admin ON public.documents;

-- SELECT: Users see documents for their matters
DROP POLICY IF EXISTS "documents_select_policy" ON public.documents;
CREATE POLICY documents_select_policy ON public.documents
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.matters AS m
    WHERE m.id = matter_id
      AND (m.client_id = auth.uid() OR m.lawyer_id = auth.uid())
  )
);

-- INSERT: Users can upload documents to their matters
DROP POLICY IF EXISTS "documents_insert_policy" ON public.documents;
CREATE POLICY documents_insert_policy ON public.documents
FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.matters AS m
    WHERE m.id = matter_id
      AND (m.client_id = auth.uid() OR m.lawyer_id = auth.uid())
  )
);

-- UPDATE: Uploader can update their documents
DROP POLICY IF EXISTS "documents_update_policy" ON public.documents;
CREATE POLICY documents_update_policy ON public.documents
FOR UPDATE TO authenticated
USING (uploaded_by = auth.uid());

-- DELETE: Uploader can delete their documents
DROP POLICY IF EXISTS "documents_delete_policy" ON public.documents;
CREATE POLICY documents_delete_policy ON public.documents
FOR DELETE TO authenticated
USING (uploaded_by = auth.uid());

-- ============================================================================
-- AUDIT_LOGS TABLE - Fix Checks
-- ============================================================================

DROP POLICY IF EXISTS audit_logs_insert_system ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_select_admin ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_insert_authenticated ON public.audit_logs;

-- INSERT: Users can log their own actions
DROP POLICY IF EXISTS "audit_logs_insert_policy" ON public.audit_logs;
CREATE POLICY audit_logs_insert_policy ON public.audit_logs
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- SELECT: Users can only see their own audit logs
DROP POLICY IF EXISTS "audit_logs_select_policy" ON public.audit_logs;
CREATE POLICY audit_logs_select_policy ON public.audit_logs
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- ============================================================================
-- CONTENT TABLES - Already have simple policies, but verify
-- ============================================================================
-- These tables use simple role checks without subqueries, so they're safe.
-- No changes needed for: practice_areas, articles, specialists, 
-- corporate_clients, faqs, seminar_events, retainer_packages

-- ============================================================================
-- COMMENT
-- ============================================================================
COMMENT ON POLICY profiles_select_policy ON public.profiles IS 
'Simple non-recursive policy: users see their own profile + all active profiles';

COMMENT ON POLICY profiles_update_policy ON public.profiles IS 
'Simple non-recursive policy: users can only update their own profile';

COMMENT ON POLICY profiles_insert_policy ON public.profiles IS 
'Simple non-recursive policy: users can only insert their own profile (via trigger)';

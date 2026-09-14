-- ============================================================================
-- Migration: Fix Profiles Table and Add Notifications
-- ============================================================================
-- This migration adds missing columns to profiles and creates notifications table
-- Date: 2026-09-17
-- ============================================================================

-- Add missing columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS date_of_birth DATE,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS preferred_contact_method TEXT DEFAULT 'Email',
ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info', -- info, success, warning, error
  read BOOLEAN NOT NULL DEFAULT FALSE,
  link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

-- Enable RLS on notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Notifications policies
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own
ON public.notifications FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own
ON public.notifications FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notifications_insert_admin ON public.notifications;
CREATE POLICY notifications_insert_admin
ON public.notifications FOR INSERT TO authenticated
WITH CHECK ((SELECT private.is_admin()));

DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;
CREATE POLICY notifications_delete_own
ON public.notifications FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid()));

-- Add trigger for notifications updated_at
DROP TRIGGER IF EXISTS notifications_updated_at ON public.notifications;
CREATE TRIGGER notifications_updated_at BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Create consultations table
CREATE TABLE IF NOT EXISTS public.consultations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consultation_number TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  practice_area TEXT NOT NULL,
  preferred_lawyer TEXT,
  preferred_date DATE,
  preferred_time TEXT,
  mode TEXT DEFAULT 'In-Person', -- In-Person, Video Call, Phone Call
  message TEXT,
  status TEXT NOT NULL DEFAULT 'Pending', -- Pending, Confirmed, Completed, Cancelled
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  preferred_contact_method TEXT DEFAULT 'Email',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on consultations
ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;

-- Consultations policies
DROP POLICY IF EXISTS consultations_select_own ON public.consultations;
CREATE POLICY consultations_select_own
ON public.consultations FOR SELECT TO authenticated
USING (
  client_id = (SELECT auth.uid())
  OR lower(email) = lower((SELECT p.email FROM public.profiles AS p WHERE p.id = (SELECT auth.uid())))
);

DROP POLICY IF EXISTS consultations_select_staff ON public.consultations;
CREATE POLICY consultations_select_staff
ON public.consultations FOR SELECT TO authenticated
USING ((SELECT private.is_lawyer_or_admin()));

DROP POLICY IF EXISTS consultations_insert_public ON public.consultations;
CREATE POLICY consultations_insert_public
ON public.consultations FOR INSERT TO anon, authenticated
WITH CHECK (
  status = 'Pending'
  AND assigned_to IS NULL
  AND client_id IS NULL
);

DROP POLICY IF EXISTS consultations_update_admin ON public.consultations;
CREATE POLICY consultations_update_admin
ON public.consultations FOR UPDATE TO authenticated
USING ((SELECT private.is_admin()))
WITH CHECK ((SELECT private.is_admin()));

-- Add trigger for consultations updated_at
DROP TRIGGER IF EXISTS consultations_updated_at ON public.consultations;
CREATE TRIGGER consultations_updated_at BEFORE UPDATE ON public.consultations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Consultation number sequence and function
CREATE SEQUENCE IF NOT EXISTS public.consultation_number_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_consultation_number()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
BEGIN
  RETURN 'WC-' || to_char(CURRENT_DATE, 'YYYY') || '-' ||
         lpad(nextval('public.consultation_number_seq')::text, 3, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.generate_consultation_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_consultation_number() TO authenticated, anon;

ALTER TABLE public.consultations
  ALTER COLUMN consultation_number SET DEFAULT public.generate_consultation_number();

-- Add preferred_contact_method to inquiries
ALTER TABLE public.inquiries
ADD COLUMN IF NOT EXISTS preferred_contact_method TEXT DEFAULT 'Email';

-- Update audit_logs to match service expectations
ALTER TABLE public.audit_logs
ADD COLUMN IF NOT EXISTS user_email TEXT,
ADD COLUMN IF NOT EXISTS user_role TEXT,
ADD COLUMN IF NOT EXISTS event_type TEXT,
ADD COLUMN IF NOT EXISTS event_description TEXT,
ADD COLUMN IF NOT EXISTS resource_type TEXT,
ADD COLUMN IF NOT EXISTS resource_id TEXT,
ADD COLUMN IF NOT EXISTS metadata JSONB,
ADD COLUMN IF NOT EXISTS success BOOLEAN DEFAULT TRUE;

-- Add comment explaining is_active vs session status
COMMENT ON COLUMN public.profiles.is_active IS 'Account enabled/disabled status. NOT the same as current session/online status. TRUE = account can log in, FALSE = account is deactivated.';
COMMENT ON COLUMN public.profiles.last_active_at IS 'Timestamp of last activity. Updated on login and periodically during session. Used for "Last Active" display, not account activation.';



-- ============================================================================
-- FIX AUDIT LOGS INSERT POLICY
-- ============================================================================
-- Allow authenticated users to insert their own audit log entries
-- This fixes the issue where LOGIN/LOGOUT events aren't being recorded

DROP POLICY IF EXISTS audit_logs_insert_authenticated ON public.audit_logs;
CREATE POLICY audit_logs_insert_authenticated
ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()) OR user_id IS NULL);

-- Note: user_id IS NULL allows logging of pre-authentication events
-- like failed login attempts where we don't yet have a user_id



-- ============================================================================
-- FIX DOCUMENT STORAGE POLICIES
-- ============================================================================
-- Fix the circular dependency in storage INSERT policy
-- Allow upload based on matter ownership, not document record existence

DROP POLICY IF EXISTS documents_storage_insert ON storage.objects;
CREATE POLICY documents_storage_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (
    -- Extract matter_id from path (format: matter_id/timestamp-filename)
    EXISTS (
      SELECT 1
      FROM public.matters AS m
      WHERE m.id::text = split_part(name, '/', 1)
        AND (
          m.client_id = (SELECT auth.uid())
          OR m.lawyer_id = (SELECT auth.uid())
          OR (SELECT private.is_admin())
        )
    )
  )
);


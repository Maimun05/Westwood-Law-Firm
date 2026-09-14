-- ============================================================================
-- Westwood Law Firm - Supabase Production Schema
-- ============================================================================
-- Deploy in Supabase SQL Editor AFTER resetting the application schema if needed.
-- This schema is designed for the Westwood client portal.
--
-- Security model:
--   * RLS enabled on every application table.
--   * Role checks use SECURITY DEFINER helpers in the private schema.
--   * SECURITY DEFINER functions pin search_path to ''.
--   * User profiles are created by an auth.users AFTER INSERT trigger.
--   * Client/lawyer/admin permissions are enforced by RLS + validation triggers.
--   * Documents bucket is private; lawyer-photos is public-read/admin-write.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- PRIVATE SCHEMA
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

-- ============================================================================
-- ENUMS
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('client', 'lawyer', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.matter_status AS ENUM
    ('New Inquiry', 'Under Review', 'Consultation', 'Conflict Check',
     'Accepted', 'Active', 'Resolved', 'Closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.priority_level AS ENUM ('Low', 'Medium', 'High');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.inquiry_status AS ENUM
    ('New', 'Under Review', 'Contacted', 'Converted', 'Closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.appointment_mode AS ENUM
    ('In-Person', 'Video Call', 'Phone Call');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.appointment_status AS ENUM
    ('Pending', 'Confirmed', 'Completed', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.document_status AS ENUM
    ('Draft', 'Received', 'Final', 'Archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.access_level AS ENUM
    ('Public', 'Staff Shared', 'Confidential', 'Lawyer Only', 'Client & Assigned Lawyer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.audit_result AS ENUM
    ('Success', 'Failed', 'Access Denied');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- SEQUENCES
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS public.matter_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.inquiry_number_seq START 1;

-- ============================================================================
-- PROFILES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  city TEXT,
  date_of_birth DATE,
  role public.user_role NOT NULL DEFAULT 'client',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SECURITY DEFINER HELPERS
-- ============================================================================

CREATE OR REPLACE FUNCTION private.get_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.role
  FROM public.profiles AS p
  WHERE p.id = (SELECT auth.uid())
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.role = 'admin'::public.user_role
  );
$$;

CREATE OR REPLACE FUNCTION private.is_lawyer_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('lawyer'::public.user_role, 'admin'::public.user_role)
  );
$$;

REVOKE ALL ON FUNCTION private.get_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_lawyer_or_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_lawyer_or_admin() TO authenticated;

-- ============================================================================
-- PROFILE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own
ON public.profiles FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS profiles_select_staff ON public.profiles;
CREATE POLICY profiles_select_staff
ON public.profiles FOR SELECT TO authenticated
USING ((SELECT private.is_lawyer_or_admin()));

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
ON public.profiles FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = id)
WITH CHECK (
  (SELECT auth.uid()) = id
  AND role = (SELECT private.get_user_role())
);

DROP POLICY IF EXISTS profiles_update_admin ON public.profiles;
CREATE POLICY profiles_update_admin
ON public.profiles FOR UPDATE TO authenticated
USING ((SELECT private.is_admin()))
WITH CHECK ((SELECT private.is_admin()));

-- ============================================================================
-- LAWYERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lawyers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  specializations TEXT[] NOT NULL DEFAULT '{}',
  years_of_experience INTEGER NOT NULL DEFAULT 0 CHECK (years_of_experience >= 0),
  education JSONB NOT NULL DEFAULT '[]',
  bar_admissions TEXT[] NOT NULL DEFAULT '{}',
  languages TEXT[] NOT NULL DEFAULT '{English}',
  bio TEXT,
  photo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.lawyers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lawyers_select_active_public ON public.lawyers;
CREATE POLICY lawyers_select_active_public
ON public.lawyers FOR SELECT TO anon, authenticated
USING (is_active = TRUE);

DROP POLICY IF EXISTS lawyers_select_all_staff ON public.lawyers;
CREATE POLICY lawyers_select_all_staff
ON public.lawyers FOR SELECT TO authenticated
USING ((SELECT private.is_lawyer_or_admin()));

DROP POLICY IF EXISTS lawyers_update_own ON public.lawyers;
CREATE POLICY lawyers_update_own
ON public.lawyers FOR UPDATE TO authenticated
USING (profile_id = (SELECT auth.uid()))
WITH CHECK (profile_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS lawyers_admin_all ON public.lawyers;
CREATE POLICY lawyers_admin_all
ON public.lawyers FOR ALL TO authenticated
USING ((SELECT private.is_admin()))
WITH CHECK ((SELECT private.is_admin()));

-- ============================================================================
-- MATTERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.matters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  matter_number TEXT UNIQUE NOT NULL,
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  lawyer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  practice_area TEXT NOT NULL,
  status public.matter_status NOT NULL DEFAULT 'New Inquiry',
  priority public.priority_level NOT NULL DEFAULT 'Medium',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  date_opened DATE NOT NULL DEFAULT CURRENT_DATE,
  date_closed DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.matters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS matters_select_client ON public.matters;
CREATE POLICY matters_select_client
ON public.matters FOR SELECT TO authenticated
USING (client_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS matters_select_lawyer ON public.matters;
CREATE POLICY matters_select_lawyer
ON public.matters FOR SELECT TO authenticated
USING (lawyer_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS matters_select_admin ON public.matters;
CREATE POLICY matters_select_admin
ON public.matters FOR SELECT TO authenticated
USING ((SELECT private.is_admin()));

DROP POLICY IF EXISTS matters_insert_admin ON public.matters;
CREATE POLICY matters_insert_admin
ON public.matters FOR INSERT TO authenticated
WITH CHECK ((SELECT private.is_admin()));

DROP POLICY IF EXISTS matters_update_admin ON public.matters;
CREATE POLICY matters_update_admin
ON public.matters FOR UPDATE TO authenticated
USING ((SELECT private.is_admin()))
WITH CHECK ((SELECT private.is_admin()));

DROP POLICY IF EXISTS matters_update_lawyer ON public.matters;
CREATE POLICY matters_update_lawyer
ON public.matters FOR UPDATE TO authenticated
USING (lawyer_id = (SELECT auth.uid()))
WITH CHECK (lawyer_id = (SELECT auth.uid()));

-- ============================================================================
-- INQUIRIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inquiries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inquiry_number TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  practice_area TEXT NOT NULL,
  preferred_lawyer TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status public.inquiry_status NOT NULL DEFAULT 'New',
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inquiries_select_own ON public.inquiries;
CREATE POLICY inquiries_select_own
ON public.inquiries FOR SELECT TO authenticated
USING (
  client_id = (SELECT auth.uid())
  OR lower(email) = lower((SELECT p.email FROM public.profiles AS p WHERE p.id = (SELECT auth.uid())))
);

DROP POLICY IF EXISTS inquiries_select_staff ON public.inquiries;
CREATE POLICY inquiries_select_staff
ON public.inquiries FOR SELECT TO authenticated
USING ((SELECT private.is_lawyer_or_admin()));

DROP POLICY IF EXISTS inquiries_insert_public ON public.inquiries;
CREATE POLICY inquiries_insert_public
ON public.inquiries FOR INSERT TO anon, authenticated
WITH CHECK (
  status = 'New'::public.inquiry_status
  AND assigned_to IS NULL
  AND client_id IS NULL
);

DROP POLICY IF EXISTS inquiries_update_admin ON public.inquiries;
CREATE POLICY inquiries_update_admin
ON public.inquiries FOR UPDATE TO authenticated
USING ((SELECT private.is_admin()))
WITH CHECK ((SELECT private.is_admin()));

-- ============================================================================
-- DOCUMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  matter_id UUID NOT NULL REFERENCES public.matters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_path TEXT UNIQUE NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size >= 0),
  version TEXT NOT NULL DEFAULT '1.0',
  status public.document_status NOT NULL DEFAULT 'Received',
  access_level public.access_level NOT NULL DEFAULT 'Client & Assigned Lawyer',
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.can_access_document(
  p_matter_id UUID,
  p_access_level public.access_level
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_role public.user_role;
  v_client_id UUID;
  v_lawyer_id UUID;
BEGIN
  SELECT p.role INTO v_role
  FROM public.profiles AS p
  WHERE p.id = v_user_id;

  SELECT m.client_id, m.lawyer_id
  INTO v_client_id, v_lawyer_id
  FROM public.matters AS m
  WHERE m.id = p_matter_id;

  RETURN CASE p_access_level
    WHEN 'Public'::public.access_level THEN TRUE
    WHEN 'Staff Shared'::public.access_level THEN v_role IN ('lawyer'::public.user_role, 'admin'::public.user_role)
    WHEN 'Client & Assigned Lawyer'::public.access_level THEN
      v_user_id IN (v_client_id, v_lawyer_id) OR v_role = 'admin'::public.user_role
    WHEN 'Lawyer Only'::public.access_level THEN
      v_user_id = v_lawyer_id OR v_role = 'admin'::public.user_role
    WHEN 'Confidential'::public.access_level THEN v_role = 'admin'::public.user_role
    ELSE FALSE
  END;
END;
$$;

REVOKE ALL ON FUNCTION private.can_access_document(UUID, public.access_level) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_access_document(UUID, public.access_level) TO authenticated;

DROP POLICY IF EXISTS documents_select_by_access ON public.documents;
CREATE POLICY documents_select_by_access
ON public.documents FOR SELECT TO authenticated
USING (private.can_access_document(matter_id, access_level));

DROP POLICY IF EXISTS documents_insert_allowed ON public.documents;
CREATE POLICY documents_insert_allowed
ON public.documents FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.matters AS m
    WHERE m.id = matter_id
      AND (
        m.client_id = (SELECT auth.uid())
        OR m.lawyer_id = (SELECT auth.uid())
        OR (SELECT private.is_admin())
      )
  )
);

DROP POLICY IF EXISTS documents_update_own ON public.documents;
CREATE POLICY documents_update_own
ON public.documents FOR UPDATE TO authenticated
USING (uploaded_by = (SELECT auth.uid()))
WITH CHECK (uploaded_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS documents_update_admin ON public.documents;
CREATE POLICY documents_update_admin
ON public.documents FOR UPDATE TO authenticated
USING ((SELECT private.is_admin()))
WITH CHECK ((SELECT private.is_admin()));

DROP POLICY IF EXISTS documents_delete_admin ON public.documents;
CREATE POLICY documents_delete_admin
ON public.documents FOR DELETE TO authenticated
USING ((SELECT private.is_admin()));

-- ============================================================================
-- APPOINTMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  matter_id UUID NOT NULL REFERENCES public.matters(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lawyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  appointment_type TEXT NOT NULL,
  date DATE NOT NULL,
  time TEXT NOT NULL,
  mode public.appointment_mode NOT NULL DEFAULT 'In-Person',
  status public.appointment_status NOT NULL DEFAULT 'Pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointments_select_involved ON public.appointments;
CREATE POLICY appointments_select_involved
ON public.appointments FOR SELECT TO authenticated
USING ((SELECT auth.uid()) IN (client_id, lawyer_id));

DROP POLICY IF EXISTS appointments_select_admin ON public.appointments;
CREATE POLICY appointments_select_admin
ON public.appointments FOR SELECT TO authenticated
USING ((SELECT private.is_admin()));

DROP POLICY IF EXISTS appointments_insert_admin ON public.appointments;
CREATE POLICY appointments_insert_admin
ON public.appointments FOR INSERT TO authenticated
WITH CHECK ((SELECT private.is_admin()));

DROP POLICY IF EXISTS appointments_update_involved ON public.appointments;
CREATE POLICY appointments_update_involved
ON public.appointments FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) IN (client_id, lawyer_id))
WITH CHECK ((SELECT auth.uid()) IN (client_id, lawyer_id));

DROP POLICY IF EXISTS appointments_update_admin ON public.appointments;
CREATE POLICY appointments_update_admin
ON public.appointments FOR UPDATE TO authenticated
USING ((SELECT private.is_admin()))
WITH CHECK ((SELECT private.is_admin()));

-- ============================================================================
-- AUDIT LOGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id TEXT,
  result public.audit_result NOT NULL DEFAULT 'Success',
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_select_own ON public.audit_logs;
CREATE POLICY audit_logs_select_own
ON public.audit_logs FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS audit_logs_select_admin ON public.audit_logs;
CREATE POLICY audit_logs_select_admin
ON public.audit_logs FOR SELECT TO authenticated
USING ((SELECT private.is_admin()));

-- Deliberately no INSERT/UPDATE/DELETE policies for clients.
-- The function is intentionally not granted to browser users.
CREATE OR REPLACE FUNCTION private.log_audit(
  p_action TEXT,
  p_record_type TEXT,
  p_record_id TEXT DEFAULT NULL,
  p_result public.audit_result DEFAULT 'Success',
  p_details JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.audit_logs (user_id, action, record_type, record_id, result, details)
  VALUES ((SELECT auth.uid()), p_action, p_record_type, p_record_id, p_result, p_details)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION private.log_audit(TEXT, TEXT, TEXT, public.audit_result, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.log_audit(TEXT, TEXT, TEXT, public.audit_result, JSONB) TO service_role;

-- ============================================================================
-- SAVED LAWYERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.saved_lawyers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lawyer_id UUID NOT NULL REFERENCES public.lawyers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, lawyer_id)
);

ALTER TABLE public.saved_lawyers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saved_lawyers_select_own ON public.saved_lawyers;
CREATE POLICY saved_lawyers_select_own
ON public.saved_lawyers FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS saved_lawyers_insert_own ON public.saved_lawyers;
CREATE POLICY saved_lawyers_insert_own
ON public.saved_lawyers FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS saved_lawyers_delete_own ON public.saved_lawyers;
CREATE POLICY saved_lawyers_delete_own
ON public.saved_lawyers FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid()));

-- ============================================================================
-- GENERIC UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS lawyers_updated_at ON public.lawyers;
CREATE TRIGGER lawyers_updated_at BEFORE UPDATE ON public.lawyers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS matters_updated_at ON public.matters;
CREATE TRIGGER matters_updated_at BEFORE UPDATE ON public.matters
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS inquiries_updated_at ON public.inquiries;
CREATE TRIGGER inquiries_updated_at BEFORE UPDATE ON public.inquiries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS documents_updated_at ON public.documents;
CREATE TRIGGER documents_updated_at BEFORE UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS appointments_updated_at ON public.appointments;
CREATE TRIGGER appointments_updated_at BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- AUTH -> PROFILE TRIGGER
-- ============================================================================
-- Supabase recommends an AFTER INSERT trigger on auth.users for this pattern.

CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name TEXT;
BEGIN
  v_name := COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name',
    split_part(COALESCE(NEW.email, ''), '@', 1),
    'New User'
  );

  INSERT INTO public.profiles (id, email, full_name, phone, address, city, date_of_birth, role)
  VALUES (
    NEW.id,
    NEW.email,
    v_name,
    NEW.raw_user_meta_data ->> 'phone',
    NEW.raw_user_meta_data ->> 'address',
    NEW.raw_user_meta_data ->> 'city',
    (NEW.raw_user_meta_data ->> 'date_of_birth')::DATE,
    'client'::public.user_role
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.handle_new_user() FROM anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION private.handle_new_user();

-- ============================================================================
-- MATTER VALIDATION
-- ============================================================================

CREATE OR REPLACE FUNCTION private.validate_matter_staff()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.lawyer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = NEW.lawyer_id
      AND p.role IN ('lawyer'::public.user_role, 'admin'::public.user_role)
  ) THEN
    RAISE EXCEPTION 'lawyer_id must reference a lawyer or admin profile';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.validate_matter_staff() FROM PUBLIC;

DROP TRIGGER IF EXISTS validate_matter_staff ON public.matters;
CREATE TRIGGER validate_matter_staff
BEFORE INSERT OR UPDATE OF lawyer_id ON public.matters
FOR EACH ROW EXECUTE FUNCTION private.validate_matter_staff();

-- Lawyers may update matter workflow fields, but cannot change ownership.
CREATE OR REPLACE FUNCTION private.prevent_lawyer_matter_reassignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT private.get_user_role()) = 'lawyer'::public.user_role
     AND (SELECT auth.uid()) = OLD.lawyer_id THEN
    IF NEW.client_id IS DISTINCT FROM OLD.client_id
       OR NEW.lawyer_id IS DISTINCT FROM OLD.lawyer_id THEN
      RAISE EXCEPTION 'Lawyers cannot reassign matter ownership';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.prevent_lawyer_matter_reassignment() FROM PUBLIC;

DROP TRIGGER IF EXISTS prevent_lawyer_matter_reassignment ON public.matters;
CREATE TRIGGER prevent_lawyer_matter_reassignment
BEFORE UPDATE ON public.matters
FOR EACH ROW EXECUTE FUNCTION private.prevent_lawyer_matter_reassignment();

-- ============================================================================
-- APPOINTMENT VALIDATION
-- ============================================================================

CREATE OR REPLACE FUNCTION private.prevent_appointment_reassignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT private.get_user_role()) = 'client'::public.user_role
     OR (SELECT private.get_user_role()) = 'lawyer'::public.user_role THEN
    IF NEW.client_id IS DISTINCT FROM OLD.client_id
       OR NEW.lawyer_id IS DISTINCT FROM OLD.lawyer_id
       OR NEW.matter_id IS DISTINCT FROM OLD.matter_id THEN
      RAISE EXCEPTION 'Clients and lawyers cannot change appointment participants or matter';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.prevent_appointment_reassignment() FROM PUBLIC;

DROP TRIGGER IF EXISTS prevent_appointment_reassignment ON public.appointments;
CREATE TRIGGER prevent_appointment_reassignment
BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION private.prevent_appointment_reassignment();

-- ============================================================================
-- NUMBER GENERATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_matter_number()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
BEGIN
  RETURN 'M-' || to_char(CURRENT_DATE, 'YYYY') || '-' ||
         lpad(nextval('public.matter_number_seq')::text, 3, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_inquiry_number()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
BEGIN
  RETURN 'WI-' || to_char(CURRENT_DATE, 'YYYY') || '-' ||
         lpad(nextval('public.inquiry_number_seq')::text, 3, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.generate_matter_number() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_inquiry_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_matter_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_inquiry_number() TO authenticated;

ALTER TABLE public.matters
  ALTER COLUMN matter_number SET DEFAULT public.generate_matter_number();

ALTER TABLE public.inquiries
  ALTER COLUMN inquiry_number SET DEFAULT public.generate_inquiry_number();

-- ============================================================================
-- STORAGE BUCKETS
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', FALSE)
ON CONFLICT (id) DO UPDATE SET public = FALSE;

INSERT INTO storage.buckets (id, name, public)
VALUES ('lawyer-photos', 'lawyer-photos', TRUE)
ON CONFLICT (id) DO UPDATE SET public = TRUE;

-- ============================================================================
-- STORAGE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS documents_storage_select ON storage.objects;
CREATE POLICY documents_storage_select
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND EXISTS (
    SELECT 1
    FROM public.documents AS d
    WHERE d.file_path = storage.objects.name
      AND private.can_access_document(d.matter_id, d.access_level)
  )
);

DROP POLICY IF EXISTS documents_storage_insert ON storage.objects;
CREATE POLICY documents_storage_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND EXISTS (
    SELECT 1
    FROM public.documents AS d
    WHERE d.file_path = storage.objects.name
      AND d.uploaded_by = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS documents_storage_update ON storage.objects;
CREATE POLICY documents_storage_update
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'documents'
  AND EXISTS (
    SELECT 1 FROM public.documents AS d
    WHERE d.file_path = storage.objects.name
      AND (d.uploaded_by = (SELECT auth.uid()) OR (SELECT private.is_admin()))
  )
)
WITH CHECK (
  bucket_id = 'documents'
  AND EXISTS (
    SELECT 1 FROM public.documents AS d
    WHERE d.file_path = storage.objects.name
      AND (d.uploaded_by = (SELECT auth.uid()) OR (SELECT private.is_admin()))
  )
);

DROP POLICY IF EXISTS documents_storage_delete ON storage.objects;
CREATE POLICY documents_storage_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'documents'
  AND (SELECT private.is_admin())
);

DROP POLICY IF EXISTS lawyer_photos_select ON storage.objects;
CREATE POLICY lawyer_photos_select
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'lawyer-photos');

DROP POLICY IF EXISTS lawyer_photos_insert ON storage.objects;
CREATE POLICY lawyer_photos_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'lawyer-photos' AND (SELECT private.is_admin()));

DROP POLICY IF EXISTS lawyer_photos_update ON storage.objects;
CREATE POLICY lawyer_photos_update
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'lawyer-photos' AND (SELECT private.is_admin()))
WITH CHECK (bucket_id = 'lawyer-photos' AND (SELECT private.is_admin()));

DROP POLICY IF EXISTS lawyer_photos_delete ON storage.objects;
CREATE POLICY lawyer_photos_delete
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'lawyer-photos' AND (SELECT private.is_admin()));

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

CREATE INDEX IF NOT EXISTS idx_lawyers_profile_id ON public.lawyers(profile_id);
CREATE INDEX IF NOT EXISTS idx_lawyers_is_active ON public.lawyers(is_active);

CREATE INDEX IF NOT EXISTS idx_matters_client_id ON public.matters(client_id);
CREATE INDEX IF NOT EXISTS idx_matters_lawyer_id ON public.matters(lawyer_id);
CREATE INDEX IF NOT EXISTS idx_matters_status ON public.matters(status);
CREATE INDEX IF NOT EXISTS idx_matters_date_opened ON public.matters(date_opened);

CREATE INDEX IF NOT EXISTS idx_inquiries_email ON public.inquiries(email);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON public.inquiries(status);
CREATE INDEX IF NOT EXISTS idx_inquiries_assigned_to ON public.inquiries(assigned_to);
CREATE INDEX IF NOT EXISTS idx_inquiries_client_id ON public.inquiries(client_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON public.inquiries(created_at);

CREATE INDEX IF NOT EXISTS idx_documents_matter_id ON public.documents(matter_id);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON public.documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_documents_access_level ON public.documents(access_level);
CREATE INDEX IF NOT EXISTS idx_documents_file_path ON public.documents(file_path);

CREATE INDEX IF NOT EXISTS idx_appointments_matter_id ON public.appointments(matter_id);
CREATE INDEX IF NOT EXISTS idx_appointments_client_id ON public.appointments(client_id);
CREATE INDEX IF NOT EXISTS idx_appointments_lawyer_id ON public.appointments(lawyer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON public.appointments(date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record_type ON public.audit_logs(record_type);

CREATE INDEX IF NOT EXISTS idx_saved_lawyers_user_id ON public.saved_lawyers(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_lawyers_lawyer_id ON public.saved_lawyers(lawyer_id);

-- ============================================================================
-- INITIAL PRIVILEGES
-- ============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.lawyers TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lawyers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.matters TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.inquiries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.appointments TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.saved_lawyers TO authenticated;

-- Anonymous users need only inquiry INSERT.
GRANT INSERT ON public.inquiries TO anon;

-- Sequence permissions for functions/administrative use.
GRANT USAGE, SELECT ON SEQUENCE public.matter_number_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.inquiry_number_seq TO authenticated;

-- ============================================================================
-- IMPORTANT: FIRST ADMIN
-- ============================================================================
-- 1. Create your first account through the application.
-- 2. Then run this in SQL Editor, replacing the email:
--
-- UPDATE public.profiles
-- SET role = 'admin'::public.user_role
-- WHERE email = 'your-admin-email@example.com';
--
-- Do NOT allow normal browser users to update their own role.
-- ============================================================================

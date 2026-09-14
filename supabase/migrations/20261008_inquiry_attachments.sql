-- ============================================================================
-- INQUIRY ATTACHMENTS — "Attach File / Photo / Video" on the public form
-- ============================================================================
-- Requested 2026-09-30, from the inquiry-form review: visitors should be able
-- to attach files, photos or videos to an inquiry "for discoverable insights
-- on the inquiry". Design:
--
--   * a private `inquiry-attachments` storage bucket, 25 MB per file;
--   * anyone may DROP a file into it (the form is anonymous — that is the
--     point), but only staff may read one back;
--   * public.inquiry_attachments records which files belong to which inquiry,
--     written only through a SECURITY DEFINER RPC keyed by the reference
--     number the submitter already holds. There is no INSERT policy: a
--     signed-out visitor cannot write this table directly at all.
--
-- The bucket is private and there is no anon SELECT policy, so files are not
-- enumerable and not publicly readable — the portal hands staff short-lived
-- signed URLs instead.

-- ----------------------------------------------------------------------------
-- 1. Storage bucket + policies
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inquiry-attachments', 'inquiry-attachments', FALSE, 26214400,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Upload: any visitor, but only into the inquiries/ namespace, and only
-- insert — nobody anonymous can list, overwrite or delete.
DROP POLICY IF EXISTS inquiry_attachments_storage_insert ON storage.objects;
CREATE POLICY inquiry_attachments_storage_insert
ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (
  bucket_id = 'inquiry-attachments'
  AND name LIKE 'inquiries/%'
);

-- Read: staff only. The portal creates signed URLs for these objects.
DROP POLICY IF EXISTS inquiry_attachments_storage_select ON storage.objects;
CREATE POLICY inquiry_attachments_storage_select
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'inquiry-attachments'
  AND (SELECT private.is_lawyer_or_admin())
);

-- Cleanup: admins only, so a bad upload can be removed.
DROP POLICY IF EXISTS inquiry_attachments_storage_delete ON storage.objects;
CREATE POLICY inquiry_attachments_storage_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'inquiry-attachments'
  AND (SELECT private.is_admin())
);

-- ----------------------------------------------------------------------------
-- 2. The record table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inquiry_attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id   UUID NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name    TEXT NOT NULL,
  mime_type    TEXT,
  size_bytes   BIGINT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inquiry_attachments_inquiry_idx
  ON public.inquiry_attachments (inquiry_id);

ALTER TABLE public.inquiry_attachments ENABLE ROW LEVEL SECURITY;

-- Staff read. No INSERT/UPDATE policy: rows are written by the RPC below.
DROP POLICY IF EXISTS inquiry_attachments_select_staff ON public.inquiry_attachments;
CREATE POLICY inquiry_attachments_select_staff
ON public.inquiry_attachments FOR SELECT TO authenticated
USING ((SELECT private.is_lawyer_or_admin()));

-- Explicit grants — the 20261007 lesson: do not depend on project defaults.
-- anon gets nothing here; the RPC is the only door.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inquiry_attachments
  TO authenticated, service_role;
REVOKE ALL ON public.inquiry_attachments FROM anon;

-- ----------------------------------------------------------------------------
-- 3. Linking RPC
-- ----------------------------------------------------------------------------
-- Called by the browser after submit_inquiry() hands back the reference
-- number, once the files themselves are in the bucket. Keyed by the reference
-- rather than the UUID because the reference is the only handle an anonymous
-- submitter has.
--
-- Trust model: knowing the reference is the capability. A guesser could
-- attach junk to someone else's inquiry; staff see the file list and can
-- delete it, and nothing here is readable by the public. Validating the
-- shape (inquiries/ prefix, no traversal, bounded count and lengths) keeps a
-- malicious caller from using this to point staff at arbitrary objects.
CREATE OR REPLACE FUNCTION public.attach_inquiry_files(
  p_reference TEXT,
  p_files     JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inquiry UUID;
  v_count   INT := 0;
  v_file    JSONB;
  v_path    TEXT;
BEGIN
  IF p_reference IS NULL OR btrim(p_reference) = '' THEN
    RAISE EXCEPTION 'A reference number is required.';
  END IF;

  SELECT id INTO v_inquiry
  FROM public.inquiries
  WHERE inquiry_number = btrim(p_reference);

  IF v_inquiry IS NULL THEN
    RAISE EXCEPTION 'No inquiry matches that reference number.';
  END IF;

  IF p_files IS NULL OR jsonb_typeof(p_files) <> 'array' THEN
    RETURN 0;
  END IF;

  IF jsonb_array_length(p_files) > 10 THEN
    RAISE EXCEPTION 'At most 10 attachments per inquiry.';
  END IF;

  FOR v_file IN SELECT * FROM jsonb_array_elements(p_files) LOOP
    v_path := COALESCE(v_file->>'path', '');
    IF v_path NOT LIKE 'inquiries/%'
       OR v_path LIKE '%..%'
       OR length(v_path) > 400 THEN
      RAISE EXCEPTION 'Invalid attachment path.';
    END IF;
    IF COALESCE(v_file->>'name', '') = '' OR length(v_file->>'name') > 255 THEN
      RAISE EXCEPTION 'Invalid attachment name.';
    END IF;

    INSERT INTO public.inquiry_attachments
      (inquiry_id, storage_path, file_name, mime_type, size_bytes)
    VALUES (
      v_inquiry,
      v_path,
      v_file->>'name',
      NULLIF(v_file->>'mime', ''),
      NULLIF(v_file->>'size', '')::BIGINT
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $$;

-- The public form is anonymous, so anon must be able to call it. It is the
-- second intentionally anon-executable SECURITY DEFINER function (the first
-- is submit_inquiry); the verification grid names both.
REVOKE ALL ON FUNCTION public.attach_inquiry_files(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_inquiry_files(TEXT, JSONB) TO anon, authenticated, service_role;

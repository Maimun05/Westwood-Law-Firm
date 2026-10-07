-- ============================================================================
-- PROFILE PICTURES + FORCED PASSWORD CHANGE
-- ============================================================================
-- Two features, one migration because the frontend ships them together:
--
--   1. A public `avatars` storage bucket so every account (admin, lawyer,
--      client) can have a square profile picture. `profiles.profile_image`
--      already exists (20260918_content_tables.sql) and the public pages
--      already render it, so nothing else is needed to display one.
--
--   2. `profiles.must_change_password`, the flag an admin-created staff
--      account carries until it replaces the temporary password it was
--      emailed. The edge function `admin-create-user` sets it; the portal
--      gates on it and clears it once the user picks a new password.
--
-- WHY A PUBLIC BUCKET. Lawyer photos appear on the public site, so the bucket
-- must serve anonymous GETs. A public bucket serves
-- /storage/v1/object/public/... without consulting RLS, so client and admin
-- avatars are equally reachable *by their URL*. That is accepted: object names
-- are random UUIDs under the owner's uid, there is deliberately NO SELECT
-- policy (so nothing can be listed/enumerated — the same reasoning as the
-- lawyer-photos listing fix in 20261005_security_advisor_fixes.sql), and a
-- changed picture deletes the previous object.
--
-- ORDERING: the frontend selects `must_change_password`, so this migration must
-- be applied (and the PostgREST schema cache reloaded) BEFORE the matching
-- frontend build deploys. Otherwise the select fails with 42703 and every
-- sign-in redirect-loops.

-- ----------------------------------------------------------------------------
-- 1. Forced-password-change flag
-- ----------------------------------------------------------------------------
-- Deliberately NOT added to private.guard_profile_update()'s blocked column
-- list: the user has to be able to clear their own flag after changing the
-- password, and blocking it would lock them out of the portal for good.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.must_change_password IS
  'True while an admin-created account still uses the temporary password it was emailed. Cleared by the account owner after they set a new one.';

-- ----------------------------------------------------------------------------
-- 2. Storage bucket + policies
-- ----------------------------------------------------------------------------
-- 5 MB, images only. The browser downscales to a 512x512 WebP before upload,
-- so a real file is a few tens of KB; the cap only stops abuse.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars', 'avatars', TRUE, 5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = TRUE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Write: an authenticated user may only create objects under their own uid
-- prefix (`<uid>/<uuid>.webp`); admins may manage anyone's, matching the
-- profiles_admin_write_policy that lets an admin edit another user's row.
DROP POLICY IF EXISTS avatars_storage_insert ON storage.objects;
CREATE POLICY avatars_storage_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (
    (SELECT private.is_admin())
    OR (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
  )
);

-- Overwrite: same rule, so a re-upload (upsert) cannot cross into another uid.
DROP POLICY IF EXISTS avatars_storage_update ON storage.objects;
CREATE POLICY avatars_storage_update
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    (SELECT private.is_admin())
    OR (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
  )
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (
    (SELECT private.is_admin())
    OR (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
  )
);

-- Delete: the uploader (owner) or an admin. Used to drop the previous picture
-- when a new one replaces it, and by the "Remove photo" action.
DROP POLICY IF EXISTS avatars_storage_delete ON storage.objects;
CREATE POLICY avatars_storage_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    (SELECT private.is_admin())
    OR owner_id = (SELECT auth.uid())::TEXT
  )
);

-- There is intentionally NO SELECT policy: a public bucket already serves the
-- object by URL, and adding SELECT would re-enable list() enumeration.

-- ----------------------------------------------------------------------------
-- 3. Make the new column visible to PostgREST immediately
-- ----------------------------------------------------------------------------
-- Hosted Supabase watches DDL, but an explicit reload removes any doubt that
-- "migration applied" and "the API sees the column" are the same moment.
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- 20261012 — Admins are view-only on documents
-- ============================================================================
-- Product decision (2026-10-05): an admin may see every document record and
-- open non-confidential files, but may not author documents. A document that
-- arrives at the front desk goes to the assigned lawyer, who files it.
--
-- Already true (20261001): an admin could never author a Confidential
-- document and could not change or delete one; every upload/open/delete is
-- audited. This migration removes the remaining non-confidential upload path —
-- for the table row AND for the storage object — so the rule is enforced in
-- the database, not only by hidden buttons.
--
-- Unchanged: admins still read metadata at every access level
-- (private.can_access_document) and open Confidential content only through
-- break-glass (private.can_read_document_content).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The role gate that documents_insert_allowed calls.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.can_upload_document(p_matter_id UUID, p_access_level public.access_level)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.user_can_access_matter(p_matter_id) THEN RETURN FALSE; END IF;
  RETURN CASE private.get_user_role()
    WHEN 'admin'  THEN FALSE                       -- view-only: admins never author documents
    WHEN 'lawyer' THEN private.is_matter_lawyer_team(p_matter_id)
                       AND p_access_level IN ('Client & Assigned Lawyer','Staff Shared','Lawyer Only','Confidential')
    WHEN 'client' THEN p_access_level = 'Client & Assigned Lawyer'
    ELSE FALSE END;
END $$;

REVOKE ALL ON FUNCTION private.can_upload_document(UUID, public.access_level) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_upload_document(UUID, public.access_level) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Storage insert. The file is uploaded before its documents row exists, so
--    this policy cannot see the access level — but it can see the role. An
--    admin uploads nothing to the documents bucket; lawyers and clients are
--    unchanged (the table policy above still decides who may author what).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS documents_storage_insert ON storage.objects;
CREATE POLICY documents_storage_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (SELECT private.user_can_access_matter_path(name))
  AND NOT (SELECT private.is_admin())
);

-- ----------------------------------------------------------------------------
-- 3. Storage delete. The row policy has always been uploader-only
--    (documents_delete_policy), but this one let an admin delete any file.
--    An admin who deleted someone else's document therefore removed the FILE
--    while the row survived (the row DELETE matched nothing and exited 0) —
--    the document became permanently unopenable and the UI still said
--    "deleted". With admins view-only the two policies now agree.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS documents_storage_delete ON storage.objects;
CREATE POLICY documents_storage_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'documents'
  AND owner_id = (SELECT auth.uid())::TEXT
);

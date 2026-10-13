-- ============================================================================
-- 20261022 — Firm contact details: new public email + phone
-- ============================================================================
-- The site renders the firm's contact details from src/lib/firm.ts, but the
-- seeded FAQ answer is database content and still names the old address and
-- number. Fix it in place so the live FAQ matches the site.
--
-- Every old variant is replaced so the file converges a database seeded from
-- any earlier version of 20260919: some rows carry atty.boyet@westwoodlaw.ph
-- (the pre-20261009 address), others the interim westwoodlawfirm1@gmail.com.
-- Atty. Tabao's own directory email (public_lawyers.email) and his portal
-- login are deliberately left alone — only the firm's public "contact us"
-- details change.
--
-- Idempotent: on a database already carrying the new values the replacements
-- find nothing, and re-running the file is a no-op.
-- ============================================================================

UPDATE public.faqs
SET answer = replace(
               replace(
                 replace(
                   replace(answer,
                     '(02) 7957 2121', '+63 2 8722 9244'),
                   '(02) 722 9244', '+63 2 8722 9244'),
                 'westwoodlawfirm1@gmail.com', 'firmwestwoodlaw@gmail.com'),
               'atty.boyet@westwoodlaw.ph', 'firmwestwoodlaw@gmail.com')
WHERE answer LIKE '%(02) 7957 2121%'
   OR answer LIKE '%(02) 722 9244%'
   OR answer LIKE '%westwoodlawfirm1@gmail.com%'
   OR answer LIKE '%atty.boyet@westwoodlaw.ph%';

-- ----------------------------------------------------------------------------
-- Verify (read-only)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_stale INTEGER;
BEGIN
  SELECT count(*) INTO v_stale FROM public.faqs
   WHERE answer LIKE '%(02) 7957 2121%'
      OR answer LIKE '%(02) 722 9244%'
      OR answer LIKE '%westwoodlawfirm1@gmail.com%'
      OR answer LIKE '%atty.boyet@westwoodlaw.ph%';
  RAISE NOTICE 'faqs still naming an old contact detail: %', v_stale;
END $$;

-- ============================================================================
-- 20261009 — Firm public contact email
-- ============================================================================
-- The site renders the firm's contact address from src/lib/firm.ts, but the
-- seeded FAQ answer is database content and still names the old address. Fix it
-- in place so the live FAQ matches the site.
--
-- Atty. Tabao's own directory email (public_lawyers.email) and his portal login
-- are deliberately left alone: only the firm's public "contact us" address
-- changes, not the lawyer's personal address.
--
-- Idempotent: on a database built from the current seed the replacement finds
-- nothing, and re-running the file is a no-op.
-- ============================================================================

UPDATE public.faqs
SET answer = replace(answer, 'atty.boyet@westwoodlaw.ph', 'westwoodlawfirm1@gmail.com')
WHERE answer LIKE '%atty.boyet@westwoodlaw.ph%';

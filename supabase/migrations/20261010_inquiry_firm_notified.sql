-- ============================================================================
-- 20261010 — Track whether the firm has been emailed about an inquiry
-- ============================================================================
-- Signed-out visitors' inquiries are emailed to the firm (edge function
-- notify-inquiry) and deliberately excluded from Client Intake; only inquiries
-- filed by a signed-in client stay in the queue.
--
-- firm_notified_at is the claim: the function atomically sets it on the row it
-- is about to email, so a double-click, a retry or two tabs cannot email the
-- same inquiry twice. If the provider rejects the message, the function
-- releases the claim so a retry can still deliver it.
--
-- Idempotent.
-- ============================================================================

ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS firm_notified_at TIMESTAMPTZ;

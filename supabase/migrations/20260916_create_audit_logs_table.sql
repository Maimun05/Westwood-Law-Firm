-- ============================================================================
-- Migration: Create Audit Logs Table
-- ============================================================================
-- Description: Creates the audit_logs table to track security-sensitive actions
-- for compliance, debugging, and security monitoring.
--
-- Author: Admin
-- Date: 2026-09-16
-- ============================================================================

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT,
  user_role TEXT,
  event_type TEXT NOT NULL,
  event_description TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  metadata JSONB,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comments
COMMENT ON TABLE public.audit_logs IS 'Audit trail for security-sensitive actions';
COMMENT ON COLUMN public.audit_logs.user_id IS 'User who performed the action';
COMMENT ON COLUMN public.audit_logs.event_type IS 'Type of event (LOGIN, LOGOUT, ACCOUNT_CREATED, etc.)';
COMMENT ON COLUMN public.audit_logs.event_description IS 'Human-readable description of the event';
COMMENT ON COLUMN public.audit_logs.resource_type IS 'Type of resource affected (user, matter, document, etc.)';
COMMENT ON COLUMN public.audit_logs.resource_id IS 'ID of the affected resource';
COMMENT ON COLUMN public.audit_logs.metadata IS 'Additional context as JSON';
COMMENT ON COLUMN public.audit_logs.success IS 'Whether the action succeeded';

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON public.audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON public.audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_success ON public.audit_logs(success) WHERE success = false;

-- Enable Row Level Security
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- DROP-then-CREATE rather than bare CREATE so this file can be re-run.

-- Policy: Users can view their own audit logs
DROP POLICY IF EXISTS "Users can view own audit logs" ON public.audit_logs;
CREATE POLICY "Users can view own audit logs"
  ON public.audit_logs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Admins can view all audit logs
DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view all audit logs"
  ON public.audit_logs
  FOR SELECT
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- Policy: System can insert audit logs (for authenticated users)
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated users can insert audit logs"
  ON public.audit_logs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Function to automatically log auth events
--
-- GUARDED ON PURPOSE. 20261003_integrity_hardening.sql replaces this function
-- with a version that also stamps audit_logs.source = 'trigger'. If this file
-- is re-run after that migration, an unconditional CREATE OR REPLACE would
-- silently revert the hardening. Only create it when it is genuinely absent.
DO $$ BEGIN
  IF to_regprocedure('public.log_auth_event()') IS NULL THEN
    EXECUTE $fn$
CREATE FUNCTION public.log_auth_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $body$
BEGIN
  -- Log user creation
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (
      user_id,
      user_email,
      event_type,
      event_description,
      success
    ) VALUES (
      NEW.id,
      NEW.email,
      'ACCOUNT_CREATED',
      'User account created: ' || NEW.email,
      true
    );
  END IF;

  -- Log profile updates
  IF TG_OP = 'UPDATE' THEN
    -- Check if role changed
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      INSERT INTO public.audit_logs (
        user_id,
        user_email,
        user_role,
        event_type,
        event_description,
        resource_type,
        resource_id,
        metadata,
        success
      ) VALUES (
        NEW.id,
        NEW.email,
        NEW.role,
        'ROLE_CHANGED',
        'User role changed from ' || OLD.role || ' to ' || NEW.role,
        'user',
        NEW.id::TEXT,
        jsonb_build_object(
          'old_role', OLD.role,
          'new_role', NEW.role
        ),
        true
      );
    END IF;

    -- Check if deactivated
    IF OLD.is_active = true AND NEW.is_active = false THEN
      INSERT INTO public.audit_logs (
        user_id,
        user_email,
        user_role,
        event_type,
        event_description,
        resource_type,
        resource_id,
        success
      ) VALUES (
        NEW.id,
        NEW.email,
        NEW.role,
        'ACCOUNT_DEACTIVATED',
        'User account deactivated: ' || NEW.email,
        'user',
        NEW.id::TEXT,
        true
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$body$;
$fn$;
  END IF;
END $$;

-- Create trigger for profile changes
DROP TRIGGER IF EXISTS trigger_log_profile_changes ON public.profiles;
CREATE TRIGGER trigger_log_profile_changes
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.log_auth_event();

-- Function to clean up old audit logs (optional, run manually or via cron)
--
-- GUARDED ON PURPOSE, same reason as log_auth_event above: the version in
-- 20261003_integrity_hardening.sql restricts this to admins and enforces a
-- 30-day floor. Re-running this file must not undo that.
DO $$ BEGIN
  IF to_regprocedure('public.cleanup_old_audit_logs(integer)') IS NULL THEN
    EXECUTE $fn$
CREATE FUNCTION public.cleanup_old_audit_logs(days_to_keep INTEGER DEFAULT 365)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $body$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.audit_logs
  WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$body$;
$fn$;
  END IF;
END $$;

-- Grant permissions
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT INSERT ON public.audit_logs TO authenticated;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Next steps:
-- 1. Run this migration: supabase db push
-- 2. Verify table exists: SELECT * FROM audit_logs LIMIT 1;
-- 3. Test audit logging in application
-- 4. Set up periodic cleanup (optional): SELECT cleanup_old_audit_logs(365);
-- ============================================================================

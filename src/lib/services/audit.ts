// ============================================================================
// Audit Logging Service
// ============================================================================
// Records and retrieves security-sensitive actions for compliance and debugging.
// ============================================================================

import { supabase } from "@/lib/supabase";

export type AuditEventType =
  | "LOGIN"
  | "LOGOUT"
  | "ACCOUNT_CREATED"
  | "ACCOUNT_UPDATED"
  | "ACCOUNT_DELETED"
  | "ACCOUNT_DEACTIVATED"
  | "ROLE_CHANGED"
  | "PASSWORD_CHANGED"
  | "PASSWORD_RESET_REQUESTED"
  | "EMAIL_VERIFICATION_SENT"
  | "EMAIL_VERIFIED"
  | "MATTER_CREATED"
  | "MATTER_UPDATED"
  | "MATTER_DELETED"
  | "DOCUMENT_UPLOADED"
  | "DOCUMENT_DOWNLOADED"
  | "DOCUMENT_DELETED"
  | "APPOINTMENT_CREATED"
  | "APPOINTMENT_CANCELLED"
  | "RESTRICTED_ACCESS_ATTEMPTED"
  | "PERMISSION_DENIED"
  | "SYSTEM_SETTING_CHANGED";

export interface AuditLogEntry {
  id?: string;
  user_id: string;
  user_email?: string;
  user_role?: string;
  event_type: AuditEventType;
  event_description: string;
  resource_type?: string;
  resource_id?: string;
  metadata?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  success: boolean;
  created_at?: string;
}

/**
 * Log an audit event
 */
export async function logAuditEvent(
  event_type: AuditEventType,
  event_description: string,
  options?: {
    resource_type?: string;
    resource_id?: string;
    metadata?: Record<string, any>;
    success?: boolean;
  },
) {
  try {
    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      // Silently skip audit logging if no user is authenticated
      // This is normal during public page loads and failed login attempts
      return { error: null };
    }

    // Get user profile for role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const auditLog: AuditLogEntry = {
      user_id: user.id,
      user_email: user.email || undefined,
      user_role: profile?.role || undefined,
      event_type,
      event_description,
      resource_type: options?.resource_type,
      resource_id: options?.resource_id,
      metadata: options?.metadata,
      success: options?.success !== undefined ? options.success : true,
    };

    const { data, error } = await supabase.from("audit_logs").insert(auditLog).select().single();

    if (error) throw error;

    return { data, error: null };
  } catch (error: any) {
    // PostgREST errors carry code/details/hint, but logging the raw object just
    // shows "Object" in the console. Flatten it so the reason is readable.
    console.error("Error logging audit event:", {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    });
    return {
      data: null,
      error: error.message || "Failed to log audit event",
    };
  }
}

/**
 * Get audit logs for current user
 */
export async function getMyAuditLogs(limit = 50) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { data: [], error: "No user authenticated" };
    }

    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return { data: data || [], error: null };
  } catch (error: any) {
    console.error("Error fetching my audit logs:", error);
    return {
      data: [],
      error: error.message || "Failed to fetch audit logs",
    };
  }
}

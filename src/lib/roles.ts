// ============================================================================
// The three-role model (migration 20261027)
// ============================================================================
//   client  — the firm's clients: their own matters, documents, appointments
//             and inquiry threads.
//   lawyer  — casework: assigned matters, the inquiry queue, document
//             authorship (incl. Confidential), matter teams.
//   admin   — the firm's administrator: staff accounts, the audit trail, the
//             intake queue, website content, reports and every matter (view
//             only on documents — see can_upload_document in SQL).
//
// The database is the authority — every rule here is enforced by RLS — but the
// portal has to know what to render. Centralising the vocabulary means a role
// check is written once, in words, instead of a dozen scattered string
// comparisons that would silently go stale.
// ============================================================================

export type UserRole = "client" | "admin" | "lawyer";

/**
 * Databases that have not had 20261027 pasted yet still carry the six-role
 * vocabulary (managing_partner, system_admin, legal_assistant, paralegal) and
 * older ones carry the original 'admin'. Every role read from the database goes
 * through here so the portal works before and after the migration.
 *
 *   managing_partner, system_admin, legal_assistant -> admin
 *   paralegal                                       -> lawyer
 */
export function normalizeRole(role: string | null | undefined): UserRole {
  switch (role) {
    case "lawyer":
    case "paralegal":
      return "lawyer";
    case "admin":
    case "managing_partner":
    case "system_admin":
    case "legal_assistant":
      return "admin";
    default:
      return "client";
  }
}

/** Human label, e.g. for the account menu and role badges. */
export function roleLabel(role: UserRole): string {
  switch (role) {
    case "admin":
      return "Admin";
    case "lawyer":
      return "Lawyer";
    default:
      return "Client";
  }
}

/** The portal's own name in the shell header. */
export function portalName(role: UserRole): string {
  switch (role) {
    case "admin":
      return "Admin Portal";
    case "lawyer":
      return "Lawyer Portal";
    default:
      return "Client Portal";
  }
}

export const isClient = (role: UserRole) => role === "client";

/**
 * The three roles in the order the account dropdowns and filters list them:
 * the client first, then firm staff.
 */
export const USER_ROLES: UserRole[] = ["client", "lawyer", "admin"];

/** The firm administrator — accounts, audit, intake and content. */
export const isFirmAdmin = (role: UserRole) => role === "admin";

/** Who may read the whole audit trail: the admin only (RLS grants it). */
export const seesAllAuditLogs = (role: UserRole) => role === "admin";

/** Everyone except clients. */
export const isStaff = (role: UserRole) => role !== "client";

export const isLawyer = (role: UserRole) => role === "lawyer";

/** Who may write internal (lawyer-only) notes on a matter. */
export const canWriteInternalNotes = (role: UserRole) => role === "lawyer";

// ============================================================================
// The six-role model (migration 20261023)
// ============================================================================
//   client           — the firm's clients: their own matters, documents,
//                      appointments and inquiry threads.
//   lawyer           — assigned lawyer / matter-team member: casework, team
//                      management, document authorship (incl. Confidential).
//   paralegal        — matter-team support: matters, internal notes, timeline
//                      and non-Confidential documents. No status moves, no
//                      Confidential, no team management.
//   legal_assistant  — intake: the whole inquiry queue and the new-inquiry
//                      bell, nothing else legal.
//   managing_partner — every power the old single 'admin' role had.
//   system_admin     — technical role: staff accounts + audit trail, no legal
//                      work at all.
//
// The database is the authority — every rule here is enforced by RLS — but the
// portal has to know what to render. Centralising the vocabulary means a role
// check is written once, in words, instead of a dozen scattered string
// comparisons that would silently go stale.
// ============================================================================

export type UserRole =
  | "client"
  | "lawyer"
  | "legal_assistant"
  | "paralegal"
  | "managing_partner"
  | "system_admin";

/**
 * Databases that have not had 20261023 pasted yet still carry the legacy
 * 'admin' label. The portal ships before the migration, so every role read
 * from the database goes through here and both states work.
 */
export function normalizeRole(role: string | null | undefined): UserRole {
  if (role === "admin") return "managing_partner";
  switch (role) {
    case "lawyer":
    case "legal_assistant":
    case "paralegal":
    case "managing_partner":
    case "system_admin":
      return role;
    default:
      return "client";
  }
}

/** Human label, e.g. for the account menu and role badges. */
export function roleLabel(role: UserRole): string {
  switch (role) {
    case "managing_partner":
      return "Managing Partner";
    case "system_admin":
      return "System Administrator";
    case "legal_assistant":
      return "Legal Assistant";
    case "paralegal":
      return "Paralegal";
    case "lawyer":
      return "Lawyer";
    default:
      return "Client";
  }
}

/** The portal's own name in the shell header. */
export function portalName(role: UserRole): string {
  switch (role) {
    case "managing_partner":
      return "Managing Partner Portal";
    case "system_admin":
      return "System Administration";
    case "legal_assistant":
      return "Intake Portal";
    case "paralegal":
      return "Paralegal Portal";
    case "lawyer":
      return "Lawyer Portal";
    default:
      return "Client Portal";
  }
}

export const isClient = (role: UserRole) => role === "client";

/**
 * The six roles in the order the account dropdowns and filters list them:
 * the client first, then firm staff.
 */
export const USER_ROLES: UserRole[] = [
  "client",
  "lawyer",
  "paralegal",
  "legal_assistant",
  "managing_partner",
  "system_admin",
];

/** The managing partner — every power the old 'admin' role had. */
export const isFirmAdmin = (role: UserRole) => role === "managing_partner";

/** The system administrator — accounts and audit only. */
export const isSystemAdmin = (role: UserRole) => role === "system_admin";

/** Who may manage staff accounts (create / edit / deactivate): MP and SA. */
export const canManageAccounts = (role: UserRole) =>
  role === "managing_partner" || role === "system_admin";

/** Who may read the whole audit trail: MP and SA (RLS grants both). */
export const seesAllAuditLogs = (role: UserRole) =>
  role === "managing_partner" || role === "system_admin";

/** Everyone except clients. */
export const isStaff = (role: UserRole) => role !== "client";

export const isLawyer = (role: UserRole) => role === "lawyer";
export const isParalegal = (role: UserRole) => role === "paralegal";
export const isIntake = (role: UserRole) => role === "legal_assistant";

/** Who may write internal (lawyer-only) notes on a matter. */
export const canWriteInternalNotes = (role: UserRole) => role === "lawyer" || role === "paralegal";

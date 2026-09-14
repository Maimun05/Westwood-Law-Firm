// ============================================================================
// Client Portal Data Service
// ============================================================================
// Handles data queries for the client/lawyer portal (matters, documents, appointments, audit logs).
// ============================================================================

import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type Matter = Database["public"]["Tables"]["matters"]["Row"];
type MatterInsert = Database["public"]["Tables"]["matters"]["Insert"];
type MatterUpdate = Database["public"]["Tables"]["matters"]["Update"];

type Document = Database["public"]["Tables"]["documents"]["Row"];
type DocumentInsert = Database["public"]["Tables"]["documents"]["Insert"];
type DocumentUpdate = Database["public"]["Tables"]["documents"]["Update"];

type Appointment = Database["public"]["Tables"]["appointments"]["Row"];
type AppointmentInsert = Database["public"]["Tables"]["appointments"]["Insert"];
type AppointmentUpdate = Database["public"]["Tables"]["appointments"]["Update"];

type AuditLog = Database["public"]["Tables"]["audit_logs"]["Row"];
type AuditLogInsert = Database["public"]["Tables"]["audit_logs"]["Insert"];

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

type Inquiry = Database["public"]["Tables"]["inquiries"]["Row"];
type InquiryInsert = Database["public"]["Tables"]["inquiries"]["Insert"];
type InquiryUpdate = Database["public"]["Tables"]["inquiries"]["Update"];

export async function getMyMatters(userId: string, userRole: string) {
  try {
    let query = supabase.from("matters").select("*").order("created_at", { ascending: false });

    if (userRole === "client") {
      query = query.eq("client_id", userId);
    }
    // Lawyers and admins: no filter. RLS returns exactly the matters each may see
    // (assigned or added to the team for lawyers, everything for admins).

    const { data, error } = await query;

    if (error) throw error;
    return { data, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function getDocumentsByMatter(matterId: string) {
  try {
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("matter_id", matterId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function getMyAppointments(userId: string, userRole: string) {
  try {
    let query = supabase.from("appointments").select("*").order("date", { ascending: true });

    if (userRole === "client") {
      query = query.eq("client_id", userId);
    } else if (userRole === "lawyer") {
      query = query.eq("lawyer_id", userId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return { data, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

// ── Matter team ───────────────────────────────────────────────────────────────
//
// The assigned lawyer plus anyone added here. RLS decides who may write: an
// admin, or the matter's own assigned lawyer. A trigger rejects anything that
// is not a lawyer profile, so the UI only has to offer lawyers.

export type MatterMember = {
  matter_id: string;
  lawyer_id: string;
  created_at: string;
};

export async function getMatterTeam(matterId: string) {
  try {
    const { data, error } = await supabase
      .from("matter_members")
      .select("matter_id, lawyer_id, created_at")
      .eq("matter_id", matterId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return { data: data as MatterMember[], error: null };
  } catch (error: any) {
    return { data: null, error: error.message as string };
  }
}

export async function addMatterMember(matterId: string, lawyerId: string) {
  try {
    const { error } = await supabase
      .from("matter_members")
      .insert({ matter_id: matterId, lawyer_id: lawyerId });

    if (error) throw error;
    return { error: null };
  } catch (error: any) {
    // 23505 = already on the team; the composite PK catches the double-add.
    const duplicate = error?.code === "23505" || /duplicate key/i.test(error?.message ?? "");
    if (duplicate) return { error: null };
    return { error: error.message as string };
  }
}

export async function removeMatterMember(matterId: string, lawyerId: string) {
  try {
    const { error } = await supabase
      .from("matter_members")
      .delete()
      .eq("matter_id", matterId)
      .eq("lawyer_id", lawyerId);

    if (error) throw error;
    return { error: null };
  } catch (error: any) {
    return { error: error.message as string };
  }
}

export async function getMyAuditLogs(userId: string, userRole: string) {
  try {
    let query = supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (userRole !== "admin") {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return { data, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function updateMatterStatus(matterId: string, status: Matter["status"]) {
  try {
    const { data, error } = await supabase
      .from("matters")
      .update({ status })
      .eq("id", matterId)
      .select("id, status")
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error: any) {
    // .single() reports "0 rows" when RLS blocked the update
    const blocked = /0 rows|no rows|multiple \(or no\) rows/i.test(error?.message ?? "");
    return {
      data: null,
      error: blocked
        ? "You don't have permission to change this matter's status."
        : (error?.message as string),
    };
  }
}

// Allowed next statuses. Mirrors private.matter_transition_allowed() in the database,
// which is what actually enforces it; this only keeps the dropdown honest.
const NEXT: Record<string, Matter["status"][]> = {
  "New Inquiry": ["Under Review", "Closed"],
  "Under Review": ["Consultation", "Conflict Check", "Closed"],
  Consultation: ["Conflict Check", "Closed"],
  "Conflict Check": ["Accepted", "Closed"],
  Accepted: ["Active", "Closed"],
  Active: ["Resolved", "Closed"],
  Resolved: ["Active", "Closed"],
  Closed: [],
};
export function statusChoices(current: Matter["status"], isAdmin: boolean): Matter["status"][] {
  const next = [...(NEXT[current] ?? [])];
  if (current === "Closed" && isAdmin) next.push("Under Review");
  return [current, ...next];
}

// ============================================================================
// Admin Service Layer
// ============================================================================
// Handles administrative operations including user management.
// All operations verify admin permissions server-side.
// ============================================================================

import { supabase } from "@/lib/supabase";

export interface CreateUserData {
  email: string;
  password: string;
  fullName: string;
  role: "client" | "lawyer" | "admin";
  phone?: string;
  address?: string;
  city?: string;
  dateOfBirth?: string;
  position?: string;
}

export interface UpdateUserData {
  // Name parts, not full_name: the database composes full_name from these on
  // every write (private.compose_full_name), so sending full_name is a no-op.
  honorific?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  suffix?: string;
  nickname?: string;
  phone?: string;
  address?: string;
  city?: string;
  role?: "client" | "lawyer" | "admin";
  position?: string;
}

/**
 * Create a new user account (admin only)
 * Uses Supabase Edge Function to securely create user with password
 */
export async function adminCreateUser(userData: CreateUserData) {
  try {
    // Get current session token
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      throw new Error("No active session");
    }

    // Call the Edge Function
    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: userData,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      throw error;
    }

    if (data.error) {
      throw new Error(data.error);
    }

    return { data: data.user, error: null };
  } catch (error: any) {
    console.error("Error creating user:", error);
    return {
      data: null,
      error: error.message || "Failed to create user",
    };
  }
}

/**
 * Update a user's profile (admin only)
 */
export async function adminUpdateUser(userId: string, updates: UpdateUserData) {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .update({
        honorific: updates.honorific,
        first_name: updates.firstName,
        middle_name: updates.middleName,
        last_name: updates.lastName,
        suffix: updates.suffix,
        nickname: updates.nickname,
        phone: updates.phone,
        address: updates.address,
        city: updates.city,
        role: updates.role,
        position: updates.position,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error: any) {
    console.error("Error updating user:", error);
    return {
      data: null,
      error: error.message || "Failed to update user",
    };
  }
}

/**
 * Get a user's profile (admin only)
 */
export async function adminGetUser(userId: string) {
  try {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();

    if (error) throw error;

    return { data, error: null };
  } catch (error: any) {
    console.error("Error fetching user:", error);
    return {
      data: null,
      error: error.message || "Failed to fetch user",
    };
  }
}

/**
 * Deactivate a user account (admin only)
 * Uses soft delete - sets is_active to false
 */
export async function adminDeactivateUser(userId: string) {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return { data, error: null };
  } catch (error: any) {
    console.error("Error deactivating user:", error);
    return {
      data: null,
      error: error.message || "Failed to deactivate user. Database migration may be required.",
    };
  }
}

/**
 * Delete a user account (admin only)
 * WARNING: This is destructive and should only be used when absolutely necessary
 * Consider using deactivate instead
 *
 * Uses the admin-delete-user Edge Function so the Auth user is removed with
 * the service-role key (not just the profiles row). profiles.id cascades
 * from auth.users, so the profile is cleaned up automatically server-side.
 */
/**
 * Reactivate a previously deactivated account (admin only).
 * The counterpart to adminDeactivateUser - without it, deactivation is a
 * one-way door and the only way back is editing the database by hand.
 */
export async function adminReactivateUser(userId: string) {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .update({
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error: any) {
    console.error("Error reactivating user:", error);
    return {
      data: null,
      error: error.message || "Failed to reactivate user.",
    };
  }
}

export async function adminDeleteUser(userId: string) {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      throw new Error("No active session");
    }

    const { data, error } = await supabase.functions.invoke("admin-delete-user", {
      body: { userId },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    return { error: null };
  } catch (error: any) {
    console.error("Error deleting user:", error);
    return {
      error: error.message || "Failed to delete user",
    };
  }
}

/**
 * Get all user profiles (admin only)
 */
export async function adminGetAllUsers() {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return { data: data || [], error: null };
  } catch (error: any) {
    console.error("Error fetching users:", error);
    return {
      data: [],
      error: error.message || "Failed to fetch users",
    };
  }
}

/**
 * Change a user's role (admin only)
 */
export async function adminChangeUserRole(userId: string, newRole: "client" | "lawyer" | "admin") {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .update({
        role: newRole,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error: any) {
    console.error("Error changing user role:", error);
    return {
      data: null,
      error: error.message || "Failed to change user role",
    };
  }
}

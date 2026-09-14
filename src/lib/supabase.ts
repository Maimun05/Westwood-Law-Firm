// ============================================================================
// Typed Supabase Client Factory
// ============================================================================
// Use this in all files that need a typed Supabase client

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export function createTypedSupabaseClient(): SupabaseClient<Database> {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storage: window.localStorage,
    },
  });
}

// Export a singleton for backwards compatibility
export const supabase: SupabaseClient<Database> = createTypedSupabaseClient();

export function handleSupabaseError(error: any): string {
  if (error?.message) {
    return error.message;
  }
  return "An unexpected error occurred. Please try again.";
}

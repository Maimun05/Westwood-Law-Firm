// ============================================================================

// Admin Delete User - Supabase Edge Function

// ============================================================================

// Permanently deletes a user's Auth account (and, via ON DELETE CASCADE,

// their profiles row) using the service-role key. The previous client-side

// implementation only deleted the profiles row, leaving an orphaned auth.users

// record behind — that account's email could never be reused and the user

// was left in a broken half-deleted state.

//

// Security:

// - Validates that the requesting user is an admin

// - Refuses to let an admin delete their own account (avoids accidental lockout)

// - Uses service-role key server-side only

// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",

  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DeleteUserRequest {
  userId: string;
}

serve(async (req) => {
  // Handle CORS preflight

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get the authorization header

    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      throw new Error("No authorization header");
    }

    // Create Supabase client with user's token (for verification)

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",

      Deno.env.get("SUPABASE_ANON_KEY") ?? "",

      {
        global: {
          headers: { Authorization: authHeader },
        },
      },
    );

    // Verify the requesting user is authenticated and is an admin

    const {
      data: { user },

      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Not authenticated" }),

        {
          status: 401,

          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Check if user is admin

    const { data: profile, error: profileError } = await supabaseClient

      .from("profiles")

      .select("role")

      .eq("id", user.id)

      .single();

    if (profileError || !profile || profile.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Admin access required" }),

        {
          status: 403,

          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Parse request body

    const requestBody: DeleteUserRequest = await req.json();

    const { userId } = requestBody;

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Missing required field: userId" }),

        {
          status: 400,

          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Refuse to let an admin delete their own account via this endpoint

    if (userId === user.id) {
      return new Response(
        JSON.stringify({ error: "You cannot delete your own account" }),

        {
          status: 400,

          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Create admin client with service-role key

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",

      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",

      {
        auth: {
          autoRefreshToken: false,

          persistSession: false,
        },
      },
    );

    // Delete the auth user. profiles.id has ON DELETE CASCADE against

    // auth.users(id), so the profile row (and anything else that cascades

    // from it) is removed automatically — no separate profiles delete needed.

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error("Auth deletion error:", deleteError);

      return new Response(
        JSON.stringify({
          error: `Failed to delete user: ${deleteError.message}`,
        }),

        {
          status: 400,

          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({ success: true, deleted: userId }),

      {
        status: 200,

        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in admin-delete-user function:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "An unexpected error occurred",
      }),

      {
        status: 500,

        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

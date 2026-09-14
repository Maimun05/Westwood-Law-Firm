// ============================================================================

// Admin Create User - Supabase Edge Function

// ============================================================================

// This function allows administrators to securely create new user accounts

// with passwords. It uses the service-role key which must NEVER be exposed

// to the frontend.

//

// Security:

// - Validates that the requesting user is an admin

// - Uses service-role key server-side only

// - Never returns passwords

// - Creates both Auth user and profile

// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",

  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateUserRequest {
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

    const requestBody: CreateUserRequest = await req.json();

    const { email, password, fullName, role, phone, address, city, dateOfBirth, position } =
      requestBody;

    // Validate required fields

    if (!email || !password || !fullName || !role) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: email, password, fullName, role",
        }),

        {
          status: 400,

          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Validate password length

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters" }),

        {
          status: 400,

          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Validate role

    if (!["client", "lawyer", "admin"].includes(role)) {
      return new Response(
        JSON.stringify({
          error: "Invalid role. Must be client, lawyer, or admin",
        }),

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

    // Create the auth user

    // Split the display name into composite parts so the database trigger can

    // populate first_name / middle_name / last_name on the profile.

    const nameParts = fullName.trim().split(/\s+/).filter(Boolean);

    const firstName = nameParts[0] ?? fullName.trim();

    const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : null;

    const middleName = nameParts.length > 2 ? nameParts.slice(1, -1).join(" ") : null;

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,

      password,

      email_confirm: true, // Auto-confirm email for admin-created accounts

      user_metadata: {
        first_name: firstName,

        middle_name: middleName,

        last_name: lastName,

        full_name: fullName,

        phone: phone || null,

        address: address || null,

        city: city || null,

        date_of_birth: dateOfBirth || null,
      },
    });

    if (authError) {
      console.error("Auth creation error:", authError);

      // Check for duplicate email

      if (authError.message.includes("already registered")) {
        return new Response(
          JSON.stringify({
            error: "An account with this email already exists",
          }),

          {
            status: 409,

            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({
          error: `Failed to create user: ${authError.message}`,
        }),

        {
          status: 400,

          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!authData.user) {
      throw new Error("User created but no user data returned");
    }

    // Update the profile with the correct role and firm position

    // (The trigger creates the profile with 'client' role by default)

    const { error: profileUpdateError } = await supabaseAdmin

      .from("profiles")

      .update({
        role,

        ...(position ? { position } : {}),
      })

      .eq("id", authData.user.id);

    if (profileUpdateError) {
      console.error("Profile update error:", profileUpdateError);

      // Don't fail the entire operation if profile update fails

      // The user is created, we'll just log the error
    }

    // Return success (NEVER return the password)

    return new Response(
      JSON.stringify({
        success: true,

        user: {
          id: authData.user.id,

          email: authData.user.email,

          fullName,

          role,

          position: position ?? null,

          created: true,
        },
      }),

      {
        status: 201,

        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in admin-create-user function:", error);

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

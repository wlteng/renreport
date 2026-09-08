// Lets an administrator change a staff member's username, password, or both.
//
// Both live in Supabase Auth, which the browser cannot reach with an admin key,
// so the change is made here with the service role after the caller is checked
// to be an active administrator holding the manage_people capability.

import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { z } from "npm:zod@3.24.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;
const staffLoginDomain = "staff.renreport.invalid";

const requestSchema = z
  .object({
    user_id: z.string().uuid(),
    username: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .toLowerCase()
        .min(3)
        .max(32)
        .regex(/^[a-z0-9][a-z0-9_-]*$/)
        .optional(),
    ),
    password: z.preprocess(emptyToUndefined, z.string().min(8).max(128).optional()),
  })
  .refine((value) => value.username !== undefined || value.password !== undefined, {
    message: "Enter a new username or a new password",
  });

const env = (name: string) => {
  const deno = globalThis as typeof globalThis & {
    Deno?: { env: { get: (key: string) => string | undefined } };
  };
  return deno.Deno?.env.get(name);
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = env("SUPABASE_URL");
  const anonKey = env("SUPABASE_ANON_KEY");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: "Function environment is not configured" }, 500);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ error: "Missing bearer token" }, 401);
  }

  const token = authorization.slice(7);
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: callerData, error: callerError } = await callerClient.auth.getUser(token);
  if (callerError || !callerData.user) return json({ error: "Invalid or expired session" }, 401);

  const callerId = callerData.user.id;
  const [{ data: permitted, error: permissionError }, { data: adminRole, error: roleError }] =
    await Promise.all([
      adminClient.rpc("has_permission", {
        _user_id: callerId,
        _permission_key: "manage_people",
      }),
      adminClient
        .from("user_roles")
        .select("id")
        .eq("user_id", callerId)
        .eq("role", "admin")
        .maybeSingle(),
    ]);

  if (permissionError || roleError) return json({ error: "Could not verify access" }, 500);
  if (!permitted || !adminRole) {
    return json({ error: "Only an active administrator can change staff logins" }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON" }, 400);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid login details" }, 400);
  }

  const input = parsed.data;
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, email, username")
    .eq("id", input.user_id)
    .maybeSingle();
  if (profileError) return json({ error: "Could not load the staff account" }, 500);
  if (!profile) return json({ error: "Staff account not found" }, 404);

  // A staff login address is derived from the username, so renaming moves it.
  // Accounts signing in with a real email keep that address untouched.
  const usesStaffLogin = String(profile.email ?? "").endsWith(`@${staffLoginDomain}`);
  const nextEmail =
    input.username && usesStaffLogin ? `${input.username}@${staffLoginDomain}` : undefined;

  if (input.username && input.username !== profile.username) {
    const { data: taken, error: takenError } = await adminClient
      .from("profiles")
      .select("id")
      .eq("username", input.username)
      .neq("id", input.user_id)
      .maybeSingle();
    if (takenError) return json({ error: "Could not check the username" }, 500);
    if (taken) return json({ error: "That username is already taken" }, 409);
  }

  const authUpdate: { email?: string; password?: string } = {};
  if (nextEmail) authUpdate.email = nextEmail;
  if (input.password) authUpdate.password = input.password;
  if (Object.keys(authUpdate).length > 0) {
    const { error: authError } = await adminClient.auth.admin.updateUserById(input.user_id, {
      ...authUpdate,
      ...(nextEmail ? { email_confirm: true } : {}),
    });
    if (authError) {
      return json({ error: authError.message || "Could not update the login" }, 400);
    }
  }

  if (input.username) {
    const profileUpdate: Record<string, string> = { username: input.username };
    if (nextEmail) profileUpdate.email = nextEmail;
    const { error: updateError } = await adminClient
      .from("profiles")
      .update(profileUpdate)
      .eq("id", input.user_id);
    if (updateError) {
      // The login already moved, so report it rather than leaving it silent.
      return json(
        { error: `Login updated but the profile did not follow: ${updateError.message}` },
        500,
      );
    }
  }

  return json(
    {
      user_id: input.user_id,
      username: input.username ?? profile.username,
      password_changed: !!input.password,
    },
    200,
  );
});

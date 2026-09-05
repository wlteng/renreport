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

const requestSchema = z.object({
  full_name: z.string().trim().min(1).max(120),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(32)
    .regex(/^[a-z0-9][a-z0-9_-]*$/),
  password: z.string().min(8).max(128),
  job_title: z.preprocess(emptyToUndefined, z.string().trim().max(120).optional().nullable()),
  resume: z.preprocess(emptyToUndefined, z.string().trim().max(5000).optional().nullable()),
  department_id: z.preprocess(emptyToUndefined, z.string().uuid().optional().nullable()),
  role: z.literal("staff").default("staff"),
  salary_amount: z.number().min(0).max(999999999999.99).default(0),
  salary_type: z.enum(["monthly", "hourly", "daily"]).default("monthly"),
  currency: z.enum(["CNY", "RUB", "USD", "MYR"]).default("USD"),
  standard_hours: z.number().positive().max(744).default(160),
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
    return json({ error: "Only an active administrator can create staff accounts" }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON" }, 400);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid staff details" }, 400);
  }

  const input = parsed.data;
  const authEmail = `${input.username}@${staffLoginDomain}`;
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: authEmail,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.full_name, username: input.username },
  });
  if (createError || !created.user) {
    return json({ error: createError?.message ?? "Could not create staff account" }, 400);
  }

  const userId = created.user.id;
  try {
    const profileUpdate: Record<string, string | boolean | null> = {
      email: authEmail,
      username: input.username,
      full_name: input.full_name,
      job_title: input.job_title || null,
      department_id: input.department_id || null,
      is_active: true,
    };
    if (input.resume) profileUpdate.resume = input.resume;

    const { error: profileError } = await adminClient
      .from("profiles")
      .update(profileUpdate)
      .eq("id", userId)
      .select("id")
      .single();
    if (profileError) throw profileError;

    const { error: deleteRoleError } = await adminClient
      .from("user_roles")
      .delete()
      .eq("user_id", userId);
    if (deleteRoleError) throw deleteRoleError;

    const { error: roleInsertError } = await adminClient.from("user_roles").insert({
      user_id: userId,
      role: input.role,
      granted_by: callerId,
    });
    if (roleInsertError) throw roleInsertError;

    const { error: compensationError } = await adminClient.from("staff_compensation").upsert({
      user_id: userId,
      salary_amount: input.salary_amount,
      salary_type: input.salary_type,
      currency: input.currency,
      standard_hours: input.standard_hours,
    });
    if (compensationError) throw compensationError;
  } catch (error) {
    await adminClient.auth.admin.deleteUser(userId);
    const message = error instanceof Error ? error.message : "Staff setup failed";
    return json({ error: `Account was rolled back: ${message}` }, 500);
  }

  return json({ user_id: userId, username: input.username }, 201);
});

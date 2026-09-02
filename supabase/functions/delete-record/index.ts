import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.112.4";
import { z } from "npm:zod@3.24.2";

// Deletes a work log (author, inside its edit window) or a whole project (admin)
// together with every photo stored for the affected work logs. Row-level
// security still decides whether the row may go; this function only adds the
// storage cleanup that SQL alone cannot do.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const REPORT_IMAGE_BUCKET = "report-images";
const REMOVE_BATCH = 100;

const requestSchema = z.object({
  kind: z.enum(["report", "project"]),
  id: z.string().uuid(),
});

const env = (name: string) => {
  const deno = globalThis as typeof globalThis & {
    Deno?: { env: { get: (key: string) => string | undefined } };
  };
  return deno.Deno?.env.get(name);
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Removes every file stored under the given report folders. Returns how many were removed. */
async function purgeReportFolders(
  admin: SupabaseClient,
  folders: { userId: string; reportId: string }[],
) {
  const paths: string[] = [];
  for (const folder of folders) {
    const prefix = `${folder.userId}/${folder.reportId}`;
    const { data, error } = await admin.storage
      .from(REPORT_IMAGE_BUCKET)
      .list(prefix, { limit: 1000 });
    if (error) throw error;
    for (const item of data ?? []) paths.push(`${prefix}/${item.name}`);
  }
  for (let index = 0; index < paths.length; index += REMOVE_BATCH) {
    const { error } = await admin.storage
      .from(REPORT_IMAGE_BUCKET)
      .remove(paths.slice(index, index + REMOVE_BATCH));
    if (error) throw error;
  }
  return paths.length;
}

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
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Missing bearer token" }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON" }, 400);
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid request" }, 400);

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = authorization.slice(7);
  const { data: caller, error: callerError } = await callerClient.auth.getUser(token);
  if (callerError || !caller.user) return json({ error: "Invalid or expired session" }, 401);

  if (parsed.data.kind === "report") {
    const { data: report, error: reportError } = await callerClient
      .from("reports")
      .select("id, user_id")
      .eq("id", parsed.data.id)
      .maybeSingle();
    if (reportError) return json({ error: "Could not load work log" }, 500);
    if (!report) return json({ error: "Work log not found" }, 404);
    if (report.user_id !== caller.user.id) {
      return json({ error: "Only the author can delete this work log" }, 403);
    }

    // Row-level security enforces the one-hour edit window and the submit capability.
    const { data: deleted, error: deleteError } = await callerClient
      .from("reports")
      .delete()
      .eq("id", report.id)
      .select("id");
    if (deleteError) return json({ error: "Could not delete work log" }, 500);
    if (!deleted?.length) {
      return json({ error: "This work log can no longer be deleted" }, 403);
    }

    try {
      const files = await purgeReportFolders(adminClient, [
        { userId: report.user_id, reportId: report.id },
      ]);
      return json({ deleted: true, files });
    } catch {
      return json({ deleted: true, files: 0, warning: "Work log deleted but some photos remain" });
    }
  }

  const { data: adminRole } = await adminClient
    .from("user_roles")
    .select("id")
    .eq("user_id", caller.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!adminRole) return json({ error: "Only admins can delete projects" }, 403);

  const { data: project, error: projectError } = await adminClient
    .from("projects")
    .select("id, name")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (projectError) return json({ error: "Could not load project" }, 500);
  if (!project) return json({ error: "Project not found" }, 404);

  const { data: reports, error: reportsError } = await adminClient
    .from("reports")
    .select("id, user_id")
    .eq("project_id", project.id);
  if (reportsError) return json({ error: "Could not load project work logs" }, 500);

  // Row-level security allows only active admins to delete; everything under the
  // project cascades in the database.
  const { data: deleted, error: deleteError } = await callerClient
    .from("projects")
    .delete()
    .eq("id", project.id)
    .select("id");
  if (deleteError) return json({ error: "Could not delete project" }, 500);
  if (!deleted?.length) return json({ error: "You are not allowed to delete this project" }, 403);

  let files = 0;
  let warning: string | undefined;
  try {
    files = await purgeReportFolders(
      adminClient,
      (reports ?? []).map((item) => ({ userId: item.user_id, reportId: item.id })),
    );
  } catch {
    warning = "Project deleted but some photos remain";
  }

  await adminClient.from("admin_audit_log").insert({
    event_type: "project_deleted",
    actor_id: caller.user.id,
    summary: `Deleted project "${project.name}" with ${(reports ?? []).length} work logs and ${files} photos`,
    metadata: {
      project_id: project.id,
      project_name: project.name,
      work_logs: (reports ?? []).length,
      photos: files,
    },
  });

  return json({ deleted: true, reports: (reports ?? []).length, files, warning });
});

import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { z } from "npm:zod@3.24.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const requestSchema = z.object({ projectId: z.string().uuid() });

type GitHubCommit = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name: string; date: string } | null;
    committer: { name: string; date: string } | null;
  };
  author: { login: string } | null;
};

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

function githubRepository(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") return null;
    const [owner, rawRepo, ...rest] = url.pathname.split("/").filter(Boolean);
    if (!owner || !rawRepo || rest.length) return null;
    const repo = rawRepo.replace(/\.git$/i, "");
    return repo ? { owner, repo } : null;
  } catch {
    return null;
  }
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
  if (!parsed.success) return json({ error: "Invalid project" }, 400);

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

  const { data: project, error: projectError } = await callerClient
    .from("projects")
    .select("id, category, repository_url")
    .eq("id", parsed.data.projectId)
    .single();
  if (projectError || !project) return json({ error: "Project not found or not visible" }, 404);
  if (project.category !== "website") {
    return json({ error: "GitHub activity is available only for Website projects" }, 400);
  }
  if (!project.repository_url) return json({ error: "Add a Git repository URL first" }, 400);

  const repository = githubRepository(project.repository_url);
  if (!repository) return json({ error: "Use a public GitHub repository URL" }, 400);
  const repositoryFullName = `${repository.owner}/${repository.repo}`.toLowerCase();

  const { data: lastSync } = await adminClient
    .from("project_git_events")
    .select("synced_at")
    .eq("project_id", project.id)
    .eq("repository_full_name", repositoryFullName)
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastSync && Date.now() - new Date(lastSync.synced_at).getTime() < 5 * 60 * 1000) {
    return json({ synced: 0, cached: true });
  }

  const githubHeaders: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "Ren-Report",
    "X-GitHub-Api-Version": "2026-03-10",
  };
  const githubToken = env("GITHUB_TOKEN");
  if (githubToken) githubHeaders.Authorization = `Bearer ${githubToken}`;

  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/commits?per_page=20`,
    { headers: githubHeaders },
  );
  if (!response.ok) {
    const message =
      response.status === 404
        ? "Public GitHub repository not found"
        : response.status === 403 || response.status === 429
          ? "GitHub rate limit reached. Try again later"
          : "Could not load GitHub commits";
    return json({ error: message }, response.status === 404 ? 404 : 502);
  }

  const commits = (await response.json()) as GitHubCommit[];
  const syncedAt = new Date().toISOString();
  const events = commits.map((item) => {
    const [title, ...details] = item.commit.message.split("\n");
    return {
      project_id: project.id,
      provider: "github",
      repository_full_name: repositoryFullName,
      external_id: item.sha,
      title: title.trim().slice(0, 500),
      description: details.join("\n").trim().slice(0, 10000) || null,
      author_name:
        item.author?.login || item.commit.author?.name || item.commit.committer?.name || null,
      event_url: item.html_url,
      occurred_at:
        item.commit.author?.date || item.commit.committer?.date || new Date().toISOString(),
      synced_at: syncedAt,
    };
  });

  const { error: cleanupError } = await adminClient
    .from("project_git_events")
    .delete()
    .eq("project_id", project.id)
    .neq("repository_full_name", repositoryFullName);
  if (cleanupError) return json({ error: "Could not update GitHub activity" }, 500);

  if (events.length) {
    const { error: insertError } = await adminClient
      .from("project_git_events")
      .upsert(events, { onConflict: "project_id,provider,external_id" });
    if (insertError) return json({ error: "Could not save GitHub activity" }, 500);
  }

  return json({ synced: events.length });
});

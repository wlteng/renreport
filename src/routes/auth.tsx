import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { LanguageToggle } from "@/components/LanguageToggle";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/lib/i18n";
import { loginIdentifierToEmail } from "@/lib/staffAuth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Ren Report" },
      { name: "description", content: "Sign in to the Ren Report gold mining operations log." },
      { property: "og:title", content: "Sign in — Ren Report" },
      { property: "og:description", content: "Access your gold mining operations workspace." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginIdentifierToEmail(identifier),
        password,
      });
      if (error) throw error;
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Something went wrong"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <LanguageToggle className="absolute right-4 top-4" />
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/icons/icon-192.png" alt="" className="mx-auto mb-3 size-16 rounded-2xl" />
          <div className="text-lg font-semibold tracking-tight">Ren Report</div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Gold mining work, projects and expenses.")}
          </p>
        </div>

        <div className="logbook-card p-6">
          <h2 className="mb-1 text-base font-semibold">{t("Sign in")}</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            {t("Staff accounts and temporary passwords are created by an administrator.")}
          </p>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="identifier">{t("Username or email")}</Label>
              <Input
                id="identifier"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="username or you@company.com"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t("Password")}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? t("Please wait…") : t("Sign in")}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

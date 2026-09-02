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

type AuthMode = "signin" | "forgot" | "recovery";

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
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<AuthMode>("signin");

  useEffect(() => {
    const recoveryLink =
      window.location.search.includes("recovery=1") ||
      window.location.hash.includes("type=recovery");
    if (recoveryLink) setMode("recovery");

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("recovery");
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && !recoveryLink) navigate({ to: "/dashboard", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "forgot") {
        if (!identifier.includes("@")) throw new Error(t("Enter your account email address."));
        const { error } = await supabase.auth.resetPasswordForEmail(identifier.trim(), {
          redirectTo: `${window.location.origin}/auth?recovery=1`,
        });
        if (error) throw error;
        toast.success(t("Password reset link sent."));
        setMode("signin");
        return;
      }

      if (mode === "recovery") {
        if (password.length < 8) throw new Error(t("Password must be at least 8 characters."));
        if (password !== confirmPassword) throw new Error(t("Passwords do not match."));
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        await supabase.auth.signOut();
        toast.success(t("Password updated. Sign in with your new password."));
        setPassword("");
        setConfirmPassword("");
        setMode("signin");
        return;
      }

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
    <div className="relative flex min-h-screen items-center justify-center bg-background pb-[max(2.5rem,env(safe-area-inset-bottom,0px))] pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pt-[max(2.5rem,env(safe-area-inset-top,0px))]">
      <LanguageToggle className="absolute right-[max(1rem,env(safe-area-inset-right,0px))] top-[max(1rem,env(safe-area-inset-top,0px))]" />
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/icons/icon-192.png" alt="" className="mx-auto mb-3 size-16 rounded-2xl" />
          <div className="text-lg font-semibold tracking-tight">{t("Ren Report")}</div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Gold mining work, projects and expenses.")}
          </p>
        </div>

        <div className="logbook-card p-6">
          <h2 className="mb-1 text-base font-semibold">
            {t(
              mode === "forgot"
                ? "Reset password"
                : mode === "recovery"
                  ? "Choose a new password"
                  : "Sign in",
            )}
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            {t(
              mode === "forgot"
                ? "Enter your account email to receive a recovery link. Username-only staff accounts must contact an administrator."
                : mode === "recovery"
                  ? "Use at least 8 characters for your new password."
                  : "Staff accounts and temporary passwords are created by an administrator.",
            )}
          </p>
          <form onSubmit={submit} className="space-y-4">
            {mode !== "recovery" ? (
              <div className="space-y-1.5">
                <Label htmlFor="identifier">
                  {t(mode === "forgot" ? "Email" : "Username or email")}
                </Label>
                <Input
                  id="identifier"
                  type={mode === "forgot" ? "email" : "text"}
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder={
                    mode === "forgot" ? "you@company.com" : "username or you@company.com"
                  }
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  required
                />
              </div>
            ) : null}
            {mode !== "forgot" ? (
              <div className="space-y-1.5">
                <Label htmlFor="password">
                  {t(mode === "recovery" ? "New password" : "Password")}
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === "recovery" ? "new-password" : "current-password"}
                  minLength={mode === "recovery" ? 8 : undefined}
                  required
                />
              </div>
            ) : null}
            {mode === "recovery" ? (
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">{t("Confirm new password")}</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
            ) : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy
                ? t("Please wait…")
                : t(
                    mode === "forgot"
                      ? "Send recovery link"
                      : mode === "recovery"
                        ? "Update password"
                        : "Sign in",
                  )}
            </Button>
            {mode === "signin" ? (
              <Button
                type="button"
                variant="link"
                className="h-auto w-full p-0"
                onClick={() => setMode("forgot")}
              >
                {t("Forgot password?")}
              </Button>
            ) : null}
            {mode === "forgot" ? (
              <Button
                type="button"
                variant="link"
                className="h-auto w-full p-0"
                onClick={() => setMode("signin")}
              >
                {t("Back to sign in")}
              </Button>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}

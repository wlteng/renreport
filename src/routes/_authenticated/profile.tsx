import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useSession";
import { useDepartments } from "@/hooks/useData";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/roles";
import { useLanguage } from "@/lib/i18n";
import { isStaffLoginEmail, staffLoginLabel } from "@/lib/staffAuth";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Ren Report" },
      { name: "description", content: "Your account details and current access level." },
      { property: "og:title", content: "Profile — Ren Report" },
      { property: "og:description", content: "Manage your Ren Report account details." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, profile, roles } = useMe();
  const { t } = useLanguage();
  const departments = useDepartments();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? "");
    setJobTitle(profile.job_title ?? "");
    setPhone(profile.phone ?? "");
  }, [profile]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName, job_title: jobTitle, phone })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("Profile updated"));
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["people"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  const deptName =
    (departments.data ?? []).find((d) => d.id === profile?.department_id)?.name ?? t("Unassigned");

  return (
    <>
      <PageHeader title="Profile" />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <form
          className="logbook-card space-y-5 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="name">{t("Full name")}</Label>
            <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="job">{t("Job title")}</Label>
            <Input id="job" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">{t("Phone")}</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>
              {t(profile?.email && isStaffLoginEmail(profile.email) ? "Username" : "Email")}
            </Label>
            <Input value={profile?.email ? staffLoginLabel(profile.email) : ""} readOnly disabled />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? t("Saving…") : t("Save changes")}
            </Button>
          </div>
        </form>

        <div className="logbook-card h-fit p-6">
          <p className="logbook-label">{t("Access")}</p>
          <div className="mt-3 space-y-3">
            {roles.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("No role assigned yet.")}</p>
            ) : (
              roles.map((r) => (
                <div key={r}>
                  <p className="text-sm font-medium">{t(ROLE_LABEL[r])}</p>
                  <p className="text-xs text-muted-foreground">{t(ROLE_DESCRIPTION[r])}</p>
                </div>
              ))
            )}
            <div className="border-t border-border pt-3">
              <p className="logbook-label">{t("Department")}</p>
              <p className="mt-1 text-sm">{deptName}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("Roles and departments are set by an admin.")}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

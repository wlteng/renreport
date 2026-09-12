import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useSession";
import { useDepartments } from "@/hooks/useData";
import { AVATAR_ACCEPT, AVATAR_BUCKET, isAllowedAvatar, uploadAvatarFile } from "@/lib/avatars";
import { personInitials } from "@/lib/people";
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
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? "");
    setPhone(profile.phone ?? "");
  }, [profile]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName, phone })
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

  const avatarInput = useRef<HTMLInputElement>(null);
  const uploadAvatar = useMutation({
    mutationFn: async (original: File) => {
      if (!user) throw new Error("Your session has expired");
      if (!isAllowedAvatar(original)) {
        throw new Error(t("Use JPG, PNG or WebP under 5 MB"));
      }
      const { path, url } = await uploadAvatarFile(user.id, original);
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: url, avatar_path: path })
        .eq("id", user.id);
      if (updateError) {
        await supabase.storage.from(AVATAR_BUCKET).remove([path]);
        throw updateError;
      }
      const previous = profile?.avatar_path;
      if (previous) await supabase.storage.from(AVATAR_BUCKET).remove([previous]);
    },
    onSuccess: () => {
      toast.success(t("Photo updated"));
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["people"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("Could not update photo")),
  });

  const removeAvatar = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Your session has expired");
      const previous = profile?.avatar_path;
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null, avatar_path: null })
        .eq("id", user.id);
      if (error) throw error;
      if (previous) await supabase.storage.from(AVATAR_BUCKET).remove([previous]);
    },
    onSuccess: () => {
      toast.success(t("Photo removed"));
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["people"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("Could not update photo")),
  });

  // The username is stored on the profile now; fall back to the local part of a
  // synthetic staff address for accounts created before that column existed.
  const loginLabel = profile?.username
    ? { kind: "username" as const, value: profile.username }
    : profile?.email && isStaffLoginEmail(profile.email)
      ? { kind: "username" as const, value: staffLoginLabel(profile.email) }
      : { kind: "email" as const, value: profile?.email ?? "" };

  const deptName =
    (departments.data ?? []).find((d) => d.id === profile?.department_id)?.name ?? t("Unassigned");

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

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
          <div className="flex items-center gap-4">
            <Avatar className="size-16 border border-border">
              <AvatarImage src={profile?.avatar_url ?? undefined} alt="" />
              <AvatarFallback className="text-base font-semibold">
                {personInitials(profile?.full_name, profile?.email)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploadAvatar.isPending}
                onClick={() => avatarInput.current?.click()}
              >
                <ImagePlus />
                {uploadAvatar.isPending ? t("Uploading…") : t("Change photo")}
              </Button>
              {profile?.avatar_url ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={removeAvatar.isPending}
                  onClick={() => removeAvatar.mutate()}
                >
                  {t("Remove photo")}
                </Button>
              ) : null}
              <input
                ref={avatarInput}
                type="file"
                accept={AVATAR_ACCEPT}
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) uploadAvatar.mutate(file);
                  event.target.value = "";
                }}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">{t("Full name")}</Label>
            <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">{t("Phone")}</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t(loginLabel.kind === "username" ? "Username" : "Email")}</Label>
            <Input value={loginLabel.value} readOnly disabled />
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
            <div className="border-t border-border pt-3">
              <p className="logbook-label">{t("Job title")}</p>
              <p className="mt-1 text-sm">{profile?.job_title || t("Unassigned")}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("Job titles, roles and departments are set by an admin.")}
            </p>
          </div>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        className="mt-6 w-full text-destructive hover:text-destructive sm:w-auto"
        onClick={() => void signOut()}
      >
        <LogOut />
        {t("Sign out")}
      </Button>
    </>
  );
}

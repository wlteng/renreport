import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Code2,
  Factory,
  FolderKanban,
  Globe2,
  HardHat,
  Landmark,
  Pickaxe,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useSession";
import {
  useDepartments,
  useProjectMembers,
  useProjects,
  useStaffDirectory,
  useVisibleReports,
} from "@/hooks/useData";
import { hasCapability } from "@/lib/roles";
import { CURRENCY_OPTIONS } from "@/lib/currencies";
import { useLanguage } from "@/lib/i18n";
import {
  LICENSE_STATUS_LABEL,
  MINING_METHOD_LABEL,
  PROJECT_CATEGORY_LABEL,
  PROJECT_CATEGORY_OPTIONS,
  PROJECT_LEGAL_NAME_LABEL,
  PROJECT_LOCATION_LABEL,
  PROJECT_URL_LABEL,
} from "@/lib/projects";
import { firstValidationError, projectSchema } from "@/lib/validation";

const PROJECT_CATEGORY_ICON: Record<string, LucideIcon> = {
  mine: Pickaxe,
  website: Globe2,
  software: Code2,
  construction: HardHat,
  investment: Landmark,
  operations: Factory,
  other: FolderKanban,
};

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({
    meta: [
      { title: "Projects — Ren Report" },
      { name: "description", content: "Projects, staffing, funding and work activity." },
      { property: "og:title", content: "Projects — Ren Report" },
      { property: "og:description", content: "Project operations and reporting activity." },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const { user, roles, permissions } = useMe();
  const { language, t } = useLanguage();
  const projects = useProjects();
  const departments = useDepartments();
  const people = useStaffDirectory();
  const projectMembers = useProjectMembers();
  const recent = useVisibleReports({});
  const queryClient = useQueryClient();
  const editable = hasCapability(permissions, "manage_projects", roles);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("mine");
  const [projectCode, setProjectCode] = useState("");
  const [legalName, setLegalName] = useState("");
  const [location, setLocation] = useState("");
  const [miningMethod, setMiningMethod] = useState("other");
  const [licenseStatus, setLicenseStatus] = useState("unknown");
  const [reserveKg, setReserveKg] = useState("");
  const [areaKm2, setAreaKm2] = useState("");
  const [projectUrl, setProjectUrl] = useState("");
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [fundAmount, setFundAmount] = useState("");
  const [fundCurrency, setFundCurrency] = useState("USD");
  const legalNameLabel = PROJECT_LEGAL_NAME_LABEL[category] ?? "Legal name";
  const locationLabel = PROJECT_LOCATION_LABEL[category];
  const urlLabel = PROJECT_URL_LABEL[category];

  const staffRestricted = roles.length === 1 && roles[0] === "staff";
  const visibleProjects = useMemo(() => {
    const allProjects = projects.data ?? [];
    if (!staffRestricted || !user) return allProjects;
    const assignedProjectIds = new Set(
      (projectMembers.data ?? [])
        .filter((member) => member.user_id === user.id)
        .map((member) => member.project_id),
    );
    return allProjects.filter((project) => assignedProjectIds.has(project.id));
  }, [projectMembers.data, projects.data, staffRestricted, user]);

  const create = useMutation({
    mutationFn: async () => {
      const parsed = projectSchema.safeParse({
        name,
        category,
        project_code: projectCode,
        legal_name: legalName,
        location,
        mining_method: miningMethod,
        license_status: licenseStatus,
        reserve_kg: reserveKg,
        area_km2: areaKm2,
        url: projectUrl,
        department_id: departmentId,
        description,
        fund_amount: fundAmount,
        fund_currency: fundCurrency,
      });
      if (!parsed.success) throw new Error(firstValidationError(parsed.error));
      if (!user) throw new Error("Your session has expired");
      const input = parsed.data;
      const { error } = await supabase.from("projects").insert({
        ...input,
        owner_id: user.id,
        project_code: input.project_code ?? null,
        legal_name: input.legal_name ?? null,
        location: PROJECT_LOCATION_LABEL[input.category] ? (input.location ?? null) : null,
        mining_method: input.category === "mine" ? input.mining_method : "other",
        license_status: input.category === "mine" ? input.license_status : "unknown",
        reserve_kg: input.category === "mine" ? (input.reserve_kg ?? null) : null,
        area_km2: input.category === "mine" ? (input.area_km2 ?? null) : null,
        url: PROJECT_URL_LABEL[input.category] ? (input.url ?? null) : null,
        department_id: input.department_id ?? null,
        description: input.description ?? null,
        fund_amount: input.fund_amount ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Project created");
      setOpen(false);
      setName("");
      setCategory("mine");
      setProjectCode("");
      setLegalName("");
      setLocation("");
      setMiningMethod("other");
      setLicenseStatus("unknown");
      setReserveKg("");
      setAreaKm2("");
      setProjectUrl("");
      setDescription("");
      setDepartmentId("");
      setFundAmount("");
      setFundCurrency("USD");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not create project"),
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projects").update({ status: "archived" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Project archived");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not archive"),
  });

  const activity = (projectId: string) =>
    (recent.data ?? []).filter((report) => report.project_id === projectId);

  return (
    <>
      <PageHeader
        title="Projects"
        action={
          editable ? <Button onClick={() => setOpen(true)}>{t("New project")}</Button> : undefined
        }
      />

      <Dialog open={open && editable} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("New project")}</DialogTitle>
            <DialogDescription>
              {t("Add the project details, category and starting fund.")}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Project name" id="pname">
                <Input id="pname" value={name} onChange={(event) => setName(event.target.value)} />
              </Field>
              <Field label="Category" id="pcategory">
                <select
                  id="pcategory"
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  {PROJECT_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.label)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Project code" id="pcode">
                <Input
                  id="pcode"
                  value={projectCode}
                  onChange={(event) => setProjectCode(event.target.value)}
                  placeholder={t("Optional unique code")}
                />
              </Field>
              <Field label={legalNameLabel} id="plegal">
                <Input
                  id="plegal"
                  value={legalName}
                  onChange={(event) => setLegalName(event.target.value)}
                />
              </Field>
              {locationLabel ? (
                <Field label={locationLabel} id="plocation">
                  <Input
                    id="plocation"
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                  />
                </Field>
              ) : null}
              {category === "mine" ? (
                <>
                  <Field label="Mining method" id="pmethod">
                    <select
                      id="pmethod"
                      className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                      value={miningMethod}
                      onChange={(event) => setMiningMethod(event.target.value)}
                    >
                      {Object.entries(MINING_METHOD_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {t(label)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="License status" id="plicense">
                    <select
                      id="plicense"
                      className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                      value={licenseStatus}
                      onChange={(event) => setLicenseStatus(event.target.value)}
                    >
                      {Object.entries(LICENSE_STATUS_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {t(label)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Estimated reserve (kg)" id="preserve">
                    <Input
                      id="preserve"
                      type="number"
                      min="0"
                      step="0.001"
                      value={reserveKg}
                      onChange={(event) => setReserveKg(event.target.value)}
                    />
                  </Field>
                  <Field label="Area (km²)" id="parea">
                    <Input
                      id="parea"
                      type="number"
                      min="0"
                      step="0.001"
                      value={areaKm2}
                      onChange={(event) => setAreaKm2(event.target.value)}
                    />
                  </Field>
                </>
              ) : null}
              {urlLabel ? (
                <Field label={urlLabel} id="pproject-url">
                  <Input
                    id="pproject-url"
                    type="url"
                    inputMode="url"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={projectUrl}
                    placeholder="https://example.com"
                    onChange={(event) => setProjectUrl(event.target.value)}
                  />
                </Field>
              ) : null}
              <Field label="Department" id="pdept">
                <select
                  id="pdept"
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                  value={departmentId}
                  onChange={(event) => setDepartmentId(event.target.value)}
                >
                  <option value="">{t("None")}</option>
                  {(departments.data ?? []).map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Starting fund" id="pfund">
                <Input
                  id="pfund"
                  type="number"
                  min="0"
                  step="0.01"
                  value={fundAmount}
                  placeholder={t("Optional")}
                  onChange={(event) => setFundAmount(event.target.value)}
                />
              </Field>
              <Field label="Fund currency" id="pfund-currency">
                <select
                  id="pfund-currency"
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                  value={fundCurrency}
                  onChange={(event) => setFundCurrency(event.target.value)}
                >
                  {CURRENCY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.label)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Description" id="pdesc">
              <Textarea
                id="pdesc"
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <DialogFooter className="flex-row gap-2 sm:gap-0">
              <DialogClose asChild>
                <Button type="button" variant="outline" className="flex-1 sm:flex-none">
                  {t("Cancel")}
                </Button>
              </DialogClose>
              <Button type="submit" className="flex-1 sm:flex-none" disabled={create.isPending}>
                {create.isPending ? t("Creating…") : t("Create project")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {projects.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("Loading projects…")}</p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {visibleProjects.map((project) => {
          const projectCategory = project.category ?? "mine";
          const CategoryIcon = PROJECT_CATEGORY_ICON[projectCategory] ?? FolderKanban;
          const projectLegalNameLabel = PROJECT_LEGAL_NAME_LABEL[projectCategory] ?? "Legal name";
          const projectLocationLabel = PROJECT_LOCATION_LABEL[projectCategory];
          const projectUrlLabel = PROJECT_URL_LABEL[projectCategory];
          const items = activity(project.id);
          const hours = items.reduce((sum, report) => sum + Number(report.hours_spent), 0);
          const assignedCount = (projectMembers.data ?? []).filter(
            (member) => member.project_id === project.id,
          ).length;
          const owner = people.data?.find((person) => person.id === project.owner_id);
          return (
            <article
              key={project.id}
              className="logbook-card group relative isolate cursor-pointer p-5 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-raise"
            >
              <Link
                to="/projects/$projectId"
                params={{ projectId: project.id }}
                aria-label={`Open ${project.name}`}
                className="absolute inset-0 z-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
              <div className="pointer-events-none relative z-10 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
                    <CategoryIcon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold group-hover:underline">
                      {project.name}
                    </h2>
                    <p className="logbook-label mt-1">
                      {t(
                        PROJECT_CATEGORY_LABEL[project.category ?? "mine"] ??
                          project.category ??
                          "Mine",
                      )}{" "}
                      · {project.project_code || t("No code")} · {t(project.status)}
                    </p>
                  </div>
                </div>
                <div className="pointer-events-auto flex shrink-0 items-center gap-1">
                  {editable && project.status !== "archived" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => archive.mutate(project.id)}
                    >
                      {t("Archive")}
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="pointer-events-none relative z-10 mt-4 grid grid-cols-2 gap-3 text-xs">
                <Detail
                  label="Category"
                  value={
                    PROJECT_CATEGORY_LABEL[project.category ?? "mine"] ?? project.category ?? "Mine"
                  }
                />
                {projectLocationLabel ? (
                  <Detail label={projectLocationLabel} value={project.location || "—"} />
                ) : null}
                {projectCategory === "mine" ? (
                  <>
                    <Detail
                      label="Method"
                      value={MINING_METHOD_LABEL[project.mining_method] ?? project.mining_method}
                    />
                    <Detail
                      label="License"
                      value={LICENSE_STATUS_LABEL[project.license_status] ?? project.license_status}
                    />
                  </>
                ) : null}
                {projectUrlLabel ? (
                  <Detail label={projectUrlLabel} value={project.url || "—"} />
                ) : null}
                <Detail label={projectLegalNameLabel} value={project.legal_name || "—"} />
              </div>
              {project.description ? (
                <p className="pointer-events-none relative z-10 mt-4 text-sm leading-relaxed text-muted-foreground">
                  {project.description}
                </p>
              ) : null}
              <p className="pointer-events-none relative z-10 mt-4 text-xs text-muted-foreground">
                {language === "zh"
                  ? `${items.length} 份工作日志 · 已报告 ${hours.toFixed(1)} 小时 · ${assignedCount} 名员工`
                  : `${items.length} work logs · ${hours.toFixed(1)}h reported · ${assignedCount} staff`}
              </p>
              <p className="pointer-events-none relative z-10 mt-1 text-xs text-muted-foreground">
                {language === "zh" ? "创建者" : "Created by"}{" "}
                {owner?.full_name || owner?.email || t("Unknown user")}
              </p>
            </article>
          );
        })}
        {!projects.isLoading && visibleProjects.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {language === "zh"
              ? staffRestricted
                ? "尚未分配任何项目。"
                : editable
                  ? "尚无项目 — 请创建第一个项目。"
                  : "尚无项目。"
              : staffRestricted
                ? "No projects assigned to you."
                : `No projects yet${editable ? " — create the first one." : "."}`}
          </p>
        ) : null}
      </div>
    </>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  const { t } = useLanguage();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{t(label)}</Label>
      {children}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const { t } = useLanguage();
  return (
    <div>
      <p className="logbook-label">{t(label)}</p>
      <p className="mt-1 break-all text-muted-foreground">{t(value)}</p>
    </div>
  );
}

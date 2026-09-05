import { X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Department, PersonRow, ProjectRow } from "@/hooks/useData";
import { CURRENCY_OPTIONS } from "@/lib/currencies";
import { useLanguage } from "@/lib/i18n";
import {
  LICENSE_STATUS_LABEL,
  MINING_METHOD_LABEL,
  PROJECT_CATEGORY_OPTIONS,
  PROJECT_LEGAL_NAME_LABEL,
  PROJECT_LOCATION_LABEL,
  PROJECT_STATUS_LABEL,
  PROJECT_URL_LABEL,
} from "@/lib/projects";
import { personDisplayName } from "@/lib/people";
import { staffLoginLabel } from "@/lib/staffAuth";
import { firstValidationError, projectSchema } from "@/lib/validation";

const NONE = "__none__";
const ALL_DEPARTMENTS = "__all_departments__";
const NO_DEPARTMENT = "__no_department__";
const NO_MEMBERS: string[] = [];

type ProjectStatus = ProjectRow["status"];

export type ProjectEditorValue = {
  name: string;
  category: string;
  project_code: string | null;
  legal_name: string | null;
  location: string | null;
  mining_method: string;
  license_status: string;
  reserve_kg: number | null;
  area_km2: number | null;
  url: string | null;
  repository_url: string | null;
  department_id: string | null;
  description: string | null;
  fund_amount: number | null;
  fund_currency: string;
  status: ProjectStatus;
  owner_id: string | null;
  color: string | null;
};

type ProjectOwnerOption = Pick<PersonRow, "id" | "email" | "full_name">;
type ProjectMemberOption = Pick<
  PersonRow,
  "id" | "email" | "full_name" | "job_title" | "department_id" | "is_active"
>;

type ProjectForm = {
  name: string;
  category: string;
  projectCode: string;
  legalName: string;
  location: string;
  miningMethod: string;
  licenseStatus: string;
  reserveKg: string;
  areaKm2: string;
  url: string;
  repositoryUrl: string;
  departmentId: string;
  description: string;
  fundAmount: string;
  fundCurrency: string;
  status: ProjectStatus;
  ownerId: string;
  color: string;
};

function emptyForm(defaultOwnerId?: string): ProjectForm {
  return {
    name: "",
    category: "mine",
    projectCode: "",
    legalName: "",
    location: "",
    miningMethod: "other",
    licenseStatus: "unknown",
    reserveKg: "",
    areaKm2: "",
    url: "",
    repositoryUrl: "",
    departmentId: "",
    description: "",
    fundAmount: "",
    fundCurrency: "USD",
    status: "active",
    ownerId: defaultOwnerId ?? "",
    color: "",
  };
}

function formFromProject(project: ProjectRow, defaultOwnerId?: string): ProjectForm {
  return {
    name: project.name,
    category: project.category ?? "mine",
    projectCode: project.project_code ?? "",
    legalName: project.legal_name ?? "",
    location: project.location ?? "",
    miningMethod: project.mining_method ?? "other",
    licenseStatus: project.license_status ?? "unknown",
    reserveKg: project.reserve_kg === null ? "" : String(project.reserve_kg),
    areaKm2: project.area_km2 === null ? "" : String(project.area_km2),
    url: project.url ?? "",
    repositoryUrl: project.repository_url ?? "",
    departmentId: project.department_id ?? "",
    description: project.description ?? "",
    fundAmount: project.fund_amount === null ? "" : String(project.fund_amount),
    fundCurrency: project.fund_currency ?? "USD",
    status: project.status,
    ownerId: project.owner_id ?? defaultOwnerId ?? "",
    color: project.color ?? "",
  };
}

export function ProjectEditorDialog({
  open,
  onOpenChange,
  project,
  defaultOwnerId,
  departments,
  people = [],
  assignablePeople,
  initialMemberIds = NO_MEMBERS,
  showAdminFields = false,
  pending = false,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: ProjectRow | undefined;
  defaultOwnerId?: string | undefined;
  departments: Department[];
  people?: ProjectOwnerOption[] | undefined;
  assignablePeople?: ProjectMemberOption[] | undefined;
  initialMemberIds?: string[] | undefined;
  showAdminFields?: boolean | undefined;
  pending?: boolean | undefined;
  onSubmit: (value: ProjectEditorValue, memberIds: string[]) => void;
}) {
  const { t } = useLanguage();
  const [form, setForm] = useState<ProjectForm>(() =>
    project ? formFromProject(project, defaultOwnerId) : emptyForm(defaultOwnerId),
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>(initialMemberIds);
  const [memberDepartmentFilter, setMemberDepartmentFilter] = useState(ALL_DEPARTMENTS);

  useEffect(() => {
    if (!open) return;
    setForm(project ? formFromProject(project, defaultOwnerId) : emptyForm(defaultOwnerId));
    setMemberIds(initialMemberIds);
    setMemberDepartmentFilter(ALL_DEPARTMENTS);
    setValidationError(null);
  }, [defaultOwnerId, initialMemberIds, open, project]);

  const update = <Key extends keyof ProjectForm>(key: Key, value: ProjectForm[Key]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const legalNameLabel = PROJECT_LEGAL_NAME_LABEL[form.category] ?? "Legal name";
  const locationLabel = PROJECT_LOCATION_LABEL[form.category];
  const urlLabel = PROJECT_URL_LABEL[form.category];
  const title = project ? "Edit project" : "New project";
  const memberIdSet = useMemo(() => new Set(memberIds), [memberIds]);
  const selectedPeople = useMemo(
    () => (assignablePeople ?? []).filter((person) => memberIdSet.has(person.id)),
    [assignablePeople, memberIdSet],
  );
  const filteredPeople = useMemo(
    () =>
      (assignablePeople ?? []).filter((person) => {
        if (!person.is_active && !memberIdSet.has(person.id)) return false;
        if (memberDepartmentFilter === ALL_DEPARTMENTS) return true;
        if (memberDepartmentFilter === NO_DEPARTMENT) return !person.department_id;
        return person.department_id === memberDepartmentFilter;
      }),
    [assignablePeople, memberDepartmentFilter, memberIdSet],
  );

  function toggleMember(personId: string, selected: boolean) {
    setMemberIds((current) =>
      selected
        ? current.includes(personId)
          ? current
          : [...current, personId]
        : current.filter((id) => id !== personId),
    );
  }

  function submit() {
    const parsed = projectSchema.safeParse({
      name: form.name,
      category: form.category,
      project_code: form.projectCode,
      legal_name: form.legalName,
      location: form.location,
      mining_method: form.miningMethod,
      license_status: form.licenseStatus,
      reserve_kg: form.reserveKg,
      area_km2: form.areaKm2,
      url: form.url,
      repository_url: form.repositoryUrl,
      department_id: form.departmentId,
      description: form.description,
      fund_amount: form.fundAmount,
      fund_currency: form.fundCurrency,
    });
    if (!parsed.success) {
      setValidationError(firstValidationError(parsed.error));
      return;
    }
    const input = parsed.data;
    setValidationError(null);
    onSubmit(
      {
        name: input.name,
        category: input.category,
        project_code: input.project_code ?? null,
        legal_name: input.legal_name ?? null,
        location: PROJECT_LOCATION_LABEL[input.category] ? (input.location ?? null) : null,
        mining_method: input.category === "mine" ? input.mining_method : "other",
        license_status: input.category === "mine" ? input.license_status : "unknown",
        reserve_kg: input.category === "mine" ? (input.reserve_kg ?? null) : null,
        area_km2: input.category === "mine" ? (input.area_km2 ?? null) : null,
        url: PROJECT_URL_LABEL[input.category] ? (input.url ?? null) : null,
        repository_url: input.category === "website" ? (input.repository_url ?? null) : null,
        department_id: input.department_id ?? null,
        description: input.description ?? null,
        fund_amount: input.fund_amount ?? null,
        fund_currency: input.fund_currency,
        status: showAdminFields ? form.status : (project?.status ?? "active"),
        owner_id: showAdminFields
          ? form.ownerId || null
          : (project?.owner_id ?? defaultOwnerId ?? null),
        color: showAdminFields ? form.color.trim() || null : (project?.color ?? null),
      },
      memberIds,
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t(title)}</DialogTitle>
          <DialogDescription>
            {t(
              showAdminFields
                ? "Manage all project details, ownership, status and funding."
                : project
                  ? "Update the project details, category and starting fund."
                  : "Add the project details, category and starting fund.",
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Project name" id="project-editor-name">
              <Input
                id="project-editor-name"
                autoFocus
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
              />
            </Field>
            <Field label="Category" id="project-editor-category">
              <Select value={form.category} onValueChange={(value) => update("category", value)}>
                <SelectTrigger id="project-editor-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_CATEGORY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {showAdminFields ? (
              <>
                <Field label="Status" id="project-editor-status">
                  <Select
                    value={form.status}
                    onValueChange={(value) => update("status", value as ProjectStatus)}
                  >
                    <SelectTrigger id="project-editor-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PROJECT_STATUS_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {t(label)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Owner" id="project-editor-owner">
                  <Select
                    value={form.ownerId || NONE}
                    onValueChange={(value) => update("ownerId", value === NONE ? "" : value)}
                  >
                    <SelectTrigger id="project-editor-owner">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {project ? <SelectItem value={NONE}>{t("Unassigned")}</SelectItem> : null}
                      {people.map((person) => (
                        <SelectItem key={person.id} value={person.id}>
                          {personDisplayName(person, t("Unknown user"))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </>
            ) : null}
            <Field label="Project code" id="project-editor-code">
              <Input
                id="project-editor-code"
                value={form.projectCode}
                placeholder={t("Optional unique code")}
                onChange={(event) => update("projectCode", event.target.value)}
              />
            </Field>
            <Field label={legalNameLabel} id="project-editor-legal-name">
              <Input
                id="project-editor-legal-name"
                value={form.legalName}
                onChange={(event) => update("legalName", event.target.value)}
              />
            </Field>
            {locationLabel ? (
              <Field label={locationLabel} id="project-editor-location">
                <Input
                  id="project-editor-location"
                  value={form.location}
                  onChange={(event) => update("location", event.target.value)}
                />
              </Field>
            ) : null}
            {form.category === "mine" ? (
              <>
                <Field label="Mining method" id="project-editor-method">
                  <Select
                    value={form.miningMethod}
                    onValueChange={(value) => update("miningMethod", value)}
                  >
                    <SelectTrigger id="project-editor-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(MINING_METHOD_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {t(label)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="License status" id="project-editor-license">
                  <Select
                    value={form.licenseStatus}
                    onValueChange={(value) => update("licenseStatus", value)}
                  >
                    <SelectTrigger id="project-editor-license">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(LICENSE_STATUS_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {t(label)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Estimated reserve (kg)" id="project-editor-reserve">
                  <Input
                    id="project-editor-reserve"
                    type="number"
                    min="0"
                    step="0.001"
                    value={form.reserveKg}
                    onChange={(event) => update("reserveKg", event.target.value)}
                  />
                </Field>
                <Field label="Area (km²)" id="project-editor-area">
                  <Input
                    id="project-editor-area"
                    type="number"
                    min="0"
                    step="0.001"
                    value={form.areaKm2}
                    onChange={(event) => update("areaKm2", event.target.value)}
                  />
                </Field>
              </>
            ) : null}
            {urlLabel ? (
              <Field label={urlLabel} id="project-editor-url">
                <Input
                  id="project-editor-url"
                  type="url"
                  inputMode="url"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={form.url}
                  placeholder="https://example.com"
                  onChange={(event) => update("url", event.target.value)}
                />
              </Field>
            ) : null}
            {form.category === "website" ? (
              <Field label="Git repository URL" id="project-editor-repository-url">
                <Input
                  id="project-editor-repository-url"
                  type="url"
                  inputMode="url"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={form.repositoryUrl}
                  placeholder="https://github.com/owner/repository"
                  onChange={(event) => update("repositoryUrl", event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t("Public GitHub repositories only. Commits appear in project Activity.")}
                </p>
              </Field>
            ) : null}
            <Field label="Department" id="project-editor-department">
              <Select
                value={form.departmentId || NONE}
                onValueChange={(value) => update("departmentId", value === NONE ? "" : value)}
              >
                <SelectTrigger id="project-editor-department">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("None")}</SelectItem>
                  {departments.map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Starting fund" id="project-editor-fund">
              <Input
                id="project-editor-fund"
                type="number"
                min="0"
                step="0.01"
                value={form.fundAmount}
                placeholder={t("Optional")}
                onChange={(event) => update("fundAmount", event.target.value)}
              />
            </Field>
            <Field label="Fund currency" id="project-editor-currency">
              <Select
                value={form.fundCurrency}
                onValueChange={(value) => update("fundCurrency", value)}
              >
                <SelectTrigger id="project-editor-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {showAdminFields ? (
              <Field label="Project color" id="project-editor-color">
                <div className="flex items-center gap-2">
                  <Input
                    id="project-editor-color"
                    type="color"
                    value={form.color || "#0f766e"}
                    className="w-16 cursor-pointer px-1"
                    aria-label={t("Project color")}
                    onChange={(event) => update("color", event.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!form.color}
                    onClick={() => update("color", "")}
                  >
                    {t("Clear")}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {form.color || t("Not set")}
                  </span>
                </div>
              </Field>
            ) : null}
          </div>
          <Field label="Description" id="project-editor-description">
            <Textarea
              id="project-editor-description"
              rows={4}
              value={form.description}
              onChange={(event) => update("description", event.target.value)}
            />
          </Field>
          {assignablePeople ? (
            <section className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{t("Project team")}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("Assign people directly to this project.")}
                  </p>
                </div>
                <Badge variant="secondary">
                  {memberIds.length} {t("selected")}
                </Badge>
              </div>

              {selectedPeople.length > 0 ? (
                <div>
                  <p className="logbook-label mb-2">{t("Selected staff")}</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedPeople.map((person) => (
                      <Badge key={person.id} variant="outline" className="gap-1.5 py-1 pl-2.5 pr-1">
                        <span className="max-w-44 truncate">
                          {personDisplayName(person, t("Unknown user"))}
                        </span>
                        <button
                          type="button"
                          className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`${t("Remove from selection")}: ${personDisplayName(person, t("Unknown user"))}`}
                          onClick={() => toggleMember(person.id, false)}
                        >
                          <X className="size-3.5" aria-hidden="true" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              <Field label="Filter staff by department" id="project-member-department-filter">
                <Select value={memberDepartmentFilter} onValueChange={setMemberDepartmentFilter}>
                  <SelectTrigger id="project-member-department-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_DEPARTMENTS}>{t("All departments")}</SelectItem>
                    <SelectItem value={NO_DEPARTMENT}>{t("No department")}</SelectItem>
                    {departments.map((department) => (
                      <SelectItem key={department.id} value={department.id}>
                        {department.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <div className="grid max-h-64 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {filteredPeople.map((person) => {
                  const checked = memberIdSet.has(person.id);
                  const personName = personDisplayName(person, t("Unknown user"));
                  return (
                    <label
                      key={person.id}
                      htmlFor={`project-member-${person.id}`}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/40"
                    >
                      <Checkbox
                        id={`project-member-${person.id}`}
                        checked={checked}
                        onCheckedChange={(value) => toggleMember(person.id, value === true)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{personName}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {person.email ? staffLoginLabel(person.email) : null}
                          {person.job_title ? ` · ${person.job_title}` : ""}
                          {!person.is_active ? ` · ${t("Inactive")}` : ""}
                        </span>
                      </span>
                    </label>
                  );
                })}
                {filteredPeople.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground sm:col-span-2">
                    {t("No staff in this department.")}
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}
          {validationError ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {validationError}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="flex-1 sm:flex-none">
                {t("Cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" className="flex-1 sm:flex-none" disabled={pending}>
              {pending
                ? t(project ? "Saving…" : "Creating…")
                : t(project ? "Save project" : "Create project")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
